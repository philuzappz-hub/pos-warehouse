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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SupplierPaymentsTable from "@/features/suppliers/components/SupplierPaymentsTable";
import { money, validateSupplierPaymentForm } from "@/features/suppliers/helpers";
import {
  createSupplierPayment,
  fetchSupplierAccountSnapshot,
  fetchSupplierOpenPurchases,
  fetchSupplierPayments,
  fetchSuppliers,
  type SupplierAccountSnapshot,
} from "@/features/suppliers/services";
import type {
  SupplierPaymentFormValues,
  SupplierPaymentRow,
  SupplierRow,
} from "@/features/suppliers/types";
import { emptySupplierPaymentForm } from "@/features/suppliers/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type BranchRow = { id: string; name: string };

type OpenPurchaseRow = {
  id: string;
  purchase_date: string;
  invoice_number: string | null;
  reference_number: string | null;
  total_amount: number;
  amount_paid: number;
  supplier_credit_applied: number;
  balance_due: number;
};

type SupplierDebtSummary = {
  supplier_id: string;
  name: string;
  phone: string | null;
  total_purchased: number;
  cash_applied: number;
  credit_applied: number;
  total_settled: number;
  gross_outstanding: number;
  unused_credit: number;
  net_payable: number;
};

function num(v: number | string | null | undefined) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function deriveCashApplied(snapshot?: SupplierAccountSnapshot | null) {
  return num(snapshot?.totalPayments);
}

function deriveCreditApplied(snapshot?: SupplierAccountSnapshot | null) {
  return num(snapshot?.totalCreditsApplied);
}

function deriveTotalSettled(snapshot?: SupplierAccountSnapshot | null) {
  return deriveCashApplied(snapshot) + deriveCreditApplied(snapshot);
}

function deriveGrossOutstanding(snapshot?: SupplierAccountSnapshot | null) {
  return Math.max(num(snapshot?.totalPurchases) - deriveTotalSettled(snapshot), 0);
}

function deriveUnusedCredit(snapshot?: SupplierAccountSnapshot | null) {
  return num(snapshot?.availableCredit);
}

function deriveNetPayable(snapshot?: SupplierAccountSnapshot | null) {
  return Math.max(deriveGrossOutstanding(snapshot) - deriveUnusedCredit(snapshot), 0);
}

export default function SupplierPayments() {
  const { toast } = useToast();
  const { profile, user, activeBranchId, branchId } = useAuth() as any;
  const [searchParams] = useSearchParams();

  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;
  const supplierIdFromUrl = searchParams.get("supplierId");
  const purchaseIdFromUrl = searchParams.get("purchaseId");

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierSnapshots, setSupplierSnapshots] = useState<Record<string, SupplierAccountSnapshot>>({});
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
  const [openPurchases, setOpenPurchases] = useState<OpenPurchaseRow[]>([]);

  const [form, setForm] = useState<SupplierPaymentFormValues>({
    ...emptySupplierPaymentForm,
    branch_id: activeBranchId || branchId || "",
  });

  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [filterBranchId, setFilterBranchId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownSupplier, setBreakdownSupplier] = useState<SupplierDebtSummary | null>(null);

  async function loadBranches() {
    if (!companyId) return;
    const { data, error } = await (supabase as any)
      .from("branches")
      .select("id,name")
      .eq("company_id", companyId)
      .order("name");

    if (error) throw error;
    setBranches((data ?? []) as BranchRow[]);
  }

  async function loadSuppliersAndSnapshots() {
    if (!companyId) return;

    const supplierRows = await fetchSuppliers({
      companyId,
      branchId: activeBranchId || branchId || null,
      includeAllBranches: true,
    });
    setSuppliers(supplierRows);

    const pairs = await Promise.all(
      supplierRows.map(async (supplier) => {
        const snapshot = await fetchSupplierAccountSnapshot({
          companyId,
          supplierId: supplier.id,
        });
        return [supplier.id, snapshot] as const;
      })
    );

    setSupplierSnapshots(Object.fromEntries(pairs));
  }

  async function loadPayments() {
    if (!companyId) return;
    setLoading(true);
    try {
      const rows = await fetchSupplierPayments({
        companyId,
        supplierId: filterSupplierId === "all" ? null : filterSupplierId,
        branchId: filterBranchId === "all" ? null : filterBranchId,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setPayments(rows);
    } finally {
      setLoading(false);
    }
  }

  async function loadOpenPurchases(supplierId: string) {
    if (!companyId || !supplierId) {
      setOpenPurchases([]);
      return;
    }

    const rows = await fetchSupplierOpenPurchases({ companyId, supplierId });
    setOpenPurchases(rows as OpenPurchaseRow[]);
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadBranches();
        await loadSuppliersAndSnapshots();
        await loadPayments();
      } catch (e: any) {
        toast({
          title: "Setup failed",
          description: e?.message || "Could not load supplier data.",
          variant: "destructive",
        });
      }
    })();
  }, [companyId, activeBranchId, branchId]);

  useEffect(() => {
    void loadPayments();
  }, [companyId, filterSupplierId, filterBranchId, startDate, endDate]);

  useEffect(() => {
    if (!form.supplier_id) {
      setOpenPurchases([]);
      return;
    }
    void loadOpenPurchases(form.supplier_id);
  }, [companyId, form.supplier_id]);

  useEffect(() => {
    if (!supplierIdFromUrl || suppliers.length === 0) return;
    const match = suppliers.find((s) => s.id === supplierIdFromUrl);
    if (!match) return;
    setForm((prev) => ({ ...prev, supplier_id: match.id, purchase_id: "none" }));
    setFilterSupplierId(match.id);
  }, [supplierIdFromUrl, suppliers]);

  useEffect(() => {
    if (!purchaseIdFromUrl || !openPurchases.length) return;
    const match = openPurchases.find((p) => p.id === purchaseIdFromUrl);
    if (!match) return;
    setForm((prev) => ({ ...prev, purchase_id: match.id }));
  }, [purchaseIdFromUrl, openPurchases]);

  const selectedPurchase =
    form.purchase_id && form.purchase_id !== "none"
      ? openPurchases.find((p) => p.id === form.purchase_id) || null
      : null;

  const supplierSummary = useMemo<SupplierDebtSummary[]>(() => {
    return suppliers
      .map((supplier) => {
        const snapshot = supplierSnapshots[supplier.id];
        return {
          supplier_id: supplier.id,
          name: supplier.name || "Unknown Supplier",
          phone: (supplier as any).phone || null,
          total_purchased: num(snapshot?.totalPurchases),
          cash_applied: deriveCashApplied(snapshot),
          credit_applied: deriveCreditApplied(snapshot),
          total_settled: deriveTotalSettled(snapshot),
          gross_outstanding: deriveGrossOutstanding(snapshot),
          unused_credit: deriveUnusedCredit(snapshot),
          net_payable: deriveNetPayable(snapshot),
        };
      })
      .sort((a, b) => b.net_payable - a.net_payable || a.name.localeCompare(b.name));
  }, [suppliers, supplierSnapshots]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return supplierSummary;
    return supplierSummary.filter((row) => {
      return (
        row.name.toLowerCase().includes(q) ||
        String(row.phone || "").toLowerCase().includes(q)
      );
    });
  }, [supplierSummary, search]);

  const totals = useMemo(() => {
    return filteredSuppliers.reduce(
      (acc, row) => {
        acc.totalPurchased += row.total_purchased;
        acc.totalCashApplied += row.cash_applied;
        acc.totalCreditApplied += row.credit_applied;
        acc.totalSettled += row.total_settled;
        acc.totalGrossOutstanding += row.gross_outstanding;
        acc.totalUnusedCredit += row.unused_credit;
        acc.totalNetPayable += row.net_payable;
        return acc;
      },
      {
        totalPurchased: 0,
        totalCashApplied: 0,
        totalCreditApplied: 0,
        totalSettled: 0,
        totalGrossOutstanding: 0,
        totalUnusedCredit: 0,
        totalNetPayable: 0,
      }
    );
  }, [filteredSuppliers]);

  async function handleSave() {
    if (!companyId) return;

    const validationError = validateSupplierPaymentForm(form);
    if (validationError) {
      toast({
        title: "Invalid payment",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await createSupplierPayment({
        companyId,
        userId,
        values: form,
      });

      toast({ title: "Payment saved", description: "Supplier payment recorded successfully." });

      const currentSupplierId = form.supplier_id;
      setForm({
        ...emptySupplierPaymentForm,
        branch_id: activeBranchId || branchId || "",
        supplier_id: currentSupplierId,
        purchase_id: "none",
      });

      await Promise.all([
        loadPayments(),
        loadSuppliersAndSnapshots(),
        loadOpenPurchases(currentSupplierId),
      ]);
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save supplier payment.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 bg-slate-950 p-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Supplier Payments</h1>
          <p className="text-slate-300">
            Snapshot-driven supplier reconciliation. Cards use the supplier snapshot only.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full font-semibold sm:w-auto">
          {saving ? "Saving..." : "Save Payment"}
        </Button>
      </div>

      <Card className="border-slate-600 bg-slate-900 shadow-lg shadow-black/20">
        <CardHeader>
          <CardTitle className="text-xl text-white">Record Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Supplier</Label>
              <Select
                value={form.supplier_id}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, supplier_id: value, purchase_id: "none" }))
                }
              >
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Branch</Label>
              <Select value={form.branch_id} onValueChange={(value) => setForm((prev) => ({ ...prev, branch_id: value }))}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Payment Date</Label>
              <Input type="date" value={form.payment_date} onChange={(e) => setForm((prev) => ({ ...prev, payment_date: e.target.value }))} className="border-slate-500 bg-slate-950 text-white" />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Amount</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} className="border-slate-500 bg-slate-950 text-white" />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Apply to Purchase</Label>
              <Select value={form.purchase_id} onValueChange={(value) => setForm((prev) => ({ ...prev, purchase_id: value }))}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General supplier payment</SelectItem>
                  {openPurchases.map((purchase) => (
                    <SelectItem key={purchase.id} value={purchase.id}>
                      {(purchase.invoice_number || purchase.reference_number || purchase.purchase_date) + ` - Balance: GHS ${money(purchase.balance_due)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Payment Method</Label>
              <Select value={form.payment_method} onValueChange={(value) => setForm((prev) => ({ ...prev, payment_method: value }))}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="momo">MoMo</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Reference Number</Label>
              <Input value={form.reference_number} onChange={(e) => setForm((prev) => ({ ...prev, reference_number: e.target.value }))} className="border-slate-500 bg-slate-950 text-white" />
            </div>

            <div className="space-y-2 sm:col-span-2 xl:col-span-2">
              <Label className="text-slate-200">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="border-slate-500 bg-slate-950 text-white" />
            </div>
          </div>

          {selectedPurchase ? (
            <div className="mt-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4 text-sm shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div><p className="text-slate-400">Purchase Total</p><p className="font-semibold text-white">GHS {money(selectedPurchase.total_amount)}</p></div>
                <div><p className="text-slate-400">Cash Applied</p><p className="font-semibold text-emerald-300">GHS {money(selectedPurchase.amount_paid)}</p></div>
                <div><p className="text-slate-400">Credit Applied</p><p className="font-semibold text-cyan-300">GHS {money(selectedPurchase.supplier_credit_applied)}</p></div>
                <div><p className="text-slate-400">Current Balance</p><p className="font-semibold text-amber-300">GHS {money(selectedPurchase.balance_due)}</p></div>
              </div>
            </div>
          ) : form.supplier_id ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200 shadow-sm">
              General supplier payment will remain unallocated until you allocate it from the payment statement or allocation tools.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-lg shadow-black/20">
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Filter Supplier</Label>
              <Select value={filterSupplierId} onValueChange={setFilterSupplierId}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Filter Branch</Label>
              <Select value={filterBranchId} onValueChange={setFilterBranchId}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border-slate-500 bg-slate-950 text-white" />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border-slate-500 bg-slate-950 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-lg shadow-black/20">
        <CardHeader><CardTitle className="text-xl text-white">Payment History {loading ? "• Loading..." : ""}</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/70"><SupplierPaymentsTable payments={payments} branches={branches as any} /></div></CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-lg shadow-black/20">
        <CardHeader><CardTitle className="text-xl text-white">Supplier Payables Summary</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Card className="border-slate-700 bg-slate-950"><CardContent className="pt-4 text-white">Total Purchased<br />GHS {money(totals.totalPurchased)}</CardContent></Card>
            <Card className="border-slate-700 bg-slate-950"><CardContent className="pt-4 text-emerald-300">Cash Applied<br />GHS {money(totals.totalCashApplied)}</CardContent></Card>
            <Card className="border-slate-700 bg-slate-950"><CardContent className="pt-4 text-cyan-300">Credit Used<br />GHS {money(totals.totalCreditApplied)}</CardContent></Card>
            <Card className="border-slate-700 bg-slate-950"><CardContent className="pt-4 text-white">Total Settled<br />GHS {money(totals.totalSettled)}</CardContent></Card>
            <Card className="border-slate-700 bg-slate-950"><CardContent className="pt-4 text-amber-300">Gross Outstanding<br />GHS {money(totals.totalGrossOutstanding)}</CardContent></Card>
            <Card className="border-slate-700 bg-slate-950"><CardContent className="pt-4 text-cyan-300">Unused Credit<br />GHS {money(totals.totalUnusedCredit)}</CardContent></Card>
            <Card className="border-slate-700 bg-slate-950"><CardContent className="pt-4 text-amber-300">Net Payable<br />GHS {money(totals.totalNetPayable)}</CardContent></Card>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search supplier name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="border-slate-700 bg-slate-800 pl-10 text-white" />
          </div>

          <div className="space-y-3">
            {filteredSuppliers.map((supplier) => (
              <div key={supplier.supplier_id} className="rounded-lg bg-slate-700/50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-medium text-white">{supplier.name}</p>
                    <p className="text-xs text-slate-400">{supplier.phone || "No phone"}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
                    <div className="rounded-md bg-slate-800 p-3"><p className="text-[11px] text-slate-400">Purchased</p><p className="text-sm font-semibold text-white">GHS {money(supplier.total_purchased)}</p></div>
                    <div className="rounded-md bg-slate-800 p-3"><p className="text-[11px] text-slate-400">Cash Applied</p><p className="text-sm font-semibold text-emerald-300">GHS {money(supplier.cash_applied)}</p></div>
                    <div className="rounded-md bg-slate-800 p-3"><p className="text-[11px] text-slate-400">Credit Used</p><p className="text-sm font-semibold text-cyan-300">GHS {money(supplier.credit_applied)}</p></div>
                    <div className="rounded-md bg-slate-800 p-3"><p className="text-[11px] text-slate-400">Total Settled</p><p className="text-sm font-semibold text-white">GHS {money(supplier.total_settled)}</p></div>
                    <div className="rounded-md bg-slate-800 p-3"><p className="text-[11px] text-slate-400">Gross Outstanding</p><p className="text-sm font-semibold text-amber-300">GHS {money(supplier.gross_outstanding)}</p></div>
                    <div className="rounded-md bg-slate-800 p-3"><p className="text-[11px] text-slate-400">Unused Credit</p><p className="text-sm font-semibold text-cyan-300">GHS {money(supplier.unused_credit)}</p></div>
                    <div className="rounded-md bg-slate-800 p-3"><p className="text-[11px] text-slate-400">Net Payable</p><p className="text-sm font-semibold text-amber-300">GHS {money(supplier.net_payable)}</p></div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => { setBreakdownSupplier(supplier); setBreakdownOpen(true); }}>View Breakdown</Button>
                  <Button onClick={() => {
                    setForm((prev) => ({ ...prev, supplier_id: supplier.supplier_id, purchase_id: "none" }));
                    setFilterSupplierId(supplier.supplier_id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}>Record Payment</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <DialogContent className="border-slate-700 bg-slate-900 text-white sm:max-w-2xl">
          <DialogHeader><DialogTitle>Balance Breakdown {breakdownSupplier ? `— ${breakdownSupplier.name}` : ""}</DialogTitle></DialogHeader>
          {breakdownSupplier ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span>Total Purchases</span><span>GHS {money(breakdownSupplier.total_purchased)}</span></div>
              <div className="flex justify-between"><span>Less Cash Applied</span><span>- GHS {money(breakdownSupplier.cash_applied)}</span></div>
              <div className="flex justify-between"><span>Less Credit Used</span><span>- GHS {money(breakdownSupplier.credit_applied)}</span></div>
              <div className="flex justify-between border-t border-slate-700 pt-2 font-semibold"><span>Gross Outstanding</span><span>GHS {money(breakdownSupplier.gross_outstanding)}</span></div>
              <div className="flex justify-between"><span>Less Unused Credit</span><span>- GHS {money(breakdownSupplier.unused_credit)}</span></div>
              <div className="flex justify-between border-t border-slate-700 pt-2 font-semibold"><span>Net Payable</span><span>GHS {money(breakdownSupplier.net_payable)}</span></div>
            </div>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setBreakdownOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
