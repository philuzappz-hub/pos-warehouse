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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FileText, MessageCircle, Search, Wallet } from "lucide-react";
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

function computePaymentStatus(balanceDue: number) {
  return balanceDue <= 0 ? "paid" : "partial";
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

export default function CustomerPayments() {
  const { profile, companyName, companyLogoUrl, activeBranchId, branchId } = useAuth() as any;
  const { toast } = useToast();

  const companyId = (profile as any)?.company_id ?? null;
  const currentBranchId = activeBranchId || branchId || null;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<SaleDebtRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [payOpen, setPayOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDebtSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [exportingStatement, setExportingStatement] = useState<string | null>(null);

  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");

  const loadData = async () => {
    if (!companyId) {
      setCustomers([]);
      setSales([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [customersRes, salesRes] = await Promise.all([
      (supabase as any)
        .from("customers")
        .select("id,full_name,phone,email,address,is_active,company_id,branch_id,created_at")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("full_name"),
      (supabase as any)
        .from("sales")
        .select(
          "id,customer_id,customer_name,customer_phone,receipt_number,total_amount,amount_paid,balance_due,payment_status,payment_method,status,is_returned,created_at,branch_id"
        )
        .eq("company_id", companyId)
        .not("customer_id", "is", null)
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

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

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

  const debtSummary = useMemo<CustomerDebtSummary[]>(() => {
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
      .sort((a, b) => {
        if (b.balance_due !== a.balance_due) return b.balance_due - a.balance_due;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [customers, validSales]);

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

        return {
          ...s,
          total_amount_num: totalAmount,
          amount_paid_num: Math.min(amountPaid, totalAmount),
          balance_due_num: balanceDue,
          payment_status_norm: paymentStatus,
        };
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [selectedCustomer, validSales]);

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

  const openPaymentDialog = (customer: CustomerDebtSummary) => {
    setSelectedCustomer(customer);
    setPaymentAmount("");
    setPayOpen(true);
  };

  const openHistoryDialog = (customer: CustomerDebtSummary) => {
    setSelectedCustomer(customer);
    setHistoryOpen(true);
    setHistoryFromDate("");
    setHistoryToDate("");
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
                    <div>• Balance due represents unpaid amount remaining.</div>
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

    if (amount > selectedCustomer.balance_due) {
      toast({
        title: "Amount too high",
        description: "Payment cannot exceed customer outstanding balance.",
        variant: "destructive",
      });
      return;
    }

    setSavingPayment(true);

    try {
      const { data: debtSales, error: debtSalesError } = await (supabase as any)
        .from("sales")
        .select(
          "id,total_amount,amount_paid,balance_due,payment_status,payment_method,created_at,is_returned,status,branch_id"
        )
        .eq("company_id", companyId)
        .eq("customer_id", selectedCustomer.customer_id)
        .in("payment_status", ["credit", "partial"])
        .gt("balance_due", 0)
        .order("created_at", { ascending: true });

      if (debtSalesError) throw debtSalesError;

      let remaining = amount;
      let affectedCount = 0;

      for (const sale of (debtSales || []) as any[]) {
        if (remaining <= 0) break;
        if (isReturnedSale(sale)) continue;
        if (String(sale?.status || "").toLowerCase() === "cancelled") continue;
        if (currentBranchId && String(sale?.branch_id || "") !== String(currentBranchId)) continue;

        const totalAmount = Math.max(0, num(sale.total_amount));
        const oldPaid = Math.max(0, num(sale.amount_paid));
        const storedBalance = Math.max(0, num(sale.balance_due));
        const effectiveBalance =
          storedBalance > 0 ? storedBalance : Math.max(0, totalAmount - oldPaid);

        if (effectiveBalance <= 0) continue;

        const applied = Math.min(effectiveBalance, remaining);
        const newPaid = oldPaid + applied;
        const newBalance = Math.max(0, totalAmount - newPaid);
        const newStatus = computePaymentStatus(newBalance);

        const { error: updateError } = await (supabase as any)
          .from("sales")
          .update({
            amount_paid: newPaid,
            balance_due: newBalance,
            payment_status: newStatus,
          })
          .eq("id", sale.id);

        if (updateError) throw updateError;

        remaining -= applied;
        affectedCount += 1;
      }

      if (remaining > 0) {
        toast({
          title: "Payment partially applied",
          description:
            "Some of the amount could not be matched to open debt rows. Please refresh and check history.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payment recorded",
          description: `GHS ${money(amount)} recorded for ${selectedCustomer.full_name} across ${affectedCount} sale(s).`,
        });
      }

      setPayOpen(false);
      setSelectedCustomer(null);
      setPaymentAmount("");
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
        acc.totalBalance += item.balance_due;
        acc.totalDebtSales += item.debt_sales_count;
        return acc;
      },
      {
        totalSpent: 0,
        totalPaid: 0,
        totalBalance: 0,
        totalDebtSales: 0,
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      <p className="text-[11px] text-slate-400">Balance</p>
                      <p className="text-sm font-semibold text-amber-300 break-words">
                        GHS {money(customer.balance_due)}
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
                      className="w-full sm:w-auto"
                      onClick={() => openPaymentDialog(customer)}
                      disabled={customer.balance_due <= 0}
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

      <Dialog
        open={payOpen}
        onOpenChange={(open) => {
          setPayOpen(open);
          if (!open) {
            setSelectedCustomer(null);
            setPaymentAmount("");
          }
        }}
      >
        <DialogContent className="bg-slate-800 border-slate-700 w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Record Customer Payment</DialogTitle>
          </DialogHeader>

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
                Outstanding Balance: GHS {money(selectedCustomer?.balance_due || 0)}
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
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
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
    </div>
  );
}