import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertCircle,
  Calendar,
  FileText,
  LogIn,
  LogOut,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * ✅ Local type to avoid "Profile not exported" errors.
 * Only include the fields we actually use in this page.
 */
type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone?: string | null;
  role?: string | null;
  company_id?: string | null;
  branch_id?: string | null;
  deleted_at?: string | null;

  // optional permission toggles (if you store them)
  is_attendance_manager?: boolean | null;
  is_returns_handler?: boolean | null;

  // ✅ some DBs still have this boolean
  is_admin?: boolean | null;
};

interface AttendanceRow {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  date: string; // YYYY-MM-DD
  branch_id: string | null;

  // join
  profile?: ProfileRow | null;
}

type BranchContact = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function enumerateDates(from: string, to: string) {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function escapeHtml(str: any) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Turn "Wemah Company Limited" -> "WCL" */
function companyInitials(name: string) {
  const cleaned = String(name || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  if (!cleaned) return "CO";

  const parts = cleaned.split(/\s+/).filter(Boolean);
  const take = parts.slice(0, 3);
  const initials = take.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return initials || "CO";
}

function formatDateLabel(dateStr: string) {
  // dateStr: YYYY-MM-DD
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function urlToDataUrl(url?: string | null): Promise<string | null> {
  const u = (url || "").trim();
  if (!u) return null;

  try {
    const res = await fetch(u, { mode: "cors" });
    if (!res.ok) return null;

    const blob = await res.blob();

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return dataUrl;
  } catch {
    return null;
  }
}

export default function Attendance() {
  const { toast } = useToast();
  const {
    user,
    isAdmin,
    isAttendanceManager,
    profile,
    activeBranchId,
    companyName,
    activeBranchName,
    companyLogoUrl,
  } = useAuth() as any;

  /**
   * ✅ Permissions:
   * - Admin can VIEW the page (reports + exports + tables)
   * - Admin CANNOT clock-in/out anyone
   * - Attendance Manager can VIEW + clock-in/out for staff (scoped to their branch)
   */
  const canView = isAdmin || isAttendanceManager;
  const canClock = !!isAttendanceManager && !isAdmin;

  const today = isoDate(new Date());
  const companyId = (profile as any)?.company_id ?? null;

  /**
   * ✅ Branch scope rules:
   * - Admin: uses activeBranchId (can be null => all branches)
   * - Non-admin (attendance manager): force scope to their own profile.branch_id
   *   (ignores activeBranchId, because staff should not switch branches)
   */
  const scopeBranchId = useMemo(() => {
    if (isAdmin) return activeBranchId ?? null;
    return (profile as any)?.branch_id ?? null;
  }, [isAdmin, activeBranchId, profile]);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [selectedDay, setSelectedDay] = useState<string>(today);

  // weekStart defaults to Monday
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay(); // 0 Sun..6 Sat
    const diffToMon = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMon);
    return isoDate(d);
  });

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const [employees, setEmployees] = useState<ProfileRow[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRow[]>([]);
  const [monthAttendance, setMonthAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Branch contact cache
  const [branchContacts, setBranchContacts] = useState<BranchContact[]>([]);

  const currentHour = new Date().getHours();
  const showAbsentees = currentHour >= 9;

  /* =========================
   * Fetch helpers (scoped)
   * ========================= */

  const fetchEmployeesList = async (): Promise<ProfileRow[]> => {
    if (!companyId) {
      setEmployees([]);
      return [];
    }

    // ✅ Avoid TS deep inference issues
    let q = (supabase as any)
      .from("profiles")
      .select("*")
      .eq("company_id", companyId as any)
      .is("deleted_at", null)
      // ✅ OPTION A: exclude admin from attendance completely
      .neq("role", "admin")
      .neq("is_admin", true)
      .order("full_name");

    // ✅ Staff must always be scoped to their branch; admin uses active selection
    if (scopeBranchId) {
      q = q.eq("branch_id", scopeBranchId as any);
    }

    const { data, error } = await q;
    if (error) throw error;

    const list = (data ?? []) as ProfileRow[];
    setEmployees(list);
    return list;
  };

  const fetchAttendanceForRange = async (from: string, to: string) => {
    if (!companyId) return [];

    // ✅ Avoid TS deep inference issues
    let q = (supabase as any)
      .from("attendance")
      .select(
        `
        id,
        user_id,
        clock_in,
        clock_out,
        date,
        branch_id,
        profile:profiles!inner(
          id,
          user_id,
          full_name,
          phone,
          role,
          is_admin,
          company_id,
          branch_id,
          deleted_at
        )
      `
      )
      .gte("date", from)
      .lte("date", to)
      .eq("profile.company_id", companyId as any)
      .is("profile.deleted_at", null)
      // ✅ keep admin excluded consistently (even if an admin attendance row exists)
      .neq("profile.role", "admin")
      .neq("profile.is_admin", true)
      .order("date", { ascending: false });

    // ✅ Scope attendance rows by branch consistently
    if (scopeBranchId) {
      q = q.eq("profile.branch_id", scopeBranchId as any);
    }

    const { data, error } = await q;
    if (error) throw error;

    return (data ?? []) as AttendanceRow[];
  };

  const fetchBranchContacts = async () => {
    if (!companyId) {
      setBranchContacts([]);
      return [];
    }

    const { data, error } = await (supabase as any)
      .from("branches")
      .select("id,name,address,phone,email,company_id,is_active")
      .eq("company_id", companyId as any);

    if (error) throw error;

    const list = (data ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      email: b.email,
    })) as BranchContact[];

    setBranchContacts(list);
    return list;
  };

  const fetchData = async () => {
    if (!user || !companyId) return;

    setLoading(true);
    try {
      await Promise.all([fetchEmployeesList(), fetchBranchContacts()]);

      const todayRows = await fetchAttendanceForRange(today, today);
      setTodayAttendance(todayRows);

      const [yy, mm] = selectedMonth.split("-");
      const start = `${yy}-${mm}-01`;
      const end = isoDate(new Date(Number(yy), Number(mm), 0)); // last day

      const monthRows = await fetchAttendanceForRange(start, end);
      setMonthAttendance(monthRows);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load attendance",
        variant: "destructive",
      });
      setEmployees([]);
      setTodayAttendance([]);
      setMonthAttendance([]);
      setBranchContacts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, companyId, scopeBranchId, selectedMonth]);

  /* =========================
   * Clock in/out
   * ========================= */

  const clockInEmployee = async (employeeUserId: string) => {
    if (!canClock) {
      toast({
        title: "Not allowed",
        description: "Admins cannot clock staff in/out. Use an Attendance Manager account.",
        variant: "destructive",
      });
      return;
    }

    if (!companyId) {
      toast({ title: "Missing company", variant: "destructive" });
      return;
    }

    if (!scopeBranchId) {
      toast({
        title: "Missing branch",
        description: "Attendance actions require a branch scope.",
        variant: "destructive",
      });
      return;
    }

    // ✅ include company_id + branch_id so RLS + NOT NULL pass
    const payload = {
      user_id: employeeUserId,
      date: today,
      clock_in: new Date().toISOString(),
      company_id: companyId,
      branch_id: scopeBranchId,
    };

    const { error } = await (supabase as any)
      .from("attendance")
      .upsert(payload, { onConflict: "user_id,date" });

    if (error) {
      toast({
        title: "Clock-in failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Clocked In",
      description: `Clock-in recorded at ${new Date().toLocaleTimeString()}`,
    });
    fetchData();
  };

  const clockOutEmployee = async (attendanceId: string) => {
    if (!canClock) {
      toast({
        title: "Not allowed",
        description: "Admins cannot clock staff in/out. Use an Attendance Manager account.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await (supabase as any)
      .from("attendance")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", attendanceId);

    if (error) {
      toast({
        title: "Clock-out failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Clocked Out",
      description: `Clock-out recorded at ${new Date().toLocaleTimeString()}`,
    });
    fetchData();
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateHours = (clockIn: string, clockOut: string | null) => {
    if (!clockOut) return "-";
    const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getEmployeeTodayAttendance = (employeeUserId: string) => {
    return todayAttendance.find((a) => a.user_id === employeeUserId);
  };

  /* =========================
   * Absentees today
   * ========================= */

  const absenteesToday = useMemo(() => {
    if (!showAbsentees) return [];
    const clocked = new Set(todayAttendance.map((a) => a.user_id));
    return employees.filter((emp) => !clocked.has(emp.user_id));
  }, [employees, todayAttendance, showAbsentees]);

  /* =========================
   * Monthly summary (general off-days excluded) ✅ KEEP LOGIC
   * ========================= */

  const monthlySummary = useMemo(() => {
    const [yy, mm] = selectedMonth.split("-");
    const start = `${yy}-${mm}-01`;
    const end = isoDate(new Date(Number(yy), Number(mm), 0));
    const days = enumerateDates(start, end);

    const byDate = new Map<string, Set<string>>();
    for (const row of monthAttendance) {
      const d = String(row.date);
      if (!byDate.has(d)) byDate.set(d, new Set());
      byDate.get(d)!.add(row.user_id);
    }

    const generalOffDays: string[] = [];
    for (const d of days) {
      const set = byDate.get(d);
      if (!set || set.size === 0) generalOffDays.push(d);
    }

    const generalOffSet = new Set(generalOffDays);

    const rows = employees.map((emp) => {
      let presentDays = 0;
      let absentDays = 0;

      for (const d of days) {
        if (generalOffSet.has(d)) continue;
        const set = byDate.get(d);
        if (set && set.has(emp.user_id)) presentDays++;
        else absentDays++;
      }

      return {
        id: emp.id,
        user_id: emp.user_id,
        full_name: emp.full_name,
        phone: emp.phone,
        presentDays,
        absentDays,
        hasAbsences: absentDays > 0,
      };
    });

    return {
      rows,
      generalOffDaysCount: generalOffDays.length,
      generalOffDays,
      totalDaysInMonth: days.length,
    };
  }, [employees, monthAttendance, selectedMonth]);

  /* =========================
   * Month options
   * ========================= */

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
      options.push({ value, label });
    }
    return options;
  }, []);

  /* =========================
   * PDF helpers (print to PDF)
   * ========================= */

  const openPdfWindow = (html: string) => {
    const win = window.open("", "_blank");
    if (!win) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups to export PDF.",
        variant: "destructive",
      });
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const basePdfCss = `
    <style>
      :root { --border:#e5e7eb; --muted:#6b7280; --text:#111827; --soft:#f9fafb; }
      body { font-family: Arial, sans-serif; padding: 18px; color: var(--text); }
      .paper { max-width: 980px; margin: 0 auto; }
      .printBtn { margin-bottom: 12px; }

      .header {
        display:flex; justify-content:space-between; align-items:flex-start; gap:14px;
        border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 12px;
      }
      .brandRow { display:flex; gap:12px; align-items:center; }
      .logoBadge {
        width:56px; height:56px; border-radius: 14px;
        border: 1px solid var(--border); background: var(--soft);
        display:flex; align-items:center; justify-content:center;
        font-weight: 900; letter-spacing: .5px;
        overflow:hidden;
      }
      .logoImg {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display:block;
      }
      .brand { font-weight: 900; font-size: 18px; }
      .sub { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.35; }
      .meta { text-align:right; font-size: 12px; color: var(--muted); }
      .meta b { color: var(--text); }

      .cards { display:flex; gap:10px; flex-wrap:wrap; margin: 12px 0 10px; }
      .kpi {
        flex: 1 1 180px;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        background: white;
      }
      .kpi .label { font-size: 11px; color: var(--muted); }
      .kpi .value { font-size: 20px; font-weight: 900; margin-top: 4px; }

      .box {
        margin: 10px 0 14px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: white;
      }
      .boxTitle { font-weight: 800; margin-bottom: 8px; }
      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      @media (max-width: 720px) { .grid2 { grid-template-columns: 1fr; } }

      table { width: 100%; border-collapse: collapse; font-size: 12px; background:white; }
      th, td { border: 1px solid var(--border); padding: 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      .muted { color: var(--muted); }
      .right { text-align:right; }
      .nowrap { white-space: nowrap; }

      .sigRow { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 18px; }
      .sigBox { font-size: 12px; }
      .sigLine { border-bottom: 1px solid #9ca3af; height: 18px; margin-top: 18px; }
      .sigLabel { color: var(--muted); margin-top: 6px; }

      @media print {
        .printBtn { display:none; }
        body { padding:0; }
        .paper { max-width:none; }
      }
    </style>
  `;

  const buildContactBlockHtml = () => {
    const co = companyName || "Company";

    const selectedBranch =
      scopeBranchId ? branchContacts.find((b) => b.id === scopeBranchId) : null;

    if (!scopeBranchId && isAdmin) {
      // ALL branches: combined contacts only (admin only scenario)
      const phones = Array.from(
        new Set(branchContacts.map((b) => (b.phone || "").trim()).filter(Boolean))
      );
      const emails = Array.from(
        new Set(branchContacts.map((b) => (b.email || "").trim()).filter(Boolean))
      );

      const phoneLine = phones.length ? phones.join(" / ") : "-";
      const emailLine = emails.length ? emails.join(" / ") : "-";

      return `
        <div class="box">
          <div class="boxTitle">Company Contacts</div>
          <div class="muted" style="font-size:12px; line-height:1.5;">
            <div><b>Company:</b> ${escapeHtml(co)}</div>
            <div><b>Phone:</b> ${escapeHtml(phoneLine)}</div>
            <div><b>Email:</b> ${escapeHtml(emailLine)}</div>
          </div>
        </div>
      `;
    }

    // Selected branch: only that branch
    return `
      <div class="box">
        <div class="boxTitle">Branch Contacts</div>
        <div class="muted" style="font-size:12px; line-height:1.5;">
          <div><b>Branch:</b> ${escapeHtml(selectedBranch?.name || activeBranchName || "Branch")}</div>
          <div><b>Address:</b> ${escapeHtml(selectedBranch?.address || "-")}</div>
          <div><b>Phone:</b> ${escapeHtml(selectedBranch?.phone || "-")}</div>
          <div><b>Email:</b> ${escapeHtml(selectedBranch?.email || "-")}</div>
        </div>
      </div>
    `;
  };

  const buildPdfHeader = (title: string, subtitle: string, logoDataUrl: string | null) => {
    const co = companyName || "Company";
    const initials = companyInitials(co);

    const scopeLine = isAdmin
      ? (scopeBranchId
          ? (branchContacts.find((b) => b.id === scopeBranchId)?.name ||
              activeBranchName ||
              "Branch")
          : "All Branches")
      : (branchContacts.find((b) => b.id === scopeBranchId)?.name ||
          activeBranchName ||
          "Branch");

    const logoHtml = logoDataUrl
      ? `<img class="logoImg" src="${logoDataUrl}" alt="Logo" />`
      : escapeHtml(initials);

    return `
      <div class="header">
        <div class="brandRow">
          <div class="logoBadge">${logoHtml}</div>
          <div>
            <div class="brand">${escapeHtml(co)}</div>
            <div style="font-weight:800; margin-top:2px;">${escapeHtml(title)}</div>
            <div class="sub">
              ${escapeHtml(subtitle)}<br/>
              ${escapeHtml(scopeLine)}
            </div>
          </div>
        </div>
        <div class="meta">
          <div><b>Generated:</b> ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
      </div>
    `;
  };

  const buildAbsenceSummaryForRange = async (from: string, to: string) => {
    const emps = await fetchEmployeesList();
    const rows = await fetchAttendanceForRange(from, to);

    const days = enumerateDates(from, to);

    const byDate = new Map<string, Set<string>>();
    for (const r of rows) {
      const d = String(r.date);
      if (!byDate.has(d)) byDate.set(d, new Set());
      byDate.get(d)!.add(r.user_id);
    }

    const generalOffDays: string[] = [];
    for (const d of days) {
      const set = byDate.get(d);
      if (!set || set.size === 0) generalOffDays.push(d);
    }
    const generalOffSet = new Set(generalOffDays);

    const perStaff = emps.map((emp) => {
      let absent = 0;
      let present = 0;

      for (const d of days) {
        if (generalOffSet.has(d)) continue;
        const set = byDate.get(d);
        if (set && set.has(emp.user_id)) present++;
        else absent++;
      }

      return { emp, present, absent };
    });

    const workingDays = days.length - generalOffDays.length;
    const totalAbsentSum = perStaff.reduce((acc, r) => acc + r.absent, 0);

    return {
      days,
      generalOffDays,
      workingDays,
      totalAbsentSum,
      perStaff,
      employeesCount: emps.length,
    };
  };

  const exportWeeklyPDF = async () => {
    if (!companyId) return;

    try {
      const [summary, logoDataUrl] = await Promise.all([
        buildAbsenceSummaryForRange(weekStart, weekEnd),
        urlToDataUrl(companyLogoUrl),
      ]);

      const rowsHtml = summary.perStaff
        .sort((a, b) => b.absent - a.absent)
        .map(
          (r, i) => `
          <tr>
            <td class="nowrap">${i + 1}</td>
            <td>${escapeHtml(r.emp.full_name)}</td>
            <td class="nowrap">${escapeHtml(r.emp.phone || "-")}</td>
            <td class="right">${r.present}</td>
            <td class="right">${r.absent}</td>
          </tr>
        `
        )
        .join("");

      const html = `
        <html>
          <head>
            <title>Weekly Absence Summary (${escapeHtml(weekStart)} to ${escapeHtml(weekEnd)})</title>
            ${basePdfCss}
          </head>
          <body>
            <div class="paper">
              <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

              ${buildPdfHeader("Weekly Absence Summary", `${weekStart} to ${weekEnd}`, logoDataUrl)}

              ${buildContactBlockHtml()}

              <div class="cards">
                <div class="kpi">
                  <div class="label">Total Employees</div>
                  <div class="value">${summary.employeesCount}</div>
                </div>
                <div class="kpi">
                  <div class="label">Working Days</div>
                  <div class="value">${summary.workingDays}</div>
                </div>
                <div class="kpi">
                  <div class="label">General Off-Days</div>
                  <div class="value">${summary.generalOffDays.length}</div>
                </div>
                <div class="kpi">
                  <div class="label">Total Absent (sum)</div>
                  <div class="value">${summary.totalAbsentSum}</div>
                </div>
              </div>

              <div class="box">
                <div class="boxTitle">General Off-Days Dates</div>
                <div class="muted" style="font-size:12px;">
                  ${
                    summary.generalOffDays.length
                      ? escapeHtml(summary.generalOffDays.join(", "))
                      : "—"
                  }
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style="width:40px;">#</th>
                    <th>Employee</th>
                    <th style="width:150px;">Phone</th>
                    <th style="width:120px;" class="right">Present Days</th>
                    <th style="width:120px;" class="right">Absent Days</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>

              <p class="muted" style="margin-top:10px;">
                Note: General off-days are excluded from individual absent day counts.
              </p>

              <div class="sigRow">
                <div class="sigBox">
                  <b>Prepared by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
                <div class="sigBox">
                  <b>Checked by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
                <div class="sigBox">
                  <b>Approved by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      openPdfWindow(html);
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not export",
        variant: "destructive",
      });
    }
  };

  const exportMonthlyPDF = async () => {
    const [yy, mm] = selectedMonth.split("-");
    const from = `${yy}-${mm}-01`;
    const to = isoDate(new Date(Number(yy), Number(mm), 0));

    try {
      const [summary, logoDataUrl] = await Promise.all([
        buildAbsenceSummaryForRange(from, to),
        urlToDataUrl(companyLogoUrl),
      ]);

      const rowsHtml = summary.perStaff
        .sort((a, b) => b.absent - a.absent)
        .map(
          (r, i) => `
          <tr>
            <td class="nowrap">${i + 1}</td>
            <td>${escapeHtml(r.emp.full_name)}</td>
            <td class="nowrap">${escapeHtml(r.emp.phone || "-")}</td>
            <td class="right">${r.present}</td>
            <td class="right">${r.absent}</td>
          </tr>
        `
        )
        .join("");

      const html = `
        <html>
          <head>
            <title>Monthly Absence Summary (${escapeHtml(selectedMonth)})</title>
            ${basePdfCss}
          </head>
          <body>
            <div class="paper">
              <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

              ${buildPdfHeader("Monthly Absence Summary", `Month: ${selectedMonth}`, logoDataUrl)}

              ${buildContactBlockHtml()}

              <div class="cards">
                <div class="kpi">
                  <div class="label">Total Employees</div>
                  <div class="value">${summary.employeesCount}</div>
                </div>
                <div class="kpi">
                  <div class="label">Working Days</div>
                  <div class="value">${summary.workingDays}</div>
                </div>
                <div class="kpi">
                  <div class="label">General Off-Days</div>
                  <div class="value">${summary.generalOffDays.length}</div>
                </div>
                <div class="kpi">
                  <div class="label">Total Absent (sum)</div>
                  <div class="value">${summary.totalAbsentSum}</div>
                </div>
              </div>

              <div class="box">
                <div class="boxTitle">General Off-Days Dates</div>
                <div class="muted" style="font-size:12px;">
                  ${
                    summary.generalOffDays.length
                      ? escapeHtml(summary.generalOffDays.join(", "))
                      : "—"
                  }
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style="width:40px;">#</th>
                    <th>Employee</th>
                    <th style="width:150px;">Phone</th>
                    <th style="width:120px;" class="right">Present Days</th>
                    <th style="width:120px;" class="right">Absent Days</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>

              <p class="muted" style="margin-top:10px;">
                Note: General off-days are excluded from individual absent day counts.
              </p>

              <div class="sigRow">
                <div class="sigBox">
                  <b>Prepared by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
                <div class="sigBox">
                  <b>Checked by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
                <div class="sigBox">
                  <b>Approved by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      openPdfWindow(html);
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not export",
        variant: "destructive",
      });
    }
  };

  const exportDailyAbsenteesPDF = async () => {
    if (!companyId) return;

    try {
      const [emps, dayRows, logoDataUrl] = await Promise.all([
        fetchEmployeesList(),
        fetchAttendanceForRange(selectedDay, selectedDay),
        urlToDataUrl(companyLogoUrl),
      ]);

      const attended = new Set(dayRows.map((r) => r.user_id));
      const absentees = emps.filter((e) => !attended.has(e.user_id));
      const isGeneralOff = dayRows.length === 0;

      const rowsHtml = absentees
        .map(
          (e, i) => `
          <tr>
            <td class="nowrap">${i + 1}</td>
            <td>${escapeHtml(e.full_name)}</td>
            <td class="nowrap">${escapeHtml(e.phone || "-")}</td>
          </tr>
        `
        )
        .join("");

      const html = `
        <html>
          <head>
            <title>Daily Absentees (${escapeHtml(selectedDay)})</title>
            ${basePdfCss}
          </head>
          <body>
            <div class="paper">
              <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

              ${buildPdfHeader("Daily Absentees Report", `Date: ${selectedDay}`, logoDataUrl)}

              ${buildContactBlockHtml()}

              <div class="cards">
                <div class="kpi">
                  <div class="label">Total Employees</div>
                  <div class="value">${emps.length}</div>
                </div>
                <div class="kpi">
                  <div class="label">Attended</div>
                  <div class="value">${dayRows.length}</div>
                </div>
                <div class="kpi">
                  <div class="label">Absentees</div>
                  <div class="value">${absentees.length}</div>
                </div>
                <div class="kpi">
                  <div class="label">General Off-Day</div>
                  <div class="value">${isGeneralOff ? "YES" : "NO"}</div>
                </div>
              </div>

              <table>
                <thead>
                  <tr><th style="width:40px;">#</th><th>Employee</th><th style="width:150px;">Phone</th></tr>
                </thead>
                <tbody>
                  ${
                    absentees.length
                      ? rowsHtml
                      : `<tr><td colspan="3" class="muted">No absentees.</td></tr>`
                  }
                </tbody>
              </table>

              <p class="muted" style="margin-top:10px;">
                Note: If nobody attended, the day is treated as a general off-day and is not counted against individuals.
              </p>

              <div class="sigRow">
                <div class="sigBox">
                  <b>Prepared by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
                <div class="sigBox">
                  <b>Checked by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
                <div class="sigBox">
                  <b>Approved by:</b>
                  <div class="sigLine"></div>
                  <div class="sigLabel">Signature</div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      openPdfWindow(html);
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not export",
        variant: "destructive",
      });
    }
  };

  /* =========================
   * UI
   * ========================= */

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        You don't have permission to access this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-white">Staff Attendance</h1>
        <p className="text-slate-400">
          Manage employee clock-in and clock-out • Active Branch:{" "}
          <b className="text-slate-200">
            {isAdmin
              ? (activeBranchId ? (activeBranchName || "Loading…") : "All Branches")
              : (activeBranchName || "My Branch")}
          </b>
        </p>

        {/* Export controls */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">Daily absentees date</span>
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1"
            />
          </div>

          <Button variant="outline" onClick={exportDailyAbsenteesPDF}>
            <FileText className="h-4 w-4 mr-2" />
            Export Daily Absentees PDF
          </Button>

          <div className="flex flex-col">
            <span className="text-xs text-slate-400">Week start (Mon)</span>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1"
            />
          </div>

          <Button variant="outline" onClick={exportWeeklyPDF}>
            <FileText className="h-4 w-4 mr-2" />
            Export Weekly Summary PDF
          </Button>

          <Button onClick={exportMonthlyPDF}>
            <FileText className="h-4 w-4 mr-2" />
            Export Monthly Summary PDF
          </Button>
        </div>

        {/* ✅ Admin warning: view-only */}
        {isAdmin && (
          <p className="text-xs text-slate-500">
            Admin is exempted from attendance. Admin can view/export reports only.
            Use an Attendance Manager account to clock staff in/out.
          </p>
        )}
      </div>

      {/* Absentees alert */}
      {showAbsentees && absenteesToday.length > 0 && (
        <Card className="bg-red-900/20 border-red-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5" />
              Absentees Today ({absenteesToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {absenteesToday.map((emp) => (
                <Badge key={emp.id} variant="destructive" className="text-sm">
                  {emp.full_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Attendance */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5" />
            Today - {formatDateLabel(today)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Employee</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Clock In</TableHead>
                <TableHead className="text-slate-400">Clock Out</TableHead>
                <TableHead className="text-slate-400">Hours</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {employees.map((emp) => {
                const attendance = getEmployeeTodayAttendance(emp.user_id);
                const isAbsent = showAbsentees && !attendance;

                return (
                  <TableRow
                    key={emp.id}
                    className={`border-slate-700 ${isAbsent ? "bg-red-900/10" : ""}`}
                  >
                    <TableCell className="text-white font-medium">
                      {emp.full_name}
                      {isAbsent && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          Absent
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-300">{emp.phone || "-"}</TableCell>
                    <TableCell className="text-slate-300">
                      {attendance ? formatTime(attendance.clock_in) : "-"}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {attendance ? formatTime(attendance.clock_out) : "-"}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {attendance ? calculateHours(attendance.clock_in, attendance.clock_out) : "-"}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!canClock && <span className="text-xs text-slate-500">View only</span>}

                        {canClock && !attendance && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => clockInEmployee(emp.user_id)}
                          >
                            <LogIn className="h-4 w-4 mr-1" />
                            Clock In
                          </Button>
                        )}

                        {canClock && attendance && !attendance.clock_out && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => clockOutEmployee(attendance.id)}
                          >
                            <LogOut className="h-4 w-4 mr-1" />
                            Clock Out
                          </Button>
                        )}

                        {attendance?.clock_out && <Badge className="bg-green-600">Completed</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                    {loading ? "Loading..." : "No employees found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Monthly Summary (UI) */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <Calendar className="h-5 w-5" />
              Monthly Summary
            </CardTitle>

            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48 bg-slate-700 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-sm text-slate-400">
            General Off-Days this month:{" "}
            <b className="text-slate-200">{monthlySummary.generalOffDaysCount}</b>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Employee</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Present Days</TableHead>
                <TableHead className="text-slate-400">Absent Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlySummary.rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={`border-slate-700 ${r.hasAbsences ? "bg-red-900/20" : ""}`}
                >
                  <TableCell
                    className={`font-medium ${r.hasAbsences ? "text-red-400" : "text-white"}`}
                  >
                    {r.full_name}
                  </TableCell>
                  <TableCell className="text-slate-300">{r.phone || "-"}</TableCell>
                  <TableCell className="text-green-400">{r.presentDays}</TableCell>
                  <TableCell>
                    {r.hasAbsences ? (
                      <Badge variant="destructive">{r.absentDays} days</Badge>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                    {loading ? "Loading..." : "No employees found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <p className="text-xs text-slate-500">
            Note: General off-days are excluded from individual absent day counts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}