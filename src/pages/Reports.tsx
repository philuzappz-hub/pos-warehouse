import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Package, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** -----------------------------
 * Types
 * ------------------------------*/
interface SalesSummary {
  totalSales: number;
  totalAmount: number;
  totalPaidAmount: number;
  outstandingDebt: number;
  totalCustomerDebt: number;
  avgSale: number;

  paidSalesCount: number;
  partialSalesCount: number;
  creditSalesCount: number;

  cashCollectedAmount: number;
  momoCollectedAmount: number;
  cardCollectedAmount: number;
  nonCashCollectedAmount: number;
  creditSalesValue: number;

  returnsApprovedAmount: number;
  returnsApprovedCount: number;
  returnsPendingCount: number;

  expensesApprovedAmount: number;
  expensesApprovedCount: number;
  cashExpensesApprovedAmount: number;

  totalDeductions: number;
  netAfterDeductions: number;
  netCollectedAfterDeductions: number;
  netCashPosition: number;
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
  logo_url?: string | null;
  receipt_footer?: string | null;
  tax_id?: string | null;
};

type BranchCompareRow = {
  branch_id: string;
  branch_name: string;
  total_sales: number;
  total_revenue: number;
  total_paid: number;
  outstanding_debt: number;
  approved_returns: number;
  approved_expenses: number;
  total_deductions: number;
  net_after_deductions: number;
  net_collected_after_deductions: number;
};

type CashReconciliationPreview = {
  cashSalesReceived: number;
  approvedCashReturns: number;
  approvedCashExpenses: number;
  expectedCash: number;
};

type CashReconciliationRow = {
  id: string;
  company_id: string;
  branch_id: string;
  reconciliation_date: string;
  opening_float: number;
  cash_sales_received: number;
  cash_returns_paid: number;
  cash_expenses_paid: number;
  expected_cash: number;
  actual_cash_counted: number;
  difference_amount: number;
  notes: string | null;
  closed_by: string;
  closed_at: string;
  created_at: string;
  updated_at: string;
  is_locked: boolean;
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

function isValidSale(row: any) {
  if (!row) return false;
  if (row?.is_returned) return false;

  const status = String(row?.status || "").toLowerCase();
  if (status === "cancelled" || status === "returned") return false;

  return true;
}

export default function Reports() {
  const { toast } = useToast();
  const { activeBranchId, profile, companyName, companyLogoUrl, user } = useAuth() as any;

  const companyId = (profile as any)?.company_id ?? null;
  const userId = user?.id ?? (profile as any)?.user_id ?? null;

  const [startDate, setStartDate] = useState(isoDate(new Date()));
  const [endDate, setEndDate] = useState(isoDate(new Date()));

  const [salesSummary, setSalesSummary] = useState<SalesSummary>({
    totalSales: 0,
    totalAmount: 0,
    totalPaidAmount: 0,
    outstandingDebt: 0,
    totalCustomerDebt: 0,
    avgSale: 0,

    paidSalesCount: 0,
    partialSalesCount: 0,
    creditSalesCount: 0,

    cashCollectedAmount: 0,
    momoCollectedAmount: 0,
    cardCollectedAmount: 0,
    nonCashCollectedAmount: 0,
    creditSalesValue: 0,

    returnsApprovedAmount: 0,
    returnsApprovedCount: 0,
    returnsPendingCount: 0,

    expensesApprovedAmount: 0,
    expensesApprovedCount: 0,
    cashExpensesApprovedAmount: 0,

    totalDeductions: 0,
    netAfterDeductions: 0,
    netCollectedAfterDeductions: 0,
    netCashPosition: 0,
  });

  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary>({
    total_staff: 0,
    present_today: 0,
  });

  const [lowStockProducts, setLowStockProducts] = useState<
    { name: string; quantity_in_stock: number; reorder_level: number }[]
  >([]);

  const [loading, setLoading] = useState(false);

  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<BranchRow | null>(null);

  const [selectedScopeBranchId, setSelectedScopeBranchId] = useState<string>("all");

  const [compareRows, setCompareRows] = useState<BranchCompareRow[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // reconciliation
  const [reconciliationDate, setReconciliationDate] = useState(isoDate(new Date()));
  const [openingFloat, setOpeningFloat] = useState<string>("0");
  const [actualCashCounted, setActualCashCounted] = useState<string>("0");
  const [reconciliationNotes, setReconciliationNotes] = useState("");
  const [reconLoading, setReconLoading] = useState(false);
  const [reconSaving, setReconSaving] = useState(false);
  const [existingReconciliationId, setExistingReconciliationId] = useState<string | null>(null);
  const [isReconLocked, setIsReconLocked] = useState(false);

  const [reconPreview, setReconPreview] = useState<CashReconciliationPreview>({
    cashSalesReceived: 0,
    approvedCashReturns: 0,
    approvedCashExpenses: 0,
    expectedCash: 0,
  });

  const scopedBranchId = selectedScopeBranchId === "all" ? null : selectedScopeBranchId;

  const scopeLabel = useMemo(() => {
    if (scopedBranchId) return selectedBranch?.name || "Selected branch";
    return "All branches";
  }, [scopedBranchId, selectedBranch?.name]);

  const openingFloatNum = Number(openingFloat || 0);
  const actualCashCountedNum = Number(actualCashCounted || 0);
  const reconciliationDifference = actualCashCountedNum - reconPreview.expectedCash;

  const reconciliationStatus = useMemo(() => {
    const diff = reconciliationDifference;
    if (Math.abs(diff) < 0.005) return "Balanced";
    if (diff < 0) return "Short";
    return "Excess";
  }, [reconciliationDifference]);

  const reconciliationStatusClasses = useMemo(() => {
    if (reconciliationStatus === "Balanced") {
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    }
    if (reconciliationStatus === "Short") {
      return "text-red-300 border-red-500/30 bg-red-500/10";
    }
    return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  }, [reconciliationStatus]);

  const fetchOrgInfo = async () => {
    if (!companyId) {
      setCompany(null);
      setBranches([]);
      setSelectedBranch(null);
      setSelectedScopeBranchId("all");
      return;
    }

    try {
      const { data: co, error: coErr } = await (supabase as any)
        .from("companies")
        .select("id,name,address,phone,email,logo_url,receipt_footer,tax_id")
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
        setSelectedScopeBranchId(activeBranchId);
      } else {
        setSelectedBranch(null);
        setSelectedScopeBranchId("all");
      }
    } catch (e: any) {
      console.error(e);
      setCompany(null);
      setBranches([]);
      setSelectedBranch(null);
      setSelectedScopeBranchId("all");
    }
  };

  useEffect(() => {
    void fetchOrgInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, companyId]);

  useEffect(() => {
    if (!scopedBranchId) {
      setSelectedBranch(null);
      return;
    }
    const match = branches.find((b) => b.id === scopedBranchId) || null;
    setSelectedBranch(match);
  }, [branches, scopedBranchId]);

  useEffect(() => {
    void fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, scopedBranchId]);

  useEffect(() => {
    const expected =
      openingFloatNum +
      reconPreview.cashSalesReceived -
      reconPreview.approvedCashReturns -
      reconPreview.approvedCashExpenses;

    setReconPreview((prev) => ({
      ...prev,
      expectedCash: expected,
    }));
  }, [
    openingFloatNum,
    reconPreview.cashSalesReceived,
    reconPreview.approvedCashReturns,
    reconPreview.approvedCashExpenses,
  ]);

  const resetReconciliationForm = () => {
    setOpeningFloat("0");
    setActualCashCounted("0");
    setReconciliationNotes("");
    setExistingReconciliationId(null);
    setIsReconLocked(false);
  };

  const loadExistingReconciliation = async () => {
    if (!companyId || !scopedBranchId || !reconciliationDate) {
      resetReconciliationForm();
      return;
    }

    setReconLoading(true);

    try {
      const { data, error } = await (supabase as any)
        .from("cash_reconciliations")
        .select("*")
        .eq("company_id", companyId)
        .eq("branch_id", scopedBranchId)
        .eq("reconciliation_date", reconciliationDate)
        .maybeSingle();

      if (error) throw error;

      const row = data as CashReconciliationRow | null;

      if (!row) {
        resetReconciliationForm();
        return;
      }

      setExistingReconciliationId(row.id);
      setOpeningFloat(String(Number(row.opening_float || 0)));
      setActualCashCounted(String(Number(row.actual_cash_counted || 0)));
      setReconciliationNotes(row.notes || "");
      setIsReconLocked(Boolean(row.is_locked));
    } catch (e: any) {
      console.error(e);
      resetReconciliationForm();
    } finally {
      setReconLoading(false);
    }
  };

  useEffect(() => {
    if (!scopedBranchId) {
      resetReconciliationForm();
      return;
    }
    void loadExistingReconciliation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedBranchId, reconciliationDate, companyId]);

  /** -----------------------------
   * Branch comparison (ALL branches only)
   * ------------------------------*/
  const fetchBranchComparison = async () => {
    if (!companyId) return;

    setCompareLoading(true);
    setCompareRows([]);

    try {
      const brMap = new Map<string, string>();
      (branches ?? []).forEach((b) => brMap.set(b.id, b.name));

      const { data: sales, error: salesErr } = await (supabase as any)
        .from("sales")
        .select(
          "branch_id,total_amount,amount_paid,balance_due,created_at,is_returned,company_id,customer_id,status"
        )
        .eq("company_id", companyId)
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`);

      if (salesErr) throw salesErr;

      const { data: returnsRows, error: retErr } = await (supabase as any)
        .from("returns")
        .select(
          `
          status,
          quantity,
          created_at,
          sale_item:sale_items(
            unit_price,
            sale:sales!inner(branch_id,company_id)
          )
        `
        )
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`)
        .eq("sale_item.sale.company_id", companyId);

      if (retErr) throw retErr;

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
          total_paid: number;
          outstanding_debt: number;
          approved_returns: number;
          approved_expenses: number;
        }
      >();

      (sales ?? []).forEach((s: any) => {
        if (!isValidSale(s)) return;

        const bid = String(s?.branch_id || "");
        if (!bid) return;

        const cur = byBranch.get(bid) || {
          total_sales: 0,
          total_revenue: 0,
          total_paid: 0,
          outstanding_debt: 0,
          approved_returns: 0,
          approved_expenses: 0,
        };

        cur.total_sales += 1;
        cur.total_revenue += Number(s?.total_amount || 0);
        cur.total_paid += Number(s?.amount_paid || 0);
        cur.outstanding_debt += Math.max(0, Number(s?.balance_due || 0));

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
          total_paid: 0,
          outstanding_debt: 0,
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
          total_paid: 0,
          outstanding_debt: 0,
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
            total_paid: v.total_paid,
            outstanding_debt: v.outstanding_debt,
            approved_returns: v.approved_returns,
            approved_expenses: v.approved_expenses,
            total_deductions,
            net_after_deductions: v.total_revenue - total_deductions,
            net_collected_after_deductions: v.total_paid - total_deductions,
          };
        })
        .sort((a, b) => b.net_collected_after_deductions - a.net_collected_after_deductions);

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
   * Core report fetch
   * ------------------------------*/
  const fetchReports = async () => {
    if (!companyId) {
      setSalesSummary({
        totalSales: 0,
        totalAmount: 0,
        totalPaidAmount: 0,
        outstandingDebt: 0,
        totalCustomerDebt: 0,
        avgSale: 0,
        paidSalesCount: 0,
        partialSalesCount: 0,
        creditSalesCount: 0,
        cashCollectedAmount: 0,
        momoCollectedAmount: 0,
        cardCollectedAmount: 0,
        nonCashCollectedAmount: 0,
        creditSalesValue: 0,
        returnsApprovedAmount: 0,
        returnsApprovedCount: 0,
        returnsPendingCount: 0,
        expensesApprovedAmount: 0,
        expensesApprovedCount: 0,
        cashExpensesApprovedAmount: 0,
        totalDeductions: 0,
        netAfterDeductions: 0,
        netCollectedAfterDeductions: 0,
        netCashPosition: 0,
      });
      setTopProducts([]);
      setAttendanceSummary({ total_staff: 0, present_today: 0 });
      setLowStockProducts([]);
      setCompareRows([]);
      setReconPreview({
        cashSalesReceived: 0,
        approvedCashReturns: 0,
        approvedCashExpenses: 0,
        expectedCash: 0,
      });
      return;
    }

    setLoading(true);

    try {
      let salesQ = (supabase as any)
        .from("sales")
        .select(
          "id,total_amount,amount_paid,balance_due,payment_status,payment_method,branch_id,company_id,created_at,is_returned,customer_id,status"
        )
        .eq("company_id", companyId)
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`);

      if (scopedBranchId) {
        salesQ = salesQ.eq("branch_id", scopedBranchId);
      }

      const { data: sales, error: salesErr } = await salesQ;
      if (salesErr) throw salesErr;

      const safeSales = (sales ?? []).filter((s: any) => isValidSale(s));

      const totalAmount = safeSales.reduce(
        (sum: number, s: any) => sum + Number(s.total_amount || 0),
        0
      );

      const totalPaidAmount = safeSales.reduce(
        (sum: number, s: any) => sum + Number(s.amount_paid || 0),
        0
      );

      let paidSalesCount = 0;
      let partialSalesCount = 0;
      let creditSalesCount = 0;

      let cashCollectedAmount = 0;
      let momoCollectedAmount = 0;
      let cardCollectedAmount = 0;
      let creditSalesValue = 0;

      safeSales.forEach((s: any) => {
        const ps = String(s?.payment_status || "").toLowerCase();
        const pm = String(s?.payment_method || "").toLowerCase();
        const paid = Number(s?.amount_paid || 0);
        const total = Number(s?.total_amount || 0);

        if (ps === "paid") paidSalesCount += 1;
        else if (ps === "partial") partialSalesCount += 1;
        else if (ps === "credit") creditSalesCount += 1;

        if (pm === "cash") cashCollectedAmount += paid;
        else if (pm === "momo") momoCollectedAmount += paid;
        else if (pm === "card") cardCollectedAmount += paid;
        else if (pm === "credit") creditSalesValue += total;
      });

      const nonCashCollectedAmount = momoCollectedAmount + cardCollectedAmount;

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
            sale:sales!inner(branch_id,company_id,payment_method)
          )
        `
        )
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`)
        .eq("sale_item.sale.company_id", companyId);

      if (scopedBranchId) {
        returnsBaseQ = returnsBaseQ.eq("sale_item.sale.branch_id", scopedBranchId);
      }

      const { data: returnsRows, error: retErr } = await returnsBaseQ;
      if (retErr) throw retErr;

      let returnsApprovedAmount = 0;
      let returnsApprovedCount = 0;
      let returnsPendingCount = 0;
      let approvedCashReturnsAmount = 0;

      (returnsRows ?? []).forEach((r: any) => {
        const status = String(r?.status || "").toLowerCase();
        const qty = Number(r?.quantity || 0);
        const unitPrice = Number(r?.sale_item?.unit_price || 0);
        const amount = qty * unitPrice;
        const salePaymentMethod = String(r?.sale_item?.sale?.payment_method || "").toLowerCase();

        if (status === "approved") {
          returnsApprovedCount += 1;
          returnsApprovedAmount += amount;
          if (salePaymentMethod === "cash") {
            approvedCashReturnsAmount += amount;
          }
        } else if (status === "pending") {
          returnsPendingCount += 1;
        }
      });

      let expQ = (supabase as any)
        .from("expenses")
        .select("id,amount,branch_id,status,expense_date,company_id,payment_method")
        .eq("status", "approved")
        .eq("company_id", companyId)
        .gte("expense_date", startDate)
        .lte("expense_date", endDate);

      if (scopedBranchId) expQ = expQ.eq("branch_id", scopedBranchId);

      const { data: expRows, error: expErr } = await expQ;
      if (expErr) throw expErr;

      const expensesApprovedAmount = (expRows ?? []).reduce(
        (sum: number, e: any) => sum + Number(e?.amount || 0),
        0
      );
      const expensesApprovedCount = (expRows ?? []).length;
      const cashExpensesApprovedAmount = (expRows ?? []).reduce((sum: number, e: any) => {
        const pm = String(e?.payment_method || "").toLowerCase();
        if (pm !== "cash") return sum;
        return sum + Number(e?.amount || 0);
      }, 0);

      const totalSales = safeSales.length;
      const avgSale = totalSales > 0 ? totalAmount / totalSales : 0;

      const outstandingDebt = safeSales.reduce((sum: number, s: any) => {
        const balance = Number(s?.balance_due || 0);
        return sum + (balance > 0 ? balance : 0);
      }, 0);

      const totalCustomerDebt = safeSales.reduce((sum: number, s: any) => {
        const hasCustomer = !!String(s?.customer_id || "").trim();
        const balance = Number(s?.balance_due || 0);
        if (!hasCustomer || balance <= 0) return sum;
        return sum + balance;
      }, 0);

      const totalDeductions = returnsApprovedAmount + expensesApprovedAmount;
      const netAfterDeductions = totalAmount - totalDeductions;
      const netCollectedAfterDeductions = totalPaidAmount - totalDeductions;
      const netCashPosition =
        cashCollectedAmount - approvedCashReturnsAmount - cashExpensesApprovedAmount;

      setSalesSummary({
        totalSales,
        totalAmount,
        totalPaidAmount,
        outstandingDebt,
        totalCustomerDebt,
        avgSale,

        paidSalesCount,
        partialSalesCount,
        creditSalesCount,

        cashCollectedAmount,
        momoCollectedAmount,
        cardCollectedAmount,
        nonCashCollectedAmount,
        creditSalesValue,

        returnsApprovedAmount,
        returnsApprovedCount,
        returnsPendingCount,

        expensesApprovedAmount,
        expensesApprovedCount,
        cashExpensesApprovedAmount,

        totalDeductions,
        netAfterDeductions,
        netCollectedAfterDeductions,
        netCashPosition,
      });

      setReconPreview({
        cashSalesReceived: cashCollectedAmount,
        approvedCashReturns: approvedCashReturnsAmount,
        approvedCashExpenses: cashExpensesApprovedAmount,
        expectedCash:
          openingFloatNum +
          cashCollectedAmount -
          approvedCashReturnsAmount -
          cashExpensesApprovedAmount,
      });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      let saleItemsQ = (supabase as any)
        .from("sale_items")
        .select(
          `
          quantity,
          unit_price,
          product:products(name,company_id),
          sale:sales!inner(branch_id,company_id,is_returned,status)
        `
        )
        .gte("created_at", thirtyDaysAgo)
        .eq("sale.company_id", companyId);

      if (scopedBranchId) {
        saleItemsQ = saleItemsQ.eq("sale.branch_id", scopedBranchId);
      }

      const { data: saleItems, error: itemsErr } = await saleItemsQ;
      if (itemsErr) throw itemsErr;

      if (saleItems) {
        const productMap = new Map<string, { total_qty: number; total_revenue: number }>();

        saleItems.forEach((item: any) => {
          if (!isValidSale(item?.sale)) return;

          const name = item?.product?.name || "Unknown";
          const qty = Number(item?.quantity || 0);
          const price = Number(item?.unit_price || 0);
          const existing = productMap.get(name) || { total_qty: 0, total_revenue: 0 };

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

      const today = isoDate(new Date());

      let staffQ = (supabase as any)
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .filter("deleted_at", "is", null);

      if (scopedBranchId) staffQ = staffQ.eq("branch_id", scopedBranchId);

      const { count: totalStaff, error: staffErr } = await staffQ;
      if (staffErr) throw staffErr;

      let presentQ = (supabase as any)
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("date", today);

      if (scopedBranchId) presentQ = presentQ.eq("branch_id", scopedBranchId);

      const { count: presentToday, error: presentErr } = await presentQ;
      if (presentErr) throw presentErr;

      setAttendanceSummary({
        total_staff: totalStaff || 0,
        present_today: presentToday || 0,
      });

      let lowStockQ = (supabase as any)
        .from("products")
        .select("name, quantity_in_stock, reorder_level")
        .eq("company_id", companyId)
        .lt("quantity_in_stock", 10)
        .order("quantity_in_stock", { ascending: true })
        .limit(10);

      if (scopedBranchId) lowStockQ = lowStockQ.eq("branch_id", scopedBranchId);

      const { data: lowStock, error: lowErr } = await lowStockQ;
      if (lowErr) throw lowErr;

      setLowStockProducts(lowStock || []);

      if (!scopedBranchId) {
        await fetchBranchComparison();
      } else {
        setCompareRows([]);
      }
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

  const handleSaveReconciliation = async () => {
    if (!companyId || !scopedBranchId || !userId) {
      toast({
        title: "Missing details",
        description: "Company, branch, or user is missing.",
        variant: "destructive",
      });
      return;
    }

    if (isReconLocked) {
      toast({
        title: "Locked record",
        description: "This closing record is locked and cannot be edited.",
        variant: "destructive",
      });
      return;
    }

    setReconSaving(true);

    const nowIso = new Date().toISOString();

    const payload = {
      company_id: companyId,
      branch_id: scopedBranchId,
      reconciliation_date: reconciliationDate,
      opening_float: openingFloatNum,
      cash_sales_received: reconPreview.cashSalesReceived,
      cash_returns_paid: reconPreview.approvedCashReturns,
      cash_expenses_paid: reconPreview.approvedCashExpenses,
      expected_cash: reconPreview.expectedCash,
      actual_cash_counted: actualCashCountedNum,
      difference_amount: reconciliationDifference,
      notes: reconciliationNotes.trim() || null,
      closed_by: userId,
      closed_at: nowIso,
      is_locked: true,
    };

    try {
      if (existingReconciliationId) {
        const { error } = await (supabase as any)
          .from("cash_reconciliations")
          .update({
            opening_float: payload.opening_float,
            cash_sales_received: payload.cash_sales_received,
            cash_returns_paid: payload.cash_returns_paid,
            cash_expenses_paid: payload.cash_expenses_paid,
            expected_cash: payload.expected_cash,
            actual_cash_counted: payload.actual_cash_counted,
            difference_amount: payload.difference_amount,
            notes: payload.notes,
            closed_by: payload.closed_by,
            closed_at: payload.closed_at,
            is_locked: payload.is_locked,
          })
          .eq("id", existingReconciliationId);

        if (error) throw error;

        setIsReconLocked(true);

        toast({
          title: "Reconciliation updated",
          description: "Closing record updated and locked successfully.",
        });
      } else {
        const { data, error } = await (supabase as any)
          .from("cash_reconciliations")
          .insert(payload)
          .select("id,is_locked")
          .single();

        if (error) throw error;

        setExistingReconciliationId(String(data?.id || ""));
        setIsReconLocked(Boolean(data?.is_locked ?? true));

        toast({
          title: "Reconciliation saved",
          description: "Closing record saved and locked successfully.",
        });
      }
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save reconciliation.",
        variant: "destructive",
      });
    } finally {
      setReconSaving(false);
    }
  };

  /** -----------------------------
   * PDF / Print
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
      :root { --border:#e5e7eb; --muted:#6b7280; --text:#111827; --soft:#f9fafb; }
      body { font-family: Arial, sans-serif; padding: 18px; color: var(--text); }
      .paper { max-width: 1100px; margin: 0 auto; }
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
      .box {
        margin: 10px 0 14px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: white;
      }
      .boxTitle { font-weight: 800; margin-bottom: 8px; }
      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; background:white; }
      th, td { border: 1px solid var(--border); padding: 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      .muted { color: var(--muted); }
      .right { text-align:right; }
      .sigRow { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 24px; }
      .sigBox { font-size: 12px; }
      .sigLine { border-bottom: 1px solid #9ca3af; height: 22px; margin-top: 24px; }
      .sigLabel { color: var(--muted); margin-top: 6px; }
      @media print {
        .printBtn { display:none; }
        body { padding:0; }
        .paper { max-width:none; }
      }
    </style>
  `;

  const buildPdfHeader = (title: string, subtitle: string, logoDataUrl: string | null) => {
    const co = (company?.name || companyName || "Company") as string;
    const initials = companyInitials(co);

    const scopeLine = scopedBranchId ? selectedBranch?.name || "Selected Branch" : "All Branches";

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
          <div><b>Currency:</b> GHS</div>
        </div>
      </div>
    `;
  };

  const buildPdfContactsHtml = () => {
    const coName = (company?.name || companyName || "Company") as string;

    if (scopedBranchId && selectedBranch) {
      return `
        <div class="box">
          <div class="boxTitle">Branch Contacts</div>
          <div class="muted" style="font-size:12px; line-height:1.5;">
            <div><b>Branch:</b> ${escapeHtml(selectedBranch.name)}</div>
            <div><b>Address:</b> ${escapeHtml(selectedBranch.address || "-")}</div>
            <div><b>Phone:</b> ${escapeHtml(selectedBranch.phone || "-")}</div>
            <div><b>Email:</b> ${escapeHtml(selectedBranch.email || "-")}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="box">
        <div class="boxTitle">Company Contacts</div>
        <div class="muted" style="font-size:12px; line-height:1.5;">
          <div><b>Company:</b> ${escapeHtml(coName)}</div>
          <div><b>Address:</b> ${escapeHtml(company?.address || "-")}</div>
          <div><b>Phone:</b> ${escapeHtml(company?.phone || "-")}</div>
          <div><b>Email:</b> ${escapeHtml(company?.email || "-")}</div>
        </div>
      </div>
    `;
  };

  const exportReportPdf = async () => {
    try {
      const logoDataUrl = await urlToDataUrl(companyLogoUrl || company?.logo_url || null);

      const title = "Financial Report";
      const subtitle = `${startDate} to ${endDate}`;

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
              <div class="grid2">
                ${buildPdfContactsHtml()}
                <div class="box">
                  <div class="boxTitle">Summary</div>
                  <div class="muted" style="font-size:12px; line-height:1.5;">
                    <div>Gross Revenue: GHC ${escapeHtml(money(salesSummary.totalAmount))}</div>
                    <div>Total Paid: GHC ${escapeHtml(money(salesSummary.totalPaidAmount))}</div>
                    <div>Net Cash Position: GHC ${escapeHtml(money(salesSummary.netCashPosition))}</div>
                  </div>
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

  const printClosingSlip = async () => {
    if (!scopedBranchId) {
      toast({
        title: "Branch required",
        description: "Please select a branch before printing a closing slip.",
        variant: "destructive",
      });
      return;
    }

    const branchLabel = selectedBranch?.name || "Selected Branch";
    const logoDataUrl = await urlToDataUrl(companyLogoUrl || company?.logo_url || null);
    const title = "Daily Cash Closing Slip";
    const subtitle = `Closing Date: ${reconciliationDate}`;

    const companyDisplay = company?.name || companyName || "Company";
    const initials = companyInitials(companyDisplay);
    const logoHtml = logoDataUrl
      ? `<img class="logoImg" src="${logoDataUrl}" alt="Logo" />`
      : escapeHtml(initials);

    const diffText =
      reconciliationStatus === "Balanced"
        ? "Balanced"
        : reconciliationStatus === "Short"
        ? "Shortage"
        : "Excess";

    const html = `
      <html>
        <head>
          <title>${escapeHtml(title)} - ${escapeHtml(branchLabel)} - ${escapeHtml(
      reconciliationDate
    )}</title>
          ${basePdfCss}
        </head>
        <body>
          <div class="paper">
            <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

            <div class="header">
              <div class="brandRow">
                <div class="logoBadge">${logoHtml}</div>
                <div>
                  <div class="brand">${escapeHtml(companyDisplay)}</div>
                  <div style="font-weight:800; margin-top:2px;">${escapeHtml(title)}</div>
                  <div class="sub">
                    ${escapeHtml(subtitle)}<br/>
                    ${escapeHtml(branchLabel)}
                  </div>
                </div>
              </div>
              <div class="meta">
                <div><b>Generated:</b> ${escapeHtml(new Date().toLocaleString())}</div>
                <div><b>Status:</b> ${escapeHtml(diffText)}</div>
              </div>
            </div>

            <div class="grid2">
              <div class="box">
                <div class="boxTitle">Branch Details</div>
                <div class="muted" style="font-size:12px; line-height:1.6;">
                  <div><b>Branch:</b> ${escapeHtml(branchLabel)}</div>
                  <div><b>Address:</b> ${escapeHtml(selectedBranch?.address || "-")}</div>
                  <div><b>Phone:</b> ${escapeHtml(selectedBranch?.phone || "-")}</div>
                  <div><b>Email:</b> ${escapeHtml(selectedBranch?.email || "-")}</div>
                </div>
              </div>

              <div class="box">
                <div class="boxTitle">Closing Notes</div>
                <div class="muted" style="font-size:12px; line-height:1.6;">
                  ${escapeHtml(reconciliationNotes || "No notes added.")}
                </div>
              </div>
            </div>

            <div class="box">
              <div class="boxTitle">Cash Breakdown</div>
              <table>
                <tbody>
                  <tr>
                    <th>Opening Float</th>
                    <td class="right">GHS ${escapeHtml(money(openingFloatNum))}</td>
                  </tr>
                  <tr>
                    <th>Cash Sales Received</th>
                    <td class="right">GHS ${escapeHtml(money(reconPreview.cashSalesReceived))}</td>
                  </tr>
                  <tr>
                    <th>Approved Cash Returns</th>
                    <td class="right">GHS ${escapeHtml(money(reconPreview.approvedCashReturns))}</td>
                  </tr>
                  <tr>
                    <th>Approved Cash Expenses</th>
                    <td class="right">GHS ${escapeHtml(money(reconPreview.approvedCashExpenses))}</td>
                  </tr>
                  <tr>
                    <th>Expected Cash</th>
                    <td class="right">GHS ${escapeHtml(money(reconPreview.expectedCash))}</td>
                  </tr>
                  <tr>
                    <th>Actual Cash Counted</th>
                    <td class="right">GHS ${escapeHtml(money(actualCashCountedNum))}</td>
                  </tr>
                  <tr>
                    <th>${escapeHtml(diffText)}</th>
                    <td class="right">GHS ${escapeHtml(money(reconciliationDifference))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="box">
              <div class="boxTitle">Formula</div>
              <div class="muted" style="font-size:12px; line-height:1.6;">
                Expected Cash = Opening Float + Cash Sales Received − Approved Cash Returns − Approved Cash Expenses
              </div>
            </div>

            <div class="sigRow">
              <div class="sigBox">
                <b>Prepared by</b>
                <div class="sigLine"></div>
                <div class="sigLabel">Cashier / Officer</div>
              </div>
              <div class="sigBox">
                <b>Checked by</b>
                <div class="sigLine"></div>
                <div class="sigLabel">Supervisor</div>
              </div>
              <div class="sigBox">
                <b>Approved by</b>
                <div class="sigLine"></div>
                <div class="sigLabel">Manager / Admin</div>
              </div>
            </div>

            <div class="muted" style="margin-top:18px; font-size:11px;">
              ${escapeHtml(company?.receipt_footer || "Powered by Philuz Appz")}
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
          <h1 className="text-2xl font-bold text-white">Financial Report</h1>
          <p className="text-slate-400">
            Company financial insights and branch summaries{" "}
            <span className="text-slate-500">• {scopeLabel}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportReportPdf}>
            Export PDF
          </Button>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-end">
            <div>
              <Label className="text-slate-200">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-200">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-200">Branch Scope</Label>
              <Select
                value={selectedScopeBranchId}
                onValueChange={(v) => setSelectedScopeBranchId(v)}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select branch scope" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Button onClick={() => void fetchReports()} disabled={loading} className="w-full">
                {loading ? "Loading..." : "Generate Report"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Gross Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">GHC {money(salesSummary.totalAmount)}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              GHC {money(salesSummary.totalPaidAmount)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Cash Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              GHC {money(salesSummary.cashCollectedAmount)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Outstanding Debt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-300">
              GHC {money(salesSummary.outstandingDebt)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Net Cash Position</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-300">
              GHC {money(salesSummary.netCashPosition)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Daily Cash Reconciliation
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {!scopedBranchId ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-slate-300">
              Cash reconciliation is <span className="font-semibold text-white">branch-specific</span>.
              Please select one branch above.
            </div>
          ) : (
            <>
              {existingReconciliationId && isReconLocked && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-300">
                      Locked Closing Record
                    </span>
                    <span className="text-sm text-slate-300">
                      This reconciliation has already been closed and cannot be edited.
                    </span>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <Label className="text-slate-200">Reconciliation Date</Label>
                  <Input
                    type="date"
                    value={reconciliationDate}
                    onChange={(e) => setReconciliationDate(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>

                <div>
                  <Label className="text-slate-200">Opening Float</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    disabled={isReconLocked}
                  />
                </div>

                <div>
                  <Label className="text-slate-200">Actual Cash Counted</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={actualCashCounted}
                    onChange={(e) => setActualCashCounted(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    disabled={isReconLocked}
                  />
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Status</p>
                  <div
                    className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-medium ${reconciliationStatusClasses}`}
                  >
                    {reconciliationStatus}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-slate-200">Notes</Label>
                <Input
                  value={reconciliationNotes}
                  onChange={(e) => setReconciliationNotes(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="Optional note about shortage, excess, or closing remarks"
                  disabled={isReconLocked}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Cash Sales Received</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    GHC {money(reconPreview.cashSalesReceived)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Approved Cash Returns</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    GHC {money(reconPreview.approvedCashReturns)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Approved Cash Expenses</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    GHC {money(reconPreview.approvedCashExpenses)}
                  </p>
                </div>

                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                  <p className="text-[11px] text-cyan-200">Expected Cash</p>
                  <p className="mt-2 text-2xl font-bold text-cyan-100">
                    GHC {money(reconPreview.expectedCash)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Difference</p>
                  <p
                    className={`mt-2 text-2xl font-bold ${
                      reconciliationStatus === "Balanced"
                        ? "text-emerald-300"
                        : reconciliationStatus === "Short"
                        ? "text-red-300"
                        : "text-amber-300"
                    }`}
                  >
                    GHC {money(reconciliationDifference)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleSaveReconciliation}
                  disabled={reconSaving || reconLoading || isReconLocked}
                >
                  {reconSaving
                    ? "Saving..."
                    : existingReconciliationId
                    ? "Update Closing Record"
                    : "Save Closing Record"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => void loadExistingReconciliation()}
                  disabled={reconLoading}
                >
                  {reconLoading ? "Loading..." : "Reload Saved Record"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => void printClosingSlip()}
                  disabled={!scopedBranchId}
                >
                  Print Closing Slip
                </Button>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-300">
                <p className="font-medium text-white mb-2">Formula</p>
                <p>
                  Expected Cash = Opening Float + Cash Sales Received − Approved Cash Returns −
                  Approved Cash Expenses
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!scopedBranchId && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Branch Comparison
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => void fetchBranchComparison()}
              disabled={compareLoading}
            >
              {compareLoading ? "Loading..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Branch</TableHead>
                  <TableHead className="text-slate-400 text-right">Sales</TableHead>
                  <TableHead className="text-slate-400 text-right">Revenue</TableHead>
                  <TableHead className="text-slate-400 text-right">Paid</TableHead>
                  <TableHead className="text-slate-400 text-right">Debt</TableHead>
                  <TableHead className="text-slate-400 text-right">Deductions</TableHead>
                  <TableHead className="text-slate-400 text-right">Net Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compareRows.map((r) => (
                  <TableRow key={r.branch_id} className="border-slate-700">
                    <TableCell className="text-white">{r.branch_name}</TableCell>
                    <TableCell className="text-slate-300 text-right">{r.total_sales}</TableCell>
                    <TableCell className="text-slate-300 text-right">
                      GHC {money(r.total_revenue)}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      GHC {money(r.total_paid)}
                    </TableCell>
                    <TableCell className="text-yellow-300 text-right">
                      GHC {money(r.outstanding_debt)}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      GHC {money(r.total_deductions)}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      GHC {money(r.net_collected_after_deductions)}
                    </TableCell>
                  </TableRow>
                ))}

                {compareRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-400 py-6">
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
                  <TableHead className="text-slate-400 text-right">Qty Sold</TableHead>
                  <TableHead className="text-slate-400 text-right">Revenue</TableHead>
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
                    <TableCell colSpan={3} className="text-center text-slate-400 py-6">
                      No sales data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
                  <TableHead className="text-slate-400 text-right">In Stock</TableHead>
                  <TableHead className="text-slate-400 text-right">Reorder At</TableHead>
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
                    <TableCell colSpan={3} className="text-center text-slate-400 py-6">
                      All products are well stocked
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

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