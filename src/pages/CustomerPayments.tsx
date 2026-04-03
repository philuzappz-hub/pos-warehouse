import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CustomerPaymentAllocationDialog from "@/features/customers/components/CustomerPaymentAllocationDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText,
  History,
  MessageCircle,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  company_id: string;
  branch_id: string | null;
  created_at: string;
};

type SaleDebtRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  receipt_number: string | null;
  total_amount: number | string | null;
  original_amount_paid?: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  payment_status: string | null;
  payment_method: string | null;
  status: string | null;
  is_returned: boolean | null;
  created_at: string;
  branch_id?: string | null;
};

type CustomerDebtSummary = {
  customer_id: string;
  full_name: string;
  phone: string | null;
  total_purchases: number;
  total_spent: number;
  total_paid: number;
  balance_due: number;
  debt_sales_count: number;
  last_purchase: string | null;
};

type CustomerPaymentBalanceRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  customer_id: string;
  sale_id: string | null;
  payment_date: string;
  amount: number | string | null;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  allocated_amount: number | string | null;
  unallocated_amount: number | string | null;
  allocation_status: string | null;
  created_at: string;
  updated_at: string;
};

type AllocationDetailRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  customer_payment_id: string;
  sale_id: string;
  customer_id: string;
  full_name: string | null;
  receipt_number: string | null;
  sale_total_amount: number | string | null;
  sale_amount_paid: number | string | null;
  sale_balance_due: number | string | null;
  allocated_amount: number | string | null;
  allocation_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerUiSummary = CustomerDebtSummary & {
  unallocated_amount: number;
  effective_debt: number;
  credit_on_account: number;
};

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(v: number | string | null | undefined) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizePaymentStatus(v: string | null | undefined) {
  const s = String(v || "").toLowerCase();
  if (s === "paid" || s === "partial" || s === "credit") return s;
  return "paid";
}

function normalizeAllocationStatus(v: string | null | undefined) {
  const s = String(v || "").toLowerCase();
  if (s === "fully_allocated") return "fully_allocated";
  if (s === "partial") return "partial";
  return "unallocated";
}

function allocationBadgeClass(status: string | null | undefined) {
  const s = normalizeAllocationStatus(status);

  if (s === "fully_allocated") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  if (s === "partial") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  return "border-slate-600 bg-slate-800 text-slate-300";
}

function allocationBadgeLabel(status: string | null | undefined) {
  const s = normalizeAllocationStatus(status);

  if (s === "fully_allocated") return "Fully Allocated";
  if (s === "partial") return "Partially Allocated";
  return "Unallocated";
}

function escapeHtml(str: any) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  const u = String(url || "").trim();
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

function formatDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildWhatsAppPhone(phone?: string | null) {
  const raw = String(phone || "").replace(/\D/g, "");
  if (!raw) return "";

  if (raw.startsWith("233")) return raw;
  if (raw.startsWith("0") && raw.length === 10) return `233${raw.slice(1)}`;
  return raw;
}

function isReturnedSale(sale: {
  is_returned?: boolean | null;
  status?: string | null;
}) {
  return !!sale?.is_returned || String(sale?.status || "").toLowerCase() === "returned";
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function methodBadgeClass(method: string | null | undefined) {
  const s = String(method || "").toLowerCase();
  if (s === "cash") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (s === "momo") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
  if (s === "card") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (s === "bank transfer") return "border-violet-500/30 bg-violet-500/10 text-violet-300";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

export default function CustomerPayments() {
  const { profile, companyName, companyLogoUrl, activeBranchId, branchId } = useAuth() as any;
  const { toast } = useToast();

  const companyId = (profile as any)?.company_id ?? null;
  const currentBranchId = activeBranchId || branchId || null;
  const actorId = (profile as any)?.user_id ?? (profile as any)?.id ?? null;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<SaleDebtRow[]>([]);
  const [customerPaymentBalances, setCustomerPaymentBalances] = useState<CustomerPaymentBalanceRow[]>([]);
  const [search, setSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [payOpen, setPayOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerUiSummary | null>(null);
  const [allocationCustomer, setAllocationCustomer] = useState<CustomerUiSummary | null>(null);
  const [allocationPaymentId, setAllocationPaymentId] = useState<string | null>(null);
  const [allocationAmount, setAllocationAmount] = useState<number>(0);

  const [selectedPayment, setSelectedPayment] = useState<CustomerPaymentBalanceRow | null>(null);
  const [allocationHistoryRows, setAllocationHistoryRows] = useState<AllocationDetailRow[]>([]);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [savingPayment, setSavingPayment] = useState(false);
  const [exportingStatement, setExportingStatement] = useState<string | null>(null);
  const [savingAutoAllocateId, setSavingAutoAllocateId] = useState<string | null>(null);

  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");

  const loadData = async () => {
    if (!companyId) {
      setCustomers([]);
      setSales([]);
      setCustomerPaymentBalances([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [customersRes, salesRes, paymentBalancesRes] = await Promise.all([
      (supabase as any)
        .from("customers")
        .select("id,full_name,phone,email,address,is_active,company_id,branch_id,created_at")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("full_name"),
      (supabase as any)
        .from("sales")
        .select(
          "id,customer_id,customer_name,customer_phone,receipt_number,total_amount,original_amount_paid,amount_paid,balance_due,payment_status,payment_method,status,is_returned,created_at,branch_id"
        )
        .eq("company_id", companyId)
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("customer_payment_balance_view")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);

    if (customersRes.error) {
      toast({
        title: "Error",
        description: "Failed to load customers",
        variant: "destructive",
      });
      setCustomers([]);
    } else {
      setCustomers((customersRes.data || []) as Customer[]);
    }

    if (salesRes.error) {
      toast({
        title: "Error",
        description: "Failed to load customer balances",
        variant: "destructive",
      });
      setSales([]);
    } else {
      setSales((salesRes.data || []) as SaleDebtRow[]);
    }

    if (paymentBalancesRes.error) {
      toast({
        title: "Error",
        description: "Failed to load customer payment balances",
        variant: "destructive",
      });
      setCustomerPaymentBalances([]);
    } else {
      setCustomerPaymentBalances((paymentBalancesRes.data || []) as CustomerPaymentBalanceRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, currentBranchId]);

  const validSales = useMemo(() => {
    return sales.filter((s: any) => {
      const customerId = String(s.customer_id || "").trim();
      if (!customerId) return false;

      if (isReturnedSale(s)) return false;
      if (String(s.status || "").toLowerCase() === "cancelled") return false;

      if (currentBranchId && String(s.branch_id || "") !== String(currentBranchId)) {
        return false;
      }

      return true;
    });
  }, [sales, currentBranchId]);

  const scopedPaymentBalances = useMemo(() => {
    return customerPaymentBalances.filter((p) => {
      if (!currentBranchId) return true;
      if (!p.branch_id) return true;
      return String(p.branch_id) === String(currentBranchId);
    });
  }, [customerPaymentBalances, currentBranchId]);

  const unallocatedByCustomer = useMemo(() => {
    const map = new Map<string, number>();

    for (const p of scopedPaymentBalances) {
      const customerId = String(p.customer_id || "").trim();
      if (!customerId) continue;
      const next = (map.get(customerId) || 0) + num(p.unallocated_amount);
      map.set(customerId, next);
    }

    return map;
  }, [scopedPaymentBalances]);

  const debtSummary = useMemo<CustomerUiSummary[]>(() => {
    const customerMap = new Map<string, Customer>();
    for (const c of customers) customerMap.set(c.id, c);

    const map = new Map<string, CustomerDebtSummary>();

    for (const s of validSales) {
      const customerId = String(s.customer_id || "");
      if (!customerId) continue;

      const customer = customerMap.get(customerId);
      const totalAmount = Math.max(0, num(s.total_amount));
      const amountPaid = Math.max(0, num(s.amount_paid));
      const rawBalance = Math.max(0, num(s.balance_due));
      const inferredBalance = Math.max(0, totalAmount - amountPaid);
      const balanceDue = rawBalance > 0 ? rawBalance : inferredBalance;
      const paymentStatus = normalizePaymentStatus(s.payment_status);
      const hasDebt =
        paymentStatus === "credit" || paymentStatus === "partial" || balanceDue > 0;

      const existing = map.get(customerId) || {
        customer_id: customerId,
        full_name: customer?.full_name || String(s.customer_name || "Unknown Customer"),
        phone: customer?.phone || (s.customer_phone ?? null),
        total_purchases: 0,
        total_spent: 0,
        total_paid: 0,
        balance_due: 0,
        debt_sales_count: 0,
        last_purchase: null,
      };

      existing.total_purchases += 1;
      existing.total_spent += totalAmount;
      existing.total_paid += Math.min(amountPaid, totalAmount);
      existing.balance_due += balanceDue;

      if (hasDebt) existing.debt_sales_count += 1;

      if (!existing.last_purchase || s.created_at > existing.last_purchase) {
        existing.last_purchase = s.created_at;
      }

      map.set(customerId, existing);
    }

    return Array.from(map.values())
      .filter((x) => x.total_purchases > 0)
      .map((x) => {
        const unallocated = unallocatedByCustomer.get(x.customer_id) || 0;
        const effectiveDebt = Math.max(0, x.balance_due - unallocated);
        const creditOnAccount = Math.max(0, unallocated - x.balance_due);

        return {
          ...x,
          unallocated_amount: unallocated,
          effective_debt: effectiveDebt,
          credit_on_account: creditOnAccount,
        };
      })
      .sort((a, b) => {
        if (b.effective_debt !== a.effective_debt) return b.effective_debt - a.effective_debt;
        if (b.credit_on_account !== a.credit_on_account) return b.credit_on_account - a.credit_on_account;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [customers, validSales, unallocatedByCustomer]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return debtSummary.filter((c) => {
      if (!q) return true;

      return (
        String(c.full_name || "").toLowerCase().includes(q) ||
        String(c.phone || "").toLowerCase().includes(q)
      );
    });
  }, [debtSummary, search]);

  const filteredPaymentRows = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();

    return scopedPaymentBalances.filter((p) => {
      const matchingCustomer = customers.find((c) => String(c.id) === String(p.customer_id));
      const customerName = matchingCustomer?.full_name || "";

      if (!q) return true;

      return (
        customerName.toLowerCase().includes(q) ||
        String(p.payment_method || "").toLowerCase().includes(q) ||
        String(p.reference_number || "").toLowerCase().includes(q) ||
        String(p.notes || "").toLowerCase().includes(q) ||
        allocationBadgeLabel(p.allocation_status).toLowerCase().includes(q)
      );
    });
  }, [scopedPaymentBalances, customers, paymentSearch]);

  const rawCustomerHistory = useMemo(() => {
    if (!selectedCustomer) return [];

    return validSales
      .filter((s) => s.customer_id === selectedCustomer.customer_id)
      .map((s) => {
        const totalAmount = Math.max(0, num(s.total_amount));
        const amountPaid = Math.max(0, num(s.amount_paid));
        const rawBalance = Math.max(0, num(s.balance_due));
        const balanceDue = rawBalance > 0 ? rawBalance : Math.max(0, totalAmount - amountPaid);
        const paymentStatus = normalizePaymentStatus(s.payment_status);

        const matchingPayments = scopedPaymentBalances.filter(
          (p) =>
            String(p.customer_id) === String(selectedCustomer.customer_id) &&
            (String(p.sale_id || "") === String(s.id) || num(p.allocated_amount) > 0)
        );

        const allocatedToThisCustomer = matchingPayments.reduce(
          (sum, p) => sum + num(p.allocated_amount),
          0
        );

        let allocationStatus: string = "unallocated";
        if (allocatedToThisCustomer >= totalAmount && totalAmount > 0) {
          allocationStatus = "fully_allocated";
        } else if (allocatedToThisCustomer > 0) {
          allocationStatus = "partial";
        }

        return {
          ...s,
          total_amount_num: totalAmount,
          amount_paid_num: Math.min(amountPaid, totalAmount),
          balance_due_num: balanceDue,
          payment_status_norm: paymentStatus,
          allocation_status: allocationStatus,
        };
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [selectedCustomer, validSales, scopedPaymentBalances]);

  const customerHistory = useMemo(() => {
    return rawCustomerHistory.filter((sale) => {
      const saleDate = String(sale.created_at).slice(0, 10);

      if (historyFromDate && saleDate < historyFromDate) return false;
      if (historyToDate && saleDate > historyToDate) return false;

      return true;
    });
  }, [rawCustomerHistory, historyFromDate, historyToDate]);

  const historyTotals = useMemo(() => {
    return customerHistory.reduce(
      (acc, sale) => {
        acc.totalPurchases += 1;
        acc.totalSpent += sale.total_amount_num;
        acc.totalPaid += sale.amount_paid_num;
        acc.totalBalance += sale.balance_due_num;
        return acc;
      },
      {
        totalPurchases: 0,
        totalSpent: 0,
        totalPaid: 0,
        totalBalance: 0,
      }
    );
  }, [customerHistory]);

  const unallocatedCustomerPaymentsTotal = useMemo(() => {
    return scopedPaymentBalances.reduce((sum, p) => sum + num(p.unallocated_amount), 0);
  }, [scopedPaymentBalances]);

  const totalEffectiveDebt = useMemo(() => {
    return filtered.reduce((sum, item) => sum + item.effective_debt, 0);
  }, [filtered]);

  const totalCreditOnAccount = useMemo(() => {
    return filtered.reduce((sum, item) => sum + item.credit_on_account, 0);
  }, [filtered]);

  const openPaymentDialog = (customer: CustomerUiSummary) => {
    setSelectedCustomer(customer);
    setPaymentAmount("");
    setPaymentMethod("cash");
    setPaymentReference("");
    setPaymentNotes("");
    setPayOpen(true);
  };

  const openHistoryDialog = (customer: CustomerUiSummary) => {
    setSelectedCustomer(customer);
    setHistoryOpen(true);
    setHistoryFromDate("");
    setHistoryToDate("");
  };

  const openAllocationDialog = async (customer: CustomerUiSummary) => {
    if (!companyId) return;

    try {
      let query = (supabase as any)
        .from("customer_payment_balance_view")
        .select("id,customer_id,unallocated_amount,created_at,branch_id")
        .eq("company_id", companyId)
        .eq("customer_id", customer.customer_id)
        .gt("unallocated_amount", 0)
        .order("created_at", { ascending: false })
        .limit(1);

      if (currentBranchId) {
        query = query.eq("branch_id", currentBranchId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({
          title: "No unallocated payment",
          description: "Record a customer payment first before allocating it.",
          variant: "destructive",
        });
        return;
      }

      setAllocationCustomer(customer);
      setAllocationPaymentId(String(data.id));
      setAllocationAmount(num(data.unallocated_amount));
      setAllocationOpen(true);
    } catch (e: any) {
      toast({
        title: "Could not open allocation",
        description: e?.message || "Failed to load customer payment allocation.",
        variant: "destructive",
      });
    }
  };

  const openPaymentHistoryDialog = async (payment: CustomerPaymentBalanceRow) => {
    setSelectedPayment(payment);
    setPaymentHistoryOpen(true);
    setAllocationHistoryRows([]);

    try {
      const { data, error } = await (supabase as any)
        .from("v_customer_payment_allocation_details")
        .select(
          "id,company_id,branch_id,customer_payment_id,sale_id,customer_id,full_name,receipt_number,sale_total_amount,sale_amount_paid,sale_balance_due,allocated_amount,allocation_date,notes,created_at,updated_at"
        )
        .eq("customer_payment_id", payment.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setAllocationHistoryRows((data || []) as AllocationDetailRow[]);
    } catch (e: any) {
      toast({
        title: "History load failed",
        description: e?.message || "Could not load payment allocation history.",
        variant: "destructive",
      });
    }
  };

  const handleAutoAllocate = async (payment: CustomerPaymentBalanceRow) => {
    try {
      setSavingAutoAllocateId(payment.id);

      const { data, error } = await (supabase as any).rpc("auto_allocate_customer_payment", {
        p_customer_payment_id: payment.id,
      });

      if (error) throw error;

      toast({
        title: "Auto allocation complete",
        description: `Applied payment across ${Number(data || 0)} open sale(s).`,
      });

      await loadData();
    } catch (e: any) {
      toast({
        title: "Auto allocation failed",
        description: e?.message || "Could not auto allocate this payment.",
        variant: "destructive",
      });
    } finally {
      setSavingAutoAllocateId(null);
    }
  };

  const applyQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));

    setHistoryFromDate(formatDateInput(from));
    setHistoryToDate(formatDateInput(to));
  };

  const clearHistoryRange = () => {
    setHistoryFromDate("");
    setHistoryToDate("");
  };

  const openPdfWindow = (html: string) => {
    const win = window.open("", "_blank");
    if (!win) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups to print or save the statement.",
        variant: "destructive",
      });
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const exportCustomerStatementPdf = async () => {
    if (!selectedCustomer) return;

    try {
      setExportingStatement(selectedCustomer.customer_id);

      const logoDataUrl = await urlToDataUrl(companyLogoUrl || null);
      const initials = companyInitials(companyName || "Company");

      const rowsHtml = customerHistory.length
        ? customerHistory
            .map(
              (row, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(new Date(row.created_at).toLocaleDateString())}</td>
                  <td>${escapeHtml(row.receipt_number || "—")}</td>
                  <td class="right">GHS ${escapeHtml(money(row.total_amount_num))}</td>
                  <td class="right">GHS ${escapeHtml(money(row.amount_paid_num))}</td>
                  <td class="right">GHS ${escapeHtml(money(row.balance_due_num))}</td>
                  <td>${escapeHtml(String(row.payment_method || "cash"))}</td>
                  <td>${escapeHtml(row.payment_status_norm)}</td>
                </tr>
              `
            )
            .join("")
        : `
          <tr>
            <td colspan="8" class="muted center">No customer transaction history found for selected period.</td>
          </tr>
        `;

      const periodLabel =
        historyFromDate || historyToDate
          ? `${historyFromDate || "Beginning"} to ${historyToDate || "Today"}`
          : "All Time";

      const html = `
        <html>
          <head>
            <title>Customer Statement - ${escapeHtml(selectedCustomer.full_name)}</title>
            <style>
              :root {
                --border:#e5e7eb;
                --muted:#6b7280;
                --text:#111827;
                --soft:#f9fafb;
              }
              * { box-sizing: border-box; }
              body {
                font-family: Arial, sans-serif;
                color: var(--text);
                padding: 18px;
                background: white;
              }
              .paper { max-width: 980px; margin: 0 auto; }
              .printBtn {
                margin-bottom: 12px;
                padding: 10px 14px;
                border: 1px solid var(--border);
                background: white;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
              }
              .header {
                display:flex;
                justify-content:space-between;
                align-items:flex-start;
                gap:14px;
                border-bottom:1px solid var(--border);
                padding-bottom:12px;
                margin-bottom:14px;
              }
              .brandRow { display:flex; gap:12px; align-items:center; }
              .logoBadge {
                width:56px; height:56px; border-radius:14px;
                border:1px solid var(--border); background: var(--soft);
                display:flex; align-items:center; justify-content:center;
                font-weight:900; letter-spacing:.5px; overflow:hidden;
              }
              .logoImg { width:100%; height:100%; object-fit:contain; display:block; }
              .brand { font-weight:900; font-size:18px; }
              .sub { font-size:12px; color: var(--muted); margin-top:4px; line-height:1.35; }
              .meta { text-align:right; font-size:12px; color: var(--muted); }
              .meta b { color: var(--text); }
              .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:12px 0; }
              .box {
                border:1px solid var(--border);
                border-radius:12px;
                padding:12px;
                background:white;
              }
              .boxTitle { font-weight:800; margin-bottom:8px; }
              .muted { color: var(--muted); }
              .cards { display:flex; gap:10px; flex-wrap:wrap; margin:14px 0; }
              .kpi {
                flex:1 1 180px;
                border:1px solid var(--border);
                border-radius:12px;
                padding:10px 12px;
                background:white;
              }
              .kpi .label { font-size:11px; color: var(--muted); }
              .kpi .value { font-size:20px; font-weight:900; margin-top:4px; }
              table {
                width:100%;
                border-collapse:collapse;
                font-size:12px;
                background:white;
              }
              th, td {
                border:1px solid var(--border);
                padding:8px;
                vertical-align:top;
              }
              th { background:#f3f4f6; text-align:left; }
              .right { text-align:right; }
              .center { text-align:center; }
              .sigRow {
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:20px;
                margin-top:20px;
              }
              .sigBox { font-size:12px; }
              .sigLine {
                border-bottom:1px solid #9ca3af;
                height:18px;
                margin-top:18px;
              }
              .sigLabel { color: var(--muted); margin-top:6px; }
              @media (max-width: 720px) {
                .grid2 { grid-template-columns:1fr; }
              }
              @media print {
                .printBtn { display:none; }
                body { padding:0; }
                .paper { max-width:none; }
              }
            </style>
          </head>
          <body>
            <div class="paper">
              <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

              <div class="header">
                <div class="brandRow">
                  <div class="logoBadge">
                    ${
                      logoDataUrl
                        ? `<img class="logoImg" src="${logoDataUrl}" alt="Logo" />`
                        : escapeHtml(initials)
                    }
                  </div>
                  <div>
                    <div class="brand">${escapeHtml(companyName || "Company")}</div>
                    <div style="font-weight:800; margin-top:2px;">Customer Statement</div>
                    <div class="sub">
                      Customer outstanding balance and payment history<br />
                      Period: ${escapeHtml(periodLabel)}
                    </div>
                  </div>
                </div>

                <div class="meta">
                  <div><b>Generated:</b> ${escapeHtml(new Date().toLocaleString())}</div>
                  <div><b>Currency:</b> GHS</div>
                </div>
              </div>

              <div class="grid2">
                <div class="box">
                  <div class="boxTitle">Customer Details</div>
                  <div class="muted" style="font-size:12px; line-height:1.6;">
                    <div><b>Name:</b> ${escapeHtml(selectedCustomer.full_name)}</div>
                    <div><b>Phone:</b> ${escapeHtml(selectedCustomer.phone || "-")}</div>
                    <div><b>Period:</b> ${escapeHtml(periodLabel)}</div>
                    <div><b>Rows in statement:</b> ${escapeHtml(customerHistory.length)}</div>
                  </div>
                </div>

                <div class="box">
                  <div class="boxTitle">Statement Notes</div>
                  <div class="muted" style="font-size:12px; line-height:1.6;">
                    <div>• This statement shows customer purchases and payment balances.</div>
                    <div>• Balance due represents unpaid amount remaining before display offset.</div>
                    <div>• Only rows within the selected period are included.</div>
                  </div>
                </div>
              </div>

              <div class="cards">
                <div class="kpi">
                  <div class="label">Total Spent</div>
                  <div class="value">GHS ${escapeHtml(money(historyTotals.totalSpent))}</div>
                </div>
                <div class="kpi">
                  <div class="label">Total Paid</div>
                  <div class="value">GHS ${escapeHtml(money(historyTotals.totalPaid))}</div>
                </div>
                <div class="kpi">
                  <div class="label">Outstanding Balance</div>
                  <div class="value">GHS ${escapeHtml(money(historyTotals.totalBalance))}</div>
                </div>
              </div>

              <div class="box">
                <div class="boxTitle">Purchase / Payment History</div>
                <table>
                  <thead>
                    <tr>
                      <th style="width:48px;">#</th>
                      <th>Date</th>
                      <th>Receipt</th>
                      <th class="right">Total</th>
                      <th class="right">Paid</th>
                      <th class="right">Balance</th>
                      <th>Method</th>
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
                    <b>Customer confirmation:</b>
                    <div class="sigLine"></div>
                    <div class="sigLabel">Signature</div>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      openPdfWindow(html);
    } catch (error: any) {
      toast({
        title: "Statement export failed",
        description: error?.message || "Could not generate customer statement.",
        variant: "destructive",
      });
    } finally {
      setExportingStatement(null);
    }
  };

  const sendWhatsAppStatement = () => {
    if (!selectedCustomer) return;

    const waPhone = buildWhatsAppPhone(selectedCustomer.phone);
    if (!waPhone) {
      toast({
        title: "Missing phone number",
        description: "This customer does not have a valid phone number for WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    const periodLabel =
      historyFromDate || historyToDate
        ? `${historyFromDate || "Beginning"} to ${historyToDate || "Today"}`
        : "All Time";

    const message = `Hello ${selectedCustomer.full_name},

Here is your account summary from ${companyName || "our company"}.

Period: ${periodLabel}
Purchases: ${historyTotals.totalPurchases}
Total Spent: GHS ${money(historyTotals.totalSpent)}
Total Paid: GHS ${money(historyTotals.totalPaid)}
Outstanding Balance: GHS ${money(historyTotals.totalBalance)}

Thank you.`;

    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const handleRecordPayment = async () => {
    if (!companyId || !selectedCustomer) return;

    const amount = Number(paymentAmount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a payment amount greater than zero.",
        variant: "destructive",
      });
      return;
    }

    setSavingPayment(true);

    try {
      const { data: paymentRow, error: paymentError } = await (supabase as any)
        .from("customer_payments")
        .insert({
          company_id: companyId,
          branch_id: currentBranchId,
          customer_id: selectedCustomer.customer_id,
          sale_id: null,
          amount,
          payment_method: paymentMethod || "cash",
          payment_date: todayString(),
          reference_number: paymentReference.trim() || null,
          notes: paymentNotes.trim() || null,
          recorded_by: actorId,
          created_by: actorId,
        })
        .select("id, amount, customer_id")
        .single();

      if (paymentError) throw paymentError;

      toast({
        title: "Payment recorded",
        description: `GHS ${money(amount)} recorded for ${selectedCustomer.full_name}. Now allocate it to sales.`,
      });

      setPayOpen(false);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentReference("");
      setPaymentNotes("");

      setAllocationCustomer(selectedCustomer);
      setAllocationPaymentId(String(paymentRow.id));
      setAllocationAmount(num(paymentRow.amount));
      setAllocationOpen(true);

      await loadData();
    } catch (error: any) {
      toast({
        title: "Payment failed",
        description: error?.message || "Could not record payment.",
        variant: "destructive",
      });
    } finally {
      setSavingPayment(false);
    }
  };

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, item) => {
        acc.totalSpent += item.total_spent;
        acc.totalPaid += item.total_paid;
        acc.totalBalance += item.effective_debt;
        acc.totalDebtSales += item.debt_sales_count;
        acc.totalCredit += item.credit_on_account;
        return acc;
      },
      {
        totalSpent: 0,
        totalPaid: 0,
        totalBalance: 0,
        totalDebtSales: 0,
        totalCredit: 0,
      }
    );
  }, [filtered]);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Wallet className="h-5 w-5" />
            Customer Payments
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Total Spent</p>
              <p className="text-xl font-bold text-white break-words">
                GHS {money(totals.totalSpent)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Total Paid</p>
              <p className="text-xl font-bold text-white break-words">
                GHS {money(totals.totalPaid)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Outstanding Balance</p>
              <p className="text-xl font-bold text-amber-300 break-words">
                GHS {money(totals.totalBalance)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Open Debt Sales</p>
              <p className="text-xl font-bold text-white">{totals.totalDebtSales}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Unallocated Customer Payments</p>
              <p className="text-xl font-bold text-cyan-300 break-words">
                GHS {money(unallocatedCustomerPaymentsTotal)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Credit on Account</p>
              <p className="text-xl font-bold text-emerald-300 break-words">
                GHS {money(totalCreditOnAccount)}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">Smart offset display</p>
            <p className="mt-2 text-slate-400">
              Each customer card now offsets unallocated payments against unpaid balance.
              So displayed <span className="text-white">Outstanding Debt</span> is{" "}
              <span className="text-white">max(0, balance due - unallocated)</span>, and{" "}
              <span className="text-white">Credit on Account</span> is{" "}
              <span className="text-white">max(0, unallocated - balance due)</span>.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search customer name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>

          {loading && (
            <p className="text-slate-400 text-center py-8">Loading customer balances...</p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-slate-400 text-center py-8">No customer balances found</p>
          )}

          <div className="space-y-3">
            {filtered.map((customer) => (
              <div
                key={customer.customer_id}
                className="rounded-lg bg-slate-700/50 p-4"
              >
                <div className="space-y-4">
                  <div className="min-w-0">
                    <p className="text-white font-medium break-words">
                      {customer.full_name}
                    </p>
                    <p className="text-xs text-slate-400 break-all">
                      {customer.phone || "No phone"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-5">
                      Purchases: {customer.total_purchases} • Debt sales:{" "}
                      {customer.debt_sales_count} • Last visit:{" "}
                      {customer.last_purchase
                        ? new Date(customer.last_purchase).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-md bg-slate-800 p-3 min-w-0">
                      <p className="text-[11px] text-slate-400">Spent</p>
                      <p className="text-sm font-semibold text-white break-words">
                        GHS {money(customer.total_spent)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3 min-w-0">
                      <p className="text-[11px] text-slate-400">Paid</p>
                      <p className="text-sm font-semibold text-white break-words">
                        GHS {money(customer.total_paid)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3 min-w-0">
                      <p className="text-[11px] text-slate-400">Outstanding Debt</p>
                      <p className="text-sm font-semibold text-amber-300 break-words">
                        GHS {money(customer.effective_debt)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3 min-w-0">
                      <p className="text-[11px] text-slate-400">Credit on Account</p>
                      <p className="text-sm font-semibold text-emerald-300 break-words">
                        GHS {money(customer.credit_on_account)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md bg-slate-800/70 p-3 min-w-0">
                      <p className="text-[11px] text-slate-400">Raw Balance Due</p>
                      <p className="text-sm font-semibold text-slate-200 break-words">
                        GHS {money(customer.balance_due)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800/70 p-3 min-w-0">
                      <p className="text-[11px] text-slate-400">Unallocated Payments</p>
                      <p className="text-sm font-semibold text-cyan-300 break-words">
                        GHS {money(customer.unallocated_amount)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => openHistoryDialog(customer)}
                    >
                      View History
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => void openAllocationDialog(customer)}
                      disabled={customer.unallocated_amount <= 0}
                    >
                      Allocate
                    </Button>

                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => openPaymentDialog(customer)}
                    >
                      Record Payment
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <FileText className="h-5 w-5" />
            Payment Allocation Statement
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search payment method, reference, note, or status..."
              value={paymentSearch}
              onChange={(e) => setPaymentSearch(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-slate-900">
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Customer</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Method</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Payment</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Allocated</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Unallocated</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Reference</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-slate-400" colSpan={9}>
                      Loading payment balances...
                    </td>
                  </tr>
                ) : filteredPaymentRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-slate-400" colSpan={9}>
                      No customer payment records found.
                    </td>
                  </tr>
                ) : (
                  filteredPaymentRows.map((payment) => {
                    const customer = customers.find(
                      (c) => String(c.id) === String(payment.customer_id)
                    );
                    const canAllocate = num(payment.unallocated_amount) > 0;

                    return (
                      <tr
                        key={payment.id}
                        className="border-b border-slate-800 bg-slate-950/30"
                      >
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {formatDate(payment.payment_date || payment.created_at)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {customer?.full_name || "Unknown customer"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`rounded-full px-2.5 py-1 text-xs border ${methodBadgeClass(payment.payment_method)}`}>
                            {String(payment.payment_method || "unknown").toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-white">
                          GHS {money(num(payment.amount))}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-emerald-300">
                          GHS {money(num(payment.allocated_amount))}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-amber-300">
                          GHS {money(num(payment.unallocated_amount))}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs ${allocationBadgeClass(
                              payment.allocation_status
                            )}`}
                          >
                            {allocationBadgeLabel(payment.allocation_status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {payment.reference_number || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canAllocate || savingAutoAllocateId === payment.id}
                              onClick={() => void handleAutoAllocate(payment)}
                            >
                              <Sparkles className="mr-2 h-4 w-4" />
                              {savingAutoAllocateId === payment.id ? "Allocating..." : "Auto Allocate"}
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canAllocate}
                              onClick={() => {
                                const summary = debtSummary.find(
                                  (d) => String(d.customer_id) === String(payment.customer_id)
                                );
                                if (!summary) {
                                  toast({
                                    title: "Customer not found",
                                    description: "Could not find customer summary for allocation.",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                setAllocationCustomer(summary);
                                setAllocationPaymentId(payment.id);
                                setAllocationAmount(num(payment.unallocated_amount));
                                setAllocationOpen(true);
                              }}
                            >
                              Allocate
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void openPaymentHistoryDialog(payment)}
                            >
                              <History className="mr-2 h-4 w-4" />
                              History
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">How allocation works</p>
            <p className="mt-2">
              Payments are recorded first, then allocated to unpaid customer invoices. Auto Allocate applies them to older unpaid invoices first. Manual allocation lets you choose exactly where the payment should go.
            </p>
          </div>
        </CardContent>
      </Card>

     <Dialog
  open={payOpen}
  onOpenChange={(open) => {
    setPayOpen(open);
    if (!open) {
      setSelectedCustomer(null);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentReference("");
      setPaymentNotes("");
    }
  }}
>
  <DialogContent className="bg-slate-800 border-slate-700 w-[95vw] max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0">
    <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b border-slate-700">
      <DialogTitle className="text-white">Record Customer Payment</DialogTitle>
    </DialogHeader>

    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-700/50 p-4">
          <p className="text-white font-medium break-words">
            {selectedCustomer?.full_name || "Customer"}
          </p>
          <p className="text-xs text-slate-400 break-all">
            {selectedCustomer?.phone || "No phone"}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Total paid so far: GHS {money(selectedCustomer?.total_paid || 0)}
          </p>
          <p className="mt-1 text-sm text-amber-300">
            Raw Outstanding Balance: GHS {money(selectedCustomer?.balance_due || 0)}
          </p>
          <p className="mt-1 text-sm text-cyan-300">
            Unallocated Payments: GHS {money(selectedCustomer?.unallocated_amount || 0)}
          </p>
          <p className="mt-1 text-sm text-emerald-300">
            Credit on Account: GHS {money(selectedCustomer?.credit_on_account || 0)}
          </p>
        </div>

        <div>
          <Label className="text-slate-200">Payment Amount</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Enter amount received"
          />
        </div>

        <div>
          <Label className="text-slate-200">Payment Method</Label>
          <Input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="cash / momo / card / bank transfer"
          />
        </div>

        <div>
          <Label className="text-slate-200">Reference</Label>
          <Input
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Optional reference"
          />
        </div>

        <div>
          <Label className="text-slate-200">Notes</Label>
          <Input
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Optional notes"
          />
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">
          This saves the payment first. Then you can allocate it manually or auto allocate it to open invoices.
        </div>
      </div>
    </div>

    <DialogFooter className="px-4 sm:px-6 py-4 border-t border-slate-700 flex-col sm:flex-row gap-2">
      <Button
        variant="outline"
        className="w-full sm:w-auto"
        onClick={() => setPayOpen(false)}
        disabled={savingPayment}
      >
        Cancel
      </Button>
      <Button
        className="w-full sm:w-auto"
        onClick={handleRecordPayment}
        disabled={savingPayment}
      >
        {savingPayment ? "Saving..." : "Save Payment"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

      <Dialog
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) {
            setSelectedCustomer(null);
            setHistoryFromDate("");
            setHistoryToDate("");
          }
        }}
      >
        <DialogContent className="bg-slate-800 border-slate-700 w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b border-slate-700">
            <DialogTitle className="text-white text-base sm:text-lg break-words pr-6">
              {selectedCustomer?.full_name || "Customer"} Purchase / Payment History
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-4 sm:px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">Purchases</p>
                <p className="text-lg font-bold text-white">{historyTotals.totalPurchases}</p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">Spent</p>
                <p className="text-lg font-bold text-white break-words">
                  GHS {money(historyTotals.totalSpent)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">Paid</p>
                <p className="text-lg font-bold text-white break-words">
                  GHS {money(historyTotals.totalPaid)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">Balance</p>
                <p className="text-lg font-bold text-amber-300 break-words">
                  GHS {money(historyTotals.totalBalance)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-slate-200">From Date</Label>
                  <Input
                    type="date"
                    value={historyFromDate}
                    onChange={(e) => setHistoryFromDate(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>

                <div>
                  <Label className="text-slate-200">To Date</Label>
                  <Input
                    type="date"
                    value={historyToDate}
                    onChange={(e) => setHistoryToDate(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => applyQuickRange(7)}>
                  Last 7 Days
                </Button>
                <Button type="button" variant="outline" onClick={() => applyQuickRange(30)}>
                  Last 30 Days
                </Button>
                <Button type="button" variant="outline" onClick={() => applyQuickRange(90)}>
                  Last 90 Days
                </Button>
                <Button type="button" variant="outline" onClick={clearHistoryRange}>
                  All Time
                </Button>
              </div>

              <p className="text-xs text-slate-400 leading-5">
                View History, Statement export, and WhatsApp message will all use this selected
                period.
              </p>

              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => void exportCustomerStatementPdf()}
                  disabled={!selectedCustomer || exportingStatement === selectedCustomer.customer_id}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {exportingStatement === selectedCustomer?.customer_id
                    ? "Generating..."
                    : "Statement"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={sendWhatsAppStatement}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Send WhatsApp
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {customerHistory.length === 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-6 text-center text-slate-400">
                  No purchase history found for selected period.
                </div>
              )}

              {customerHistory.map((sale) => (
                <div key={sale.id} className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                  <div className="space-y-3">
                    <div className="min-w-0">
                      <p className="text-white font-medium break-words">
                        Receipt: {sale.receipt_number || "No receipt number"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(sale.created_at).toLocaleString()}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full border border-slate-600 px-2 py-1 text-slate-300">
                          Payment: {sale.payment_status_norm}
                        </span>
                        <span className="rounded-full border border-slate-600 px-2 py-1 text-slate-300">
                          Method: {String(sale.payment_method || "cash")}
                        </span>
                        <span className="rounded-full border border-slate-600 px-2 py-1 text-slate-300">
                          Sale status: {String(sale.status || "pending")}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 ${allocationBadgeClass(
                            sale.allocation_status
                          )}`}
                        >
                          Allocation: {allocationBadgeLabel(sale.allocation_status)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-md bg-slate-800 p-3">
                        <p className="text-[11px] text-slate-400">Total</p>
                        <p className="text-sm font-semibold text-white break-words">
                          GHS {money(sale.total_amount_num)}
                        </p>
                      </div>

                      <div className="rounded-md bg-slate-800 p-3">
                        <p className="text-[11px] text-slate-400">Paid</p>
                        <p className="text-sm font-semibold text-white break-words">
                          GHS {money(sale.amount_paid_num)}
                        </p>
                      </div>

                      <div className="rounded-md bg-slate-800 p-3">
                        <p className="text-[11px] text-slate-400">Balance</p>
                        <p className="text-sm font-semibold text-amber-300 break-words">
                          GHS {money(sale.balance_due_num)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="px-4 sm:px-6 py-4 border-t border-slate-700 flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setHistoryOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentHistoryOpen}
        onOpenChange={(open) => {
          setPaymentHistoryOpen(open);
          if (!open) {
            setSelectedPayment(null);
            setAllocationHistoryRows([]);
          }
        }}
      >
        <DialogContent className="bg-slate-800 border-slate-700 w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b border-slate-700">
            <DialogTitle className="text-white text-base sm:text-lg break-words pr-6">
              Payment Allocation History
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-4 sm:px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">Payment</p>
                <p className="text-lg font-bold text-white">
                  GHS {money(num(selectedPayment?.amount))}
                </p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">Allocated</p>
                <p className="text-lg font-bold text-emerald-300">
                  GHS {money(num(selectedPayment?.allocated_amount))}
                </p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">Unallocated</p>
                <p className="text-lg font-bold text-amber-300">
                  GHS {money(num(selectedPayment?.unallocated_amount))}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full min-w-[900px]">
                <thead className="bg-slate-900">
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-white">Receipt</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-white">Allocation Date</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-white">Allocated</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-white">Sale Total</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-white">Sale Paid</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-white">Sale Balance</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-white">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {allocationHistoryRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={7}>
                        No allocation history found for this payment.
                      </td>
                    </tr>
                  ) : (
                    allocationHistoryRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-800 bg-slate-950/30">
                        <td className="px-4 py-3 text-sm text-white">
                          {row.receipt_number || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {formatDate(row.allocation_date || row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-emerald-300">
                          GHS {money(num(row.allocated_amount))}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-white">
                          GHS {money(num(row.sale_total_amount))}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-white">
                          GHS {money(num(row.sale_amount_paid))}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-amber-300">
                          GHS {money(num(row.sale_balance_due))}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {row.notes || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="px-4 sm:px-6 py-4 border-t border-slate-700 flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setPaymentHistoryOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerPaymentAllocationDialog
        open={allocationOpen}
        onOpenChange={(open) => {
          setAllocationOpen(open);
          if (!open) {
            setAllocationPaymentId(null);
            setAllocationAmount(0);
            setAllocationCustomer(null);
          }
        }}
        paymentId={allocationPaymentId}
        customerId={allocationCustomer?.customer_id || null}
        customerName={allocationCustomer?.full_name || ""}
        unallocatedAmount={allocationAmount}
        onSuccess={async () => {
          await loadData();
        }}
      />
    </div>
  );
}