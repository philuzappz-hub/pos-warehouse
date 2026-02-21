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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Package, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** -----------------------------
 * Types
 * ------------------------------*/
interface SalesSummary {
  totalSales: number;
  totalAmount: number;
  avgSale: number;

  returnsApprovedAmount: number;
  returnsApprovedCount: number;
  returnsPendingCount: number;

  expensesApprovedAmount: number;
  expensesApprovedCount: number;

  totalDeductions: number; // ✅ returns + expenses
  netAfterDeductions: number; // ✅ revenue - (returns + expenses)
}

interface TopProduct {
  name: string;
  total_qty: number;
  total_revenue: number;
}

interface AttendanceSummary {
  total_staff: number;
  present_today: number;
}

type BranchRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  company_id: string | null;
  is_active?: boolean | null;
};

type CompanyRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type BranchCompareRow = {
  branch_id: string;
  branch_name: string;
  total_sales: number; // count
  total_revenue: number;

  approved_returns: number;
  approved_expenses: number;

  total_deductions: number; // returns + expenses
  net_after_deductions: number; // revenue - deductions
};

/** -----------------------------
 * Helpers
 * ------------------------------*/
function escapeHtml(str: any) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function initials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "CO";
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[1]?.[0] || "" : parts[0]?.[1] || "";
  return (a + b).toUpperCase();
}

export default function Reports() {
  const { toast } = useToast();
  const { activeBranchId, profile, companyName } = useAuth() as any;

  const companyId = (profile as any)?.company_id ?? null;

  const [startDate, setStartDate] = useState(isoDate(new Date()));
  const [endDate, setEndDate] = useState(isoDate(new Date()));

  const [salesSummary, setSalesSummary] = useState<SalesSummary>({
    totalSales: 0,
    totalAmount: 0,
    avgSale: 0,

    returnsApprovedAmount: 0,
    returnsApprovedCount: 0,
    returnsPendingCount: 0,

    expensesApprovedAmount: 0,
    expensesApprovedCount: 0,

    totalDeductions: 0,
    netAfterDeductions: 0,
  });

  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary>(
    { total_staff: 0, present_today: 0 }
  );

  const [lowStockProducts, setLowStockProducts] = useState<
    { name: string; quantity_in_stock: number; reorder_level: number }[]
  >([]);

  const [loading, setLoading] = useState(false);

  /** Scope/Contacts for UI + PDF */
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<BranchRow | null>(null);

  /** Branch comparison */
  const [compareRows, setCompareRows] = useState<BranchCompareRow[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  const scopeLabel = useMemo(() => {
    if (activeBranchId) return selectedBranch?.name || "Selected branch";
    return "All branches";
  }, [activeBranchId, selectedBranch?.name]);

  // Load company + branches + selected branch (for correct scope name + PDF contacts)
  const fetchOrgInfo = async () => {
    if (!companyId) {
      setCompany(null);
      setBranches([]);
      setSelectedBranch(null);
      return;
    }

    try {
      // cast to any to avoid schema/type drift errors
      const { data: co, error: coErr } = await (supabase as any)
        .from("companies")
        .select("id,name,address,phone,email")
        .eq("id", companyId)
        .maybeSingle();

      if (coErr) throw coErr;
      setCompany((co ?? null) as any);

      const { data: brs, error: brErr } = await (supabase as any)
        .from("branches")
        .select("id,name,address,phone,email,company_id,is_active")
        .eq("company_id", companyId)
        .order("name");

      if (brErr) throw brErr;
      const list = (brs ?? []) as BranchRow[];
      setBranches(list);

      if (activeBranchId) {
        const b = list.find((x) => x.id === activeBranchId) || null;
        setSelectedBranch(b);
      } else {
        setSelectedBranch(null);
      }
    } catch (e: any) {
      console.error(e);
      setCompany(null);
      setBranches([]);
      setSelectedBranch(null);
    }
  };

  useEffect(() => {
    fetchOrgInfo();
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, companyId]);

  /** -----------------------------
   * Core report fetch
   * ------------------------------*/
  const fetchReports = async () => {
    setLoading(true);

    setSalesSummary({
      totalSales: 0,
      totalAmount: 0,
      avgSale: 0,

      returnsApprovedAmount: 0,
      returnsApprovedCount: 0,
      returnsPendingCount: 0,

      expensesApprovedAmount: 0,
      expensesApprovedCount: 0,

      totalDeductions: 0,
      netAfterDeductions: 0,
    });

    setTopProducts([]);
    setAttendanceSummary({ total_staff: 0, present_today: 0 });
    setLowStockProducts([]);

    const today = isoDate(new Date());

    try {
      /** =========================
       * SALES summary (date range)
       * ========================= */
      let salesQ = supabase
        .from("sales")
        .select("id,total_amount,branch_id,created_at")
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`);

      if (activeBranchId) {
        salesQ = salesQ.eq("branch_id", activeBranchId);
      }

      const { data: sales, error: salesErr } = await salesQ;
      if (salesErr) throw salesErr;

      const totalAmount = (sales ?? []).reduce(
        (sum: number, s: any) => sum + Number(s.total_amount || 0),
        0
      );

      /** =========================
       * RETURNS (approved/pending) in date range
       * ========================= */
      let returnsBaseQ = (supabase as any)
        .from("returns")
        .select(
          `
          id,
          status,
          quantity,
          created_at,
          sale_item:sale_items(
            unit_price,
            sale:sales!inner(branch_id)
          )
        `
        )
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`);

      if (activeBranchId) {
        returnsBaseQ = returnsBaseQ.eq("sale_item.sale.branch_id", activeBranchId);
      }

      const { data: returnsRows, error: retErr } = await returnsBaseQ;
      if (retErr) throw retErr;

      let returnsApprovedAmount = 0;
      let returnsApprovedCount = 0;
      let returnsPendingCount = 0;

      (returnsRows ?? []).forEach((r: any) => {
        const status = String(r?.status || "").toLowerCase();
        const qty = Number(r?.quantity || 0);
        const unitPrice = Number(r?.sale_item?.unit_price || 0);

        if (status === "approved") {
          returnsApprovedCount += 1;
          returnsApprovedAmount += qty * unitPrice;
        } else if (status === "pending") {
          returnsPendingCount += 1;
        }
      });

      /** =========================
       * EXPENSES (approved only) in date range
       * - uses expense_date
       * ========================= */
      let expQ = (supabase as any)
        .from("expenses")
        .select("id,amount,branch_id,status,expense_date,company_id")
        .eq("status", "approved")
        .gte("expense_date", startDate)
        .lte("expense_date", endDate);

      if (companyId) expQ = expQ.eq("company_id", companyId);
      if (activeBranchId) expQ = expQ.eq("branch_id", activeBranchId);

      const { data: expRows, error: expErr } = await expQ;
      if (expErr) throw expErr;

      const expensesApprovedAmount = (expRows ?? []).reduce(
        (sum: number, e: any) => sum + Number(e?.amount || 0),
        0
      );
      const expensesApprovedCount = (expRows ?? []).length;

      const totalSales = (sales ?? []).length;
      const avgSale = totalSales > 0 ? totalAmount / totalSales : 0;

      const totalDeductions = returnsApprovedAmount + expensesApprovedAmount;
      const netAfterDeductions = totalAmount - totalDeductions;

      setSalesSummary({
        totalSales,
        totalAmount,
        avgSale,

        returnsApprovedAmount,
        returnsApprovedCount,
        returnsPendingCount,

        expensesApprovedAmount,
        expensesApprovedCount,

        totalDeductions,
        netAfterDeductions,
      });

      /** =========================
       * Top products (last 30 days)
       * ========================= */
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      let saleItemsQ = (supabase as any)
        .from("sale_items")
        .select(
          `
          quantity,
          unit_price,
          product:products(name),
          sale:sales!inner(branch_id)
        `
        )
        .gte("created_at", thirtyDaysAgo);

      if (activeBranchId) {
        saleItemsQ = saleItemsQ.eq("sale.branch_id", activeBranchId);
      }

      const { data: saleItems, error: itemsErr } = await saleItemsQ;
      if (itemsErr) throw itemsErr;

      if (saleItems) {
        const productMap = new Map<
          string,
          { total_qty: number; total_revenue: number }
        >();

        saleItems.forEach((item: any) => {
          const name = item?.product?.name || "Unknown";
          const qty = Number(item?.quantity || 0);
          const price = Number(item?.unit_price || 0);
          const existing =
            productMap.get(name) || { total_qty: 0, total_revenue: 0 };
          productMap.set(name, {
            total_qty: existing.total_qty + qty,
            total_revenue: existing.total_revenue + qty * price,
          });
        });

        const sorted = Array.from(productMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.total_revenue - a.total_revenue)
          .slice(0, 10);

        setTopProducts(sorted);
      }

      /** =========================
       * Attendance today
       * ========================= */
      let staffQ = supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .filter("deleted_at", "is", null as any);

      if (activeBranchId) staffQ = staffQ.eq("branch_id", activeBranchId);

      const { count: totalStaff, error: staffErr } = await staffQ;
      if (staffErr) throw staffErr;

      let presentQ = supabase
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("date", today);

      if (activeBranchId) presentQ = presentQ.eq("branch_id", activeBranchId);

      const { count: presentToday, error: presentErr } = await presentQ;
      if (presentErr) throw presentErr;

      setAttendanceSummary({
        total_staff: totalStaff || 0,
        present_today: presentToday || 0,
      });

      /** =========================
       * Low stock
       * ========================= */
      let lowStockQ = supabase
        .from("products")
        .select("name, quantity_in_stock, reorder_level")
        .lt("quantity_in_stock", 10)
        .order("quantity_in_stock", { ascending: true })
        .limit(10);

      if (activeBranchId) lowStockQ = lowStockQ.eq("branch_id", activeBranchId);

      const { data: lowStock, error: lowErr } = await lowStockQ;
      if (lowErr) throw lowErr;

      setLowStockProducts(lowStock || []);
    } catch (error: any) {
      console.error("Error fetching reports:", error);
      toast({
        title: "Report error",
        description: error?.message || "Failed to generate report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /** -----------------------------
   * Branch comparison (ALL branches only)
   * - sums sales + approved returns + approved expenses per branch
   * ------------------------------*/
  const fetchBranchComparison = async () => {
    if (!companyId) return;

    setCompareLoading(true);
    setCompareRows([]);

    try {
      const brMap = new Map<string, string>();
      (branches ?? []).forEach((b) => brMap.set(b.id, b.name));

      // sales in range (all branches)
      const { data: sales, error: salesErr } = await supabase
        .from("sales")
        .select("branch_id,total_amount,created_at")
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`);

      if (salesErr) throw salesErr;

      // returns in range (approved only)
      const { data: returnsRows, error: retErr } = await (supabase as any)
        .from("returns")
        .select(
          `
          status,
          quantity,
          created_at,
          sale_item:sale_items(
            unit_price,
            sale:sales!inner(branch_id)
          )
        `
        )
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`);

      if (retErr) throw retErr;

      // expenses in range (approved only)
      const { data: expRows, error: expErr } = await (supabase as any)
        .from("expenses")
        .select("branch_id,amount,status,expense_date,company_id")
        .eq("company_id", companyId)
        .eq("status", "approved")
        .gte("expense_date", startDate)
        .lte("expense_date", endDate);

      if (expErr) throw expErr;

      const byBranch = new Map<
        string,
        {
          total_sales: number;
          total_revenue: number;
          approved_returns: number;
          approved_expenses: number;
        }
      >();

      (sales ?? []).forEach((s: any) => {
        const bid = String(s?.branch_id || "");
        if (!bid) return;

        const cur = byBranch.get(bid) || {
          total_sales: 0,
          total_revenue: 0,
          approved_returns: 0,
          approved_expenses: 0,
        };

        cur.total_sales += 1;
        cur.total_revenue += Number(s?.total_amount || 0);

        byBranch.set(bid, cur);
      });

      (returnsRows ?? []).forEach((r: any) => {
        const status = String(r?.status || "").toLowerCase();
        if (status !== "approved") return;

        const bid = String(r?.sale_item?.sale?.branch_id || "");
        if (!bid) return;

        const qty = Number(r?.quantity || 0);
        const unitPrice = Number(r?.sale_item?.unit_price || 0);

        const cur = byBranch.get(bid) || {
          total_sales: 0,
          total_revenue: 0,
          approved_returns: 0,
          approved_expenses: 0,
        };

        cur.approved_returns += qty * unitPrice;
        byBranch.set(bid, cur);
      });

      (expRows ?? []).forEach((e: any) => {
        const bid = String(e?.branch_id || "");
        if (!bid) return;

        const cur = byBranch.get(bid) || {
          total_sales: 0,
          total_revenue: 0,
          approved_returns: 0,
          approved_expenses: 0,
        };

        cur.approved_expenses += Number(e?.amount || 0);
        byBranch.set(bid, cur);
      });

      const rows: BranchCompareRow[] = Array.from(byBranch.entries())
        .map(([branch_id, v]) => {
          const total_deductions = v.approved_returns + v.approved_expenses;
          return {
            branch_id,
            branch_name: brMap.get(branch_id) || "Unknown branch",
            total_sales: v.total_sales,
            total_revenue: v.total_revenue,
            approved_returns: v.approved_returns,
            approved_expenses: v.approved_expenses,
            total_deductions,
            net_after_deductions: v.total_revenue - total_deductions,
          };
        })
        .sort((a, b) => b.net_after_deductions - a.net_after_deductions);

      setCompareRows(rows);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Comparison error",
        description: e?.message || "Failed to load branch comparison",
        variant: "destructive",
      });
    } finally {
      setCompareLoading(false);
    }
  };

  /** -----------------------------
   * PDF Export (updated to match new flow)
   * ------------------------------*/
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
      :root {
        --border:#e5e7eb;
        --muted:#6b7280;
        --text:#111827;
        --bg:#ffffff;
        --card:#f8fafc;
      }
      body { font-family: Arial, sans-serif; padding: 18px; color: var(--text); background: var(--bg); }
      .paper { max-width: 1040px; margin: 0 auto; }
      .printBtn { margin-bottom: 14px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: #fff; cursor:pointer; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 14px; }
      .brandWrap { display:flex; gap:12px; align-items:center; }
      .logo {
        width: 46px; height: 46px; border-radius: 14px;
        background: linear-gradient(135deg, #111827, #334155);
        color: #fff; display:flex; align-items:center; justify-content:center;
        font-weight: 900; letter-spacing: .5px;
      }
      .brand { font-weight: 900; font-size: 18px; }
      .sub { font-size: 12px; color: var(--muted); margin-top: 3px; line-height: 1.45; }
      .meta { text-align:right; font-size: 12px; color: var(--muted); }
      .meta b { color: var(--text); }
      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
      .box { padding: 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); font-size: 13px; }
      .boxTitle { font-weight: 800; margin-bottom: 6px; }
      .row { margin: 2px 0; }
      .cards { display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0 10px; }
      .kpi { border: 1px solid var(--border); border-radius: 14px; background: #fff; padding: 10px 12px; }
      .kpi .label { font-size: 12px; color: var(--muted); }
      .kpi .val { font-size: 18px; font-weight: 900; margin-top: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
      th, td { border: 1px solid var(--border); padding: 8px; vertical-align: top; }
      th { background: #f9fafb; text-align: left; }
      .right { text-align:right; }
      .muted { color: var(--muted); }
      .sectionTitle { font-weight: 900; margin-top: 14px; }
      .sigRow { display:flex; gap: 18px; margin-top: 18px; }
      .sigBox { flex: 1; border-top: 1px solid var(--border); padding-top: 8px; font-size: 12px; color: var(--muted); }
      .sigBox b { color: var(--text); }
      @media print {
        .printBtn { display:none; }
        body { padding:0; }
        .paper { max-width:none; }
      }
    </style>
  `;

  const buildPdfContactsHtml = () => {
    const coName = (company?.name || companyName || "Company") as string;

    if (activeBranchId && selectedBranch) {
      return `
        <div class="box">
          <div class="boxTitle">Contact</div>
          <div class="row"><b>Branch:</b> ${escapeHtml(selectedBranch.name)}</div>
          <div class="row"><b>Address:</b> ${escapeHtml(selectedBranch.address || "-")}</div>
          <div class="row"><b>Phone:</b> ${escapeHtml(selectedBranch.phone || "-")}</div>
          <div class="row"><b>Email:</b> ${escapeHtml(selectedBranch.email || "-")}</div>
        </div>
      `;
    }

    const branchContacts = (branches ?? [])
      .map((b) => {
        const phone = b.phone ? `Phone: ${escapeHtml(b.phone)}` : "";
        const email = b.email ? `Email: ${escapeHtml(b.email)}` : "";
        const sep = phone && email ? " • " : "";
        const details = `${phone}${sep}${email}`.trim() || "-";
        return `<div class="row"><b>${escapeHtml(b.name)}:</b> ${details}</div>`;
      })
      .join("");

    return `
      <div class="box">
        <div class="boxTitle">Company Contact</div>
        <div class="row"><b>Company:</b> ${escapeHtml(coName)}</div>
        <div class="row"><b>Address:</b> ${escapeHtml(company?.address || "-")}</div>
        <div class="row"><b>Phone:</b> ${escapeHtml(company?.phone || "-")}</div>
        <div class="row"><b>Email:</b> ${escapeHtml(company?.email || "-")}</div>
        <div style="margin-top:10px;">
          <div class="boxTitle">Branch Contacts</div>
          ${branchContacts || `<div class="row muted">No branches found.</div>`}
        </div>
      </div>
    `;
  };

  const exportReportPdf = () => {
    const coName = (company?.name || companyName || "Company") as string;
    const title = "Reports & Analytics";
    const subtitle = `${startDate} to ${endDate} • ${scopeLabel}`;

    const topProductsRows = topProducts
      .map(
        (p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(p.name)}</td>
            <td class="right">${escapeHtml(p.total_qty)}</td>
            <td class="right">GHC ${money(p.total_revenue)}</td>
          </tr>
        `
      )
      .join("");

    const lowStockRows = lowStockProducts
      .map(
        (p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(p.name)}</td>
            <td class="right">${escapeHtml(p.quantity_in_stock)}</td>
            <td class="right">${escapeHtml(p.reorder_level || 10)}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <html>
        <head>
          <title>${escapeHtml(title)} (${escapeHtml(subtitle)})</title>
          ${basePdfCss}
        </head>
        <body>
          <div class="paper">
            <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

            <div class="header">
              <div class="brandWrap">
                <div class="logo">${escapeHtml(initials(coName))}</div>
                <div>
                  <div class="brand">${escapeHtml(coName)}</div>
                  <div class="sub">
                    <b>${escapeHtml(title)}</b><br/>
                    ${escapeHtml(subtitle)}
                  </div>
                </div>
              </div>

              <div class="meta">
                <div><b>Generated:</b> ${escapeHtml(new Date().toLocaleString())}</div>
                <div><b>Currency:</b> GHS</div>
              </div>
            </div>

            <div class="grid2">
              ${buildPdfContactsHtml()}
              <div class="box">
                <div class="boxTitle">Notes</div>
                <div class="row">• Total deductions = Approved returns + Approved expenses</div>
                <div class="row">• Net revenue = Total revenue − Total deductions</div>
                <div class="row muted">Breakdown: returns GHC ${money(
                  salesSummary.returnsApprovedAmount
                )} • expenses GHC ${money(salesSummary.expensesApprovedAmount)}</div>
              </div>
            </div>

            <div class="cards">
              <div class="kpi">
                <div class="label">Total Sales</div>
                <div class="val">${escapeHtml(salesSummary.totalSales)}</div>
                <div class="muted">transactions</div>
              </div>
              <div class="kpi">
                <div class="label">Total Revenue</div>
                <div class="val">GHC ${money(salesSummary.totalAmount)}</div>
                <div class="muted">gross revenue</div>
              </div>
              <div class="kpi">
                <div class="label">Total Deductions</div>
                <div class="val">GHC ${money(salesSummary.totalDeductions)}</div>
                <div class="muted">${escapeHtml(
                  `${salesSummary.returnsApprovedCount} returns approved • ${salesSummary.returnsPendingCount} pending • ${salesSummary.expensesApprovedCount} expenses approved`
                )}</div>
              </div>
              <div class="kpi">
                <div class="label">Net Revenue</div>
                <div class="val">GHC ${money(salesSummary.netAfterDeductions)}</div>
                <div class="muted">after deductions</div>
              </div>
            </div>

            <div class="sectionTitle">Top Selling Products (Last 30 Days)</div>
            <table>
              <thead>
                <tr>
                  <th style="width:42px;">#</th>
                  <th>Product</th>
                  <th class="right" style="width:120px;">Qty</th>
                  <th class="right" style="width:170px;">Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${
                  topProducts.length
                    ? topProductsRows
                    : `<tr><td colspan="4" class="muted">No sales data available.</td></tr>`
                }
              </tbody>
            </table>

            <div class="sectionTitle">Low Stock Alert</div>
            <table>
              <thead>
                <tr>
                  <th style="width:42px;">#</th>
                  <th>Product</th>
                  <th class="right" style="width:120px;">In Stock</th>
                  <th class="right" style="width:140px;">Reorder At</th>
                </tr>
              </thead>
              <tbody>
                ${
                  lowStockProducts.length
                    ? lowStockRows
                    : `<tr><td colspan="4" class="muted">All products are well stocked.</td></tr>`
                }
              </tbody>
            </table>

            <div class="muted" style="margin-top:10px;">
              Attendance today: ${escapeHtml(
                `${attendanceSummary.present_today}/${attendanceSummary.total_staff}`
              )} staff present.
            </div>

            <div class="sigRow">
              <div class="sigBox"><b>Prepared by:</b><br/>Signature: ____________________</div>
              <div class="sigBox"><b>Checked by:</b><br/>Signature: ____________________</div>
              <div class="sigBox"><b>Approved by:</b><br/>Signature: ____________________</div>
            </div>
          </div>
        </body>
      </html>
    `;

    openPdfWindow(html);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-slate-400">
            Business insights and summaries{" "}
            <span className="text-slate-500">• {scopeLabel}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportReportPdf}>
            Export PDF
          </Button>
        </div>
      </div>

      {/* Date Filter */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label className="text-slate-200">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="flex-1">
              <Label className="text-slate-200">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <Button
              onClick={async () => {
                await fetchReports();
                if (!activeBranchId) await fetchBranchComparison();
              }}
              disabled={loading}
            >
              {loading ? "Loading..." : "Generate Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

     {/* Summary Cards (clean accounting flow) */}
<div className="bg-slate-800/20 border border-slate-700 rounded-xl p-3">
  {/* 
    - Mobile: horizontal scroll, cards keep nice width
    - Desktop: wraps into a grid automatically
  */}
  <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 xl:grid-cols-6 lg:overflow-visible">
    {/* Card base class to keep consistent sizing */}
    {/** Tip: w-[260px] makes them readable on mobile */}
    <Card className="bg-slate-800/50 border-slate-700 min-w-[260px] snap-start lg:min-w-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Total Sales
        </CardTitle>
        <BarChart3 className="h-5 w-5 text-blue-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">
          {salesSummary.totalSales}
        </div>
        <p className="text-xs text-slate-400">transactions</p>
      </CardContent>
    </Card>

    <Card className="bg-slate-800/50 border-slate-700 min-w-[260px] snap-start lg:min-w-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Total Revenue
        </CardTitle>
        <TrendingUp className="h-5 w-5 text-green-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">
          GHC {money(salesSummary.totalAmount)}
        </div>
        <p className="text-xs text-slate-400">gross revenue</p>
      </CardContent>
    </Card>

    {/* ✅ Approved Returns card (restored) */}
    <Card className="bg-slate-800/50 border-slate-700 min-w-[260px] snap-start lg:min-w-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Approved Returns
        </CardTitle>
        <TrendingUp className="h-5 w-5 text-orange-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">
          GHC {money(salesSummary.returnsApprovedAmount)}
        </div>
        <p className="text-xs text-slate-400">
          {salesSummary.returnsApprovedCount} approved •{" "}
          {salesSummary.returnsPendingCount} pending
        </p>
      </CardContent>
    </Card>

    {/* ✅ Approved Expenses card */}
    <Card className="bg-slate-800/50 border-slate-700 min-w-[260px] snap-start lg:min-w-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Approved Expenses
        </CardTitle>
        <TrendingUp className="h-5 w-5 text-amber-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">
          GHC {money(salesSummary.expensesApprovedAmount)}
        </div>
        <p className="text-xs text-slate-400">
          {salesSummary.expensesApprovedCount} approved
        </p>
      </CardContent>
    </Card>

    {/* ✅ Total deductions card (Returns + Expenses) */}
    <Card className="bg-slate-800/50 border-slate-700 min-w-[260px] snap-start lg:min-w-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Total Deductions
        </CardTitle>
        <TrendingUp className="h-5 w-5 text-red-400" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">
          GHC {money(salesSummary.totalDeductions)}
        </div>
        <p className="text-xs text-slate-400">
          returns + expenses
        </p>
        <p className="text-[11px] text-slate-500 mt-1">
          Returns: GHC {money(salesSummary.returnsApprovedAmount)} • Expenses: GHC{" "}
          {money(salesSummary.expensesApprovedAmount)}
        </p>
      </CardContent>
    </Card>

    {/* ✅ Net after deductions */}
    <Card className="bg-slate-800/50 border-slate-700 min-w-[260px] snap-start lg:min-w-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Net After Deductions
        </CardTitle>
        <TrendingUp className="h-5 w-5 text-emerald-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">
          GHC {money(salesSummary.netAfterDeductions)}
        </div>
        <p className="text-xs text-slate-400">
          revenue − deductions
        </p>
      </CardContent>
    </Card>
  </div>

  {/* Optional: subtle helper hint on mobile */}
  <div className="text-[11px] text-slate-500 mt-2 lg:hidden">
    Swipe left/right to view more cards →
  </div>
</div>
      {/* Branch comparison (ALL branches only) */}
      {!activeBranchId && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Branch Comparison (Selected period)
            </CardTitle>
            <Button
              variant="outline"
              onClick={fetchBranchComparison}
              disabled={compareLoading}
            >
              {compareLoading ? "Loading..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Branch</TableHead>
                  <TableHead className="text-slate-400 text-right">Sales</TableHead>
                  <TableHead className="text-slate-400 text-right">Revenue</TableHead>
                  <TableHead className="text-slate-400 text-right">
                    Deductions
                  </TableHead>
                  <TableHead className="text-slate-400 text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compareRows.map((r) => (
                  <TableRow key={r.branch_id} className="border-slate-700">
                    <TableCell className="text-white">
                      {r.branch_name}
                      <div className="text-xs text-slate-500 mt-1">
                        Returns: GHC {money(r.approved_returns)} • Expenses: GHC{" "}
                        {money(r.approved_expenses)}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      {r.total_sales}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      GHC {money(r.total_revenue)}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      GHC {money(r.total_deductions)}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      GHC {money(r.net_after_deductions)}
                    </TableCell>
                  </TableRow>
                ))}

                {compareRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-slate-400 py-6"
                    >
                      No data available for selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Products */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Selling Products (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-slate-400 text-right">
                    Qty Sold
                  </TableHead>
                  <TableHead className="text-slate-400 text-right">
                    Revenue
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((product, idx) => (
                  <TableRow key={idx} className="border-slate-700">
                    <TableCell className="text-white">{product.name}</TableCell>
                    <TableCell className="text-slate-300 text-right">
                      {product.total_qty}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      GHC {money(product.total_revenue)}
                    </TableCell>
                  </TableRow>
                ))}

                {topProducts.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-slate-400 py-6"
                    >
                      No sales data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Package className="h-5 w-5 text-red-500" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-slate-400 text-right">
                    In Stock
                  </TableHead>
                  <TableHead className="text-slate-400 text-right">
                    Reorder At
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockProducts.map((product, idx) => (
                  <TableRow key={idx} className="border-slate-700">
                    <TableCell className="text-white">{product.name}</TableCell>
                    <TableCell className="text-red-400 text-right font-medium">
                      {product.quantity_in_stock}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      {product.reorder_level || 10}
                    </TableCell>
                  </TableRow>
                ))}

                {lowStockProducts.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-slate-400 py-6"
                    >
                      All products are well stocked
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Attendance small note */}
      <div className="text-sm text-slate-500">
        Attendance today:{" "}
        <span className="text-slate-300 font-medium">
          {attendanceSummary.present_today}/{attendanceSummary.total_staff}
        </span>{" "}
        staff present.
      </div>
    </div>
  );
}