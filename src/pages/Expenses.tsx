import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Download, FileText, Plus, RefreshCw, Search } from "lucide-react";

// must match Sidebar / BranchSwitcher
const ADMIN_ACTIVE_BRANCH_NAME_KEY = "admin_active_branch_name_v1";

type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | string;
// On this page we show HISTORY only (approved + rejected).
type HistoryFilter = "all" | "approved" | "rejected";

interface ExpenseRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;

  amount: number;
  expense_date: string; // YYYY-MM-DD
  payment_method: string;
  vendor_name: string | null;
  reference_no: string | null;
  receipt_url: string | null;

  status: ExpenseStatus;
  branch_id: string;
  company_id: string | null;

  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;

  created_at: string;
}

interface CreatorInfo {
  full_name: string;
  staff_code: string | null;
  user_id: string;
}

interface BranchInfo {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

interface CompanyInfo {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  // ✅ optional if you later fetch it (we also accept from useAuth)
  logo_url?: string | null;
  receipt_footer?: string | null;
}

interface ExpenseCategory {
  id: string;
  name: string;
}

interface ExpenseWithMeta extends ExpenseRow {
  creator?: CreatorInfo | null;
  branch_name?: string | null;
  category_name?: string | null;
}

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusBadgeVariant(status: ExpenseStatus) {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  if (status === "submitted") return "secondary";
  return "secondary";
}

function statusLabel(status: ExpenseStatus) {
  if (status === "approved") return "Paid";
  if (status === "submitted") return "Submitted";
  if (status === "rejected") return "Rejected";
  if (status === "draft") return "Draft";
  return String(status);
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function safeText(v: any) {
  return (v ?? "").toString().trim();
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

export default function Expenses() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    user,
    profile,
    activeBranchId,
    isAdmin,
    isReturnsHandler,
    branchName,
    companyName,
    roles,
    companyLogoUrl, // ✅ for logo in PDF (from useAuth)
  } = useAuth() as any;

  const [loading, setLoading] = useState(false);

  // full list from DB for the range + branch
  const [rows, setRows] = useState<ExpenseWithMeta[]>([]);

  // Filters (history)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");

  const [startDate, setStartDate] = useState(() => {
    const d = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    return isoDate(d);
  });
  const [endDate, setEndDate] = useState(() => isoDate(new Date()));

  // Meta for names + PDF
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [companyMeta, setCompanyMeta] = useState<CompanyInfo | null>(null);
  const [activeBranchMeta, setActiveBranchMeta] = useState<BranchInfo | null>(
    null
  );

  // Print ref (kept)
  const printRef = useRef<HTMLDivElement | null>(null);

  // =========================
  // Permissions (per your rules)
  // =========================
  const isCashier = Array.isArray(roles) && roles.includes("cashier");
  const canCreate = isAdmin || isCashier; // ✅ admin + cashier only
  const canViewPending = isAdmin || isReturnsHandler; // ✅ admin + returns handler

  // =========================
  // Branch label
  // =========================
  const adminCachedBranchName = useMemo(() => {
    if (!isAdmin) return "";
    try {
      return (localStorage.getItem(ADMIN_ACTIVE_BRANCH_NAME_KEY) ?? "").trim();
    } catch {
      return "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeBranchId]);

  const headerBranchLabel = useMemo(() => {
    if (!activeBranchId) return "All branches";
    if (isAdmin) return adminCachedBranchName || "Loading…";
    return (branchName ?? "").trim() || "Not assigned";
  }, [activeBranchId, isAdmin, adminCachedBranchName, branchName]);

  const showBranchColumn = !activeBranchId;

  // =========================
  // Load meta: company, branch, categories
  // =========================
  const fetchMeta = async () => {
    if (!profile?.company_id) return;

    try {
      const { data: comp, error: compErr } = await (supabase as any)
        .from("companies")
        .select("id, name, address, phone, email, tax_id, logo_url, receipt_footer")
        .eq("id", profile.company_id)
        .maybeSingle();

      if (!compErr && comp) {
        setCompanyMeta({
          id: String(comp.id),
          name: comp.name ?? "Company",
          address: comp.address ?? null,
          phone: comp.phone ?? null,
          email: comp.email ?? null,
          tax_id: comp.tax_id ?? null,
          logo_url: comp.logo_url ?? null,
          receipt_footer: comp.receipt_footer ?? null,
        });
      } else {
        setCompanyMeta((prev) =>
          prev ??
          ({
            id: String(profile.company_id),
            name: safeText(companyName) || "Company",
            address: null,
            phone: null,
            email: null,
            tax_id: null,
            logo_url: null,
            receipt_footer: null,
          } as CompanyInfo)
        );
      }

      if (activeBranchId) {
        const { data: br, error: brErr } = await (supabase as any)
          .from("branches")
          .select("id, name, address, phone, email")
          .eq("id", activeBranchId)
          .maybeSingle();

        if (!brErr && br) {
          setActiveBranchMeta({
            id: String(br.id),
            name: br.name ?? adminCachedBranchName ?? "Branch",
            address: br.address ?? null,
            phone: br.phone ?? null,
            email: br.email ?? null,
          });
        } else {
          setActiveBranchMeta(null);
        }
      } else {
        setActiveBranchMeta(null);
      }

      const { data: cats, error: catErr } = await (supabase as any)
        .from("expense_categories")
        .select("id, name")
        .order("name", { ascending: true });

      if (!catErr && Array.isArray(cats)) {
        setCategories(
          cats.map((c: any) => ({ id: String(c.id), name: c.name ?? "—" }))
        );
      } else {
        setCategories([]);
      }
    } catch {
      // meta not critical
    }
  };

  // =========================
  // Fetch expenses (no joins)
  // =========================
  const fetchExpenses = async () => {
    if (!user || !profile?.company_id) return;

    setLoading(true);
    try {
      let q = (supabase as any)
        .from("expenses")
        .select(
          `
          id,
          title,
          description,
          category_id,
          amount,
          expense_date,
          payment_method,
          vendor_name,
          reference_no,
          receipt_url,
          status,
          branch_id,
          company_id,
          created_by,
          approved_by,
          approved_at,
          rejected_reason,
          created_at
        `
        )
        .eq("company_id", profile.company_id)
        .gte("expense_date", startDate)
        .lte("expense_date", endDate)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (activeBranchId) q = q.eq("branch_id", activeBranchId);

      const { data: expenses, error: expErr } = await q;
      if (expErr) throw expErr;

      const expenseList: ExpenseRow[] = (expenses ?? []) as ExpenseRow[];

      // creators
      const creatorIds = Array.from(
        new Set(expenseList.map((e) => e.created_by).filter(Boolean))
      );

      const creatorsMap = new Map<string, CreatorInfo>();
      if (creatorIds.length > 0) {
        const { data: creators, error: crErr } = await (supabase as any)
          .from("profiles")
          .select("user_id, full_name, staff_code")
          .in("user_id", creatorIds)
          .is("deleted_at", null);

        if (crErr) throw crErr;

        (creators ?? []).forEach((c: any) => {
          creatorsMap.set(String(c.user_id), {
            user_id: String(c.user_id),
            full_name: c.full_name ?? "Unknown",
            staff_code: c.staff_code ?? null,
          });
        });
      }

      // branch names (only if all branches)
      const branchIds = Array.from(
        new Set(expenseList.map((e) => e.branch_id).filter(Boolean))
      );

      const branchMap = new Map<string, string>();
      if (!activeBranchId && branchIds.length > 0) {
        const { data: branches, error: brErr } = await (supabase as any)
          .from("branches")
          .select("id, name")
          .in("id", branchIds);

        if (brErr) throw brErr;

        (branches ?? []).forEach((b: any) => {
          branchMap.set(String(b.id), String(b.name ?? ""));
        });
      }

      // category names
      const catMap = new Map<string, string>();
      categories.forEach((c) => catMap.set(c.id, c.name));

      const merged: ExpenseWithMeta[] = expenseList.map((e) => ({
        ...e,
        creator: creatorsMap.get(e.created_by) ?? null,
        branch_name: !activeBranchId ? branchMap.get(e.branch_id) ?? null : null,
        category_name: e.category_id
          ? catMap.get(String(e.category_id)) ?? null
          : null,
      }));

      setRows(merged);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load expenses",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, activeBranchId]);

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, profile?.company_id, startDate, endDate, categories.length]);

  // =========================
  // HISTORY view: approved/rejected only (pending is on /expenses/pending)
  // =========================
  const historyRows = useMemo(() => {
    // keep only approved/rejected (history)
    const base = rows.filter(
      (r) => r.status === "approved" || r.status === "rejected"
    );

    const s = search.trim().toLowerCase();

    return base.filter((r) => {
      if (historyFilter !== "all" && r.status !== historyFilter) return false;
      if (!s) return true;

      const createdBy =
        (r.creator?.full_name ?? "") + " " + (r.creator?.staff_code ?? "");
      const branch = r.branch_name ?? "";
      const cat = r.category_name ?? "";
      const vendor = r.vendor_name ?? "";
      const ref = r.reference_no ?? "";

      const hay = `${r.title} ${createdBy} ${branch} ${cat} ${vendor} ${ref}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, historyFilter, search]);

  // =========================
  // Summary cards (based on ALL rows in range)
  // =========================
  const summary = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const pending = rows
      .filter((r) => r.status === "submitted")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const paid = rows
      .filter((r) => r.status === "approved")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const rejected = rows
      .filter((r) => r.status === "rejected")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    return {
      count: rows.length,
      total,
      pending,
      paid,
      rejected,
    };
  }, [rows]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "submitted").length,
    [rows]
  );

  // =========================
  // Branch comparison (admin only, when viewing all branches)
  // =========================
  const branchComparison = useMemo(() => {
    if (activeBranchId) return [];

    const map = new Map<
      string,
      {
        branch_id: string;
        branch_name: string;
        total: number;
        submitted: number;
        approved: number;
        rejected: number;
        count: number;
      }
    >();

    rows.forEach((r) => {
      const id = r.branch_id;
      const name = r.branch_name ?? "—";
      const cur =
        map.get(id) ??
        ({
          branch_id: id,
          branch_name: name,
          total: 0,
          submitted: 0,
          approved: 0,
          rejected: 0,
          count: 0,
        } as any);

      const amt = Number(r.amount || 0);
      cur.total += amt;
      cur.count += 1;
      if (r.status === "submitted") cur.submitted += amt;
      if (r.status === "approved") cur.approved += amt;
      if (r.status === "rejected") cur.rejected += amt;

      map.set(id, cur);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.branch_name.localeCompare(b.branch_name)
    );
  }, [rows, activeBranchId]);

  // Only show branch comparison block when it actually matters
  const showBranchComparison = !activeBranchId && isAdmin;

  // =========================
  // PDF export (same format as Attendance PDFs ✅ + logo ✅)
  // =========================
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
      .logoImg { width:100%; height:100%; object-fit:contain; display:block; }
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

  const buildPdfHeader = (title: string, subtitle: string, logoDataUrl: string | null) => {
    const co = safeText(companyMeta?.name) || safeText(companyName) || "Company";
    const initials = companyInitials(co);

    // match Attendance behavior:
    // - If branch selected: show ONLY branch name
    // - If all branches: show "All Branches"
    const scopeLine = activeBranchId ? headerBranchLabel : "All Branches";

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

  /**
   * Contact rules (same as Attendance idea):
   * - If ALL branches: show company contact only
   * - If selected branch: show only that branch contact
   */
  const buildContactBlockHtml = () => {
    const co = safeText(companyMeta?.name) || safeText(companyName) || "Company";

    if (!activeBranchId) {
      const address = safeText(companyMeta?.address) || "—";
      const phone = safeText(companyMeta?.phone) || "—";
      const email = safeText(companyMeta?.email) || "—";
      const tax = safeText(companyMeta?.tax_id) || "";

      return `
        <div class="box">
          <div class="boxTitle">Company Contacts</div>
          <div class="muted" style="font-size:12px; line-height:1.5;">
            <div><b>Company:</b> ${escapeHtml(co)}</div>
            <div><b>Address:</b> ${escapeHtml(address)}</div>
            <div><b>Phone:</b> ${escapeHtml(phone)}</div>
            <div><b>Email:</b> ${escapeHtml(email)}</div>
            ${tax ? `<div><b>Tax ID:</b> ${escapeHtml(tax)}</div>` : ``}
          </div>
        </div>
      `;
    }

    const bname = safeText(activeBranchMeta?.name) || safeText(headerBranchLabel) || "Selected Branch";
    const address = safeText(activeBranchMeta?.address) || "—";
    const phone = safeText(activeBranchMeta?.phone) || "—";
    const email = safeText(activeBranchMeta?.email) || "—";

    return `
      <div class="box">
        <div class="boxTitle">Branch Contacts</div>
        <div class="muted" style="font-size:12px; line-height:1.5;">
          <div><b>Branch:</b> ${escapeHtml(bname)}</div>
          <div><b>Address:</b> ${escapeHtml(address)}</div>
          <div><b>Phone:</b> ${escapeHtml(phone)}</div>
          <div><b>Email:</b> ${escapeHtml(email)}</div>
        </div>
      </div>
    `;
  };

  const exportPdf = async () => {
    try {
      const logoDataUrl = await urlToDataUrl(companyLogoUrl || companyMeta?.logo_url || null);

      const title = "Expenses Report";
      const subtitle = `${startDate} to ${endDate}`;

      const cardsHtml = `
        <div class="cards">
          <div class="kpi">
            <div class="label">Total (Range)</div>
            <div class="value">GHC ${escapeHtml(money(summary.total))}</div>
            <div class="muted" style="font-size:12px; margin-top:4px;">${escapeHtml(String(summary.count))} records</div>
          </div>
          <div class="kpi">
            <div class="label">Pending Approval</div>
            <div class="value">GHC ${escapeHtml(money(summary.pending))}</div>
            <div class="muted" style="font-size:12px; margin-top:4px;">submitted</div>
          </div>
          <div class="kpi">
            <div class="label">Paid (Approved)</div>
            <div class="value">GHC ${escapeHtml(money(summary.paid))}</div>
            <div class="muted" style="font-size:12px; margin-top:4px;">approved</div>
          </div>
          <div class="kpi">
            <div class="label">Rejected</div>
            <div class="value">GHC ${escapeHtml(money(summary.rejected))}</div>
            <div class="muted" style="font-size:12px; margin-top:4px;">rejected</div>
          </div>
        </div>
      `;

      const branchComparisonHtml =
        showBranchComparison && branchComparison.length > 0
          ? `
          <div class="box">
            <div class="boxTitle">Branch Comparison (Current Range)</div>
            <table>
              <thead>
                <tr>
                  <th>Branch</th>
                  <th class="right">Total</th>
                  <th class="right">Pending</th>
                  <th class="right">Paid</th>
                  <th class="right">Rejected</th>
                  <th class="right">Records</th>
                </tr>
              </thead>
              <tbody>
                ${branchComparison
                  .map(
                    (b) => `
                    <tr>
                      <td>${escapeHtml(b.branch_name)}</td>
                      <td class="right">GHC ${escapeHtml(money(b.total))}</td>
                      <td class="right">GHC ${escapeHtml(money(b.submitted))}</td>
                      <td class="right">GHC ${escapeHtml(money(b.approved))}</td>
                      <td class="right">GHC ${escapeHtml(money(b.rejected))}</td>
                      <td class="right">${escapeHtml(String(b.count))}</td>
                    </tr>
                  `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
          : ``;

      const rowsHtml =
        rows.length > 0
          ? rows
              .map((e) => {
                const createdBy =
                  (e.creator?.full_name ?? "—") +
                  (e.creator?.staff_code ? ` (${e.creator.staff_code})` : "");
                const vendorRef =
                  e.vendor_name || e.reference_no
                    ? `<div class="muted" style="font-size:11px; margin-top:3px;">
                        ${e.vendor_name ? `Vendor: ${escapeHtml(e.vendor_name)}` : ""}
                        ${e.vendor_name && e.reference_no ? " • " : ""}
                        ${e.reference_no ? `Ref: ${escapeHtml(e.reference_no)}` : ""}
                      </div>`
                    : "";
                return `
                  <tr>
                    <td>
                      ${escapeHtml(e.title)}
                      ${vendorRef}
                      ${
                        e.status === "rejected" && e.rejected_reason
                          ? `<div class="muted" style="font-size:11px; margin-top:3px; color:#b91c1c;">
                              Reason: ${escapeHtml(e.rejected_reason)}
                            </div>`
                          : ""
                      }
                    </td>
                    ${!activeBranchId ? `<td>${escapeHtml(e.branch_name ?? "—")}</td>` : ""}
                    <td>${escapeHtml(e.category_name ?? "—")}</td>
                    <td class="right">GHC ${escapeHtml(money(Number(e.amount || 0)))}</td>
                    <td class="nowrap">${escapeHtml(e.expense_date)}</td>
                    <td>${escapeHtml(createdBy)}</td>
                    <td class="nowrap">${escapeHtml(statusLabel(e.status))}</td>
                  </tr>
                `;
              })
              .join("")
          : `<tr><td colspan="${!activeBranchId ? 7 : 6}" class="muted">No records for selected range.</td></tr>`;

      const footerText =
        safeText(companyMeta?.receipt_footer) || "Powered by Philuz Appz";

      const html = `
        <html>
          <head>
            <title>${escapeHtml(title)} (${escapeHtml(subtitle)})</title>
            ${basePdfCss}
          </head>
          <body>
            <div class="paper">
              <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

              ${buildPdfHeader(title, subtitle, logoDataUrl)}

              ${buildContactBlockHtml()}

              ${cardsHtml}

              ${branchComparisonHtml}

              <div class="box">
                <div class="boxTitle">Expenses (All Statuses)</div>
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      ${!activeBranchId ? `<th>Branch</th>` : ""}
                      <th>Category</th>
                      <th class="right">Amount</th>
                      <th>Date</th>
                      <th>Created By</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>

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

                <div class="muted" style="margin-top:12px; font-size:11px;">
                  ${escapeHtml(footerText)}
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

  // =========================
  // Report labels (UI + fallback, kept)
  // =========================
  const reportTitle = activeBranchId
    ? `Expenses Report — ${headerBranchLabel}`
    : `Expenses Report — All branches`;

  const reportAddressLine = activeBranchId
    ? safeText(activeBranchMeta?.address) || "—"
    : safeText(companyMeta?.address) || "—";

  const reportPhoneLine = activeBranchId
    ? safeText(activeBranchMeta?.phone) || "—"
    : safeText(companyMeta?.phone) || "—";

  const reportEmailLine = activeBranchId
    ? safeText(activeBranchMeta?.email) || "—"
    : safeText(companyMeta?.email) || "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3 no-print">
          <div>
            <h1 className="text-2xl font-bold text-white">Expenses</h1>
            <p className="text-slate-400">
              Branch-based expenses •{" "}
              <span className="text-slate-300">{headerBranchLabel}</span>
            </p>
          </div>

          <div className="flex gap-2">
            {/* Pending: admin + returns handler only */}
            {canViewPending && (
              <Button
                variant="secondary"
                onClick={() => navigate("/expenses/pending")}
              >
                Pending
                {pendingCount > 0 ? (
                  <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs">
                    {pendingCount}
                  </span>
                ) : null}
              </Button>
            )}

            {/* New Expense: admin + cashier only */}
            {canCreate && (
              <Button onClick={() => navigate("/expenses/new")}>
                <Plus className="h-4 w-4 mr-2" />
                New Expense
              </Button>
            )}

            <Button variant="secondary" onClick={exportPdf}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-slate-800/50 border-slate-700 no-print">
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-slate-200">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Search</Label>
                <div className="relative">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Title, staff name, branch, vendor..."
                    className="pl-9 bg-slate-700 border-slate-600 text-white"
                  />
                </div>
              </div>
            </div>

            {/* History tabs (approved/rejected only) */}
            <div className="flex flex-wrap gap-2 items-center">
              {(
                [
                  { key: "all", label: "History (All)" },
                  { key: "approved", label: "Paid" },
                  { key: "rejected", label: "Rejected" },
                ] as { key: HistoryFilter; label: string }[]
              ).map((t) => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={historyFilter === t.key ? "default" : "secondary"}
                  onClick={() => setHistoryFilter(t.key)}
                >
                  {t.label}
                </Button>
              ))}

              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={fetchExpenses}
                  disabled={loading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {loading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards (all statuses) */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 no-print">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Total (Range)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                GHC {money(summary.total)}
              </div>
              <p className="text-xs text-slate-400">{summary.count} records</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Pending Approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                GHC {money(summary.pending)}
              </div>
              <p className="text-xs text-slate-400">submitted</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Paid (Approved)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                GHC {money(summary.paid)}
              </div>
              <p className="text-xs text-slate-400">auto-paid on approval</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                GHC {money(summary.rejected)}
              </div>
              <p className="text-xs text-slate-400">rejected</p>
            </CardContent>
          </Card>
        </div>

        {/* Branch comparison (Admin + All branches) */}
        {showBranchComparison && (
          <Card className="bg-slate-800/50 border-slate-700 no-print">
            <CardHeader>
              <CardTitle className="text-white">
                Branch Comparison (Current Range)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Branch</TableHead>
                    <TableHead className="text-slate-400 text-right">
                      Total
                    </TableHead>
                    <TableHead className="text-slate-400 text-right">
                      Pending
                    </TableHead>
                    <TableHead className="text-slate-400 text-right">
                      Paid
                    </TableHead>
                    <TableHead className="text-slate-400 text-right">
                      Rejected
                    </TableHead>
                    <TableHead className="text-slate-400 text-right">
                      Records
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchComparison.map((b) => (
                    <TableRow key={b.branch_id} className="border-slate-700">
                      <TableCell className="text-white">{b.branch_name}</TableCell>
                      <TableCell className="text-slate-300 text-right">
                        GHC {money(b.total)}
                      </TableCell>
                      <TableCell className="text-slate-300 text-right">
                        GHC {money(b.submitted)}
                      </TableCell>
                      <TableCell className="text-slate-300 text-right">
                        GHC {money(b.approved)}
                      </TableCell>
                      <TableCell className="text-slate-300 text-right">
                        GHC {money(b.rejected)}
                      </TableCell>
                      <TableCell className="text-slate-300 text-right">
                        {b.count}
                      </TableCell>
                    </TableRow>
                  ))}

                  {branchComparison.length === 0 && !loading && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-slate-400 py-8"
                      >
                        No data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* HISTORY list only */}
        <Card className="bg-slate-800/50 border-slate-700 no-print">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="h-5 w-5" />
              History (Paid / Rejected)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Title</TableHead>
                  {showBranchColumn && (
                    <TableHead className="text-slate-400">Branch</TableHead>
                  )}
                  <TableHead className="text-slate-400">Category</TableHead>
                  <TableHead className="text-slate-400">Amount</TableHead>
                  <TableHead className="text-slate-400">Date</TableHead>
                  <TableHead className="text-slate-400">Created By</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {historyRows.map((exp) => (
                  <TableRow key={exp.id} className="border-slate-700">
                    <TableCell className="text-white">
                      <div className="font-medium">{exp.title}</div>
                      {(exp.vendor_name || exp.reference_no || exp.receipt_url) && (
                        <div className="text-xs text-slate-400 mt-1">
                          {exp.vendor_name ? (
                            <span className="mr-2">Vendor: {exp.vendor_name}</span>
                          ) : null}
                          {exp.reference_no ? (
                            <span className="mr-2">Ref: {exp.reference_no}</span>
                          ) : null}
                          {exp.receipt_url ? (
                            <a
                              href={exp.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-300 underline"
                            >
                              Receipt
                            </a>
                          ) : null}
                        </div>
                      )}
                      {exp.status === "rejected" && exp.rejected_reason ? (
                        <div className="text-xs text-red-300 mt-1">
                          Reason: {exp.rejected_reason}
                        </div>
                      ) : null}
                    </TableCell>

                    {showBranchColumn && (
                      <TableCell className="text-slate-300">
                        {exp.branch_name ?? "—"}
                      </TableCell>
                    )}

                    <TableCell className="text-slate-300">
                      {exp.category_name ?? "—"}
                    </TableCell>

                    <TableCell className="text-slate-300">
                      GHC {money(exp.amount)}
                    </TableCell>

                    <TableCell className="text-slate-300">
                      {exp.expense_date}
                    </TableCell>

                    <TableCell className="text-slate-300">
                      {exp.creator?.full_name ?? "—"}
                      {exp.creator?.staff_code ? (
                        <span className="text-xs text-slate-500 ml-1">
                          ({exp.creator.staff_code})
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <Badge variant={statusBadgeVariant(exp.status)}>
                        {statusLabel(exp.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}

                {!loading && historyRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={showBranchColumn ? 7 : 6}
                      className="text-center text-slate-400 py-8"
                    >
                      No history records for the selected filters
                    </TableCell>
                  </TableRow>
                )}

                {loading && (
                  <TableRow>
                    <TableCell
                      colSpan={showBranchColumn ? 7 : 6}
                      className="text-center text-slate-400 py-8"
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* PRINT AREA (kept but no longer used for export; safe to keep) */}
      <div className="print-area hidden" ref={printRef as any}>
        <div className="p-6">
          <div className="rounded border p-4">
            <div className="font-bold">{reportTitle}</div>
            <div className="text-sm text-slate-600">Address: {reportAddressLine}</div>
            <div className="text-sm text-slate-600">Phone: {reportPhoneLine}</div>
            <div className="text-sm text-slate-600">Email: {reportEmailLine}</div>
          </div>
        </div>
      </div>
    </div>
  );
}