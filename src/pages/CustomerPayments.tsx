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
import { Search, Wallet } from "lucide-react";
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
  total_amount: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  payment_status: string | null;
  created_at: string;
};

type CustomerDebtSummary = {
  customer_id: string;
  full_name: string;
  phone: string | null;
  total_purchases: number;
  total_spent: number;
  total_paid: number;
  balance_due: number;
  last_purchase: string | null;
};

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CustomerPayments() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const companyId = (profile as any)?.company_id ?? null;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<SaleDebtRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [payOpen, setPayOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDebtSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

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
          "id,customer_id,customer_name,customer_phone,total_amount,amount_paid,balance_due,payment_status,created_at"
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
  }, [companyId]);

  const debtSummary = useMemo<CustomerDebtSummary[]>(() => {
    const customerMap = new Map<string, Customer>();
    for (const c of customers) {
      customerMap.set(c.id, c);
    }

    const map = new Map<string, CustomerDebtSummary>();

    for (const s of sales) {
      const customerId = String(s.customer_id || "");
      if (!customerId) continue;

      const customer = customerMap.get(customerId);
      const totalAmount = Number(s.total_amount || 0);
      const amountPaid = Number(s.amount_paid || 0);
      const balanceDue = Number(s.balance_due || 0);

      const existing = map.get(customerId) || {
        customer_id: customerId,
        full_name: customer?.full_name || String(s.customer_name || "Unknown Customer"),
        phone: customer?.phone || (s.customer_phone ?? null),
        total_purchases: 0,
        total_spent: 0,
        total_paid: 0,
        balance_due: 0,
        last_purchase: null,
      };

      existing.total_purchases += 1;
      existing.total_spent += totalAmount;
      existing.total_paid += amountPaid;
      existing.balance_due += balanceDue;

      if (!existing.last_purchase || s.created_at > existing.last_purchase) {
        existing.last_purchase = s.created_at;
      }

      map.set(customerId, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.balance_due !== a.balance_due) return b.balance_due - a.balance_due;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [customers, sales]);

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

  const openPaymentDialog = (customer: CustomerDebtSummary) => {
    setSelectedCustomer(customer);
    setPaymentAmount("");
    setPayOpen(true);
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
        .select("id,total_amount,amount_paid,balance_due,payment_status,created_at")
        .eq("company_id", companyId)
        .eq("customer_id", selectedCustomer.customer_id)
        .in("payment_status", ["credit", "partial"])
        .gt("balance_due", 0)
        .order("created_at", { ascending: true });

      if (debtSalesError) throw debtSalesError;

      let remaining = amount;

      for (const sale of (debtSales || []) as any[]) {
        if (remaining <= 0) break;

        const oldPaid = Number(sale.amount_paid || 0);
        const oldBalance = Number(sale.balance_due || 0);
        const applied = Math.min(oldBalance, remaining);

        const newPaid = oldPaid + applied;
        const newBalance = oldBalance - applied;
        const newStatus = newBalance <= 0 ? "paid" : "partial";

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
      }

      toast({
        title: "Payment recorded",
        description: `GHS ${money(amount)} recorded for ${selectedCustomer.full_name}.`,
      });

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
        return acc;
      },
      {
        totalSpent: 0,
        totalPaid: 0,
        totalBalance: 0,
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
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Total Spent</p>
              <p className="text-xl font-bold text-white">GHS {money(totals.totalSpent)}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Total Paid</p>
              <p className="text-xl font-bold text-white">GHS {money(totals.totalPaid)}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Outstanding Balance</p>
              <p className="text-xl font-bold text-amber-300">GHS {money(totals.totalBalance)}</p>
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

          <div className="space-y-2">
            {filtered.map((customer) => (
              <div
                key={customer.customer_id}
                className="rounded-lg bg-slate-700/50 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{customer.full_name}</p>
                  <p className="text-xs text-slate-400">{customer.phone || "No phone"}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Purchases: {customer.total_purchases} • Last visit:{" "}
                    {customer.last_purchase
                      ? new Date(customer.last_purchase).toLocaleDateString()
                      : "—"}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 md:min-w-[420px]">
                  <div className="rounded-md bg-slate-800 p-3">
                    <p className="text-[11px] text-slate-400">Spent</p>
                    <p className="text-sm font-semibold text-white">
                      GHS {money(customer.total_spent)}
                    </p>
                  </div>

                  <div className="rounded-md bg-slate-800 p-3">
                    <p className="text-[11px] text-slate-400">Paid</p>
                    <p className="text-sm font-semibold text-white">
                      GHS {money(customer.total_paid)}
                    </p>
                  </div>

                  <div className="rounded-md bg-slate-800 p-3">
                    <p className="text-[11px] text-slate-400">Balance</p>
                    <p className="text-sm font-semibold text-amber-300">
                      GHS {money(customer.balance_due)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <Button
                    onClick={() => openPaymentDialog(customer)}
                    disabled={customer.balance_due <= 0}
                  >
                    Record Payment
                  </Button>
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
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Record Customer Payment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-slate-700/50 p-4">
              <p className="text-white font-medium">{selectedCustomer?.full_name || "Customer"}</p>
              <p className="text-xs text-slate-400">{selectedCustomer?.phone || "No phone"}</p>
              <p className="mt-2 text-sm text-amber-300">
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)} disabled={savingPayment}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={savingPayment}>
              {savingPayment ? "Saving..." : "Save Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}