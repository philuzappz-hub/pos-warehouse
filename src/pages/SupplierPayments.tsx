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
  applyAvailableCreditToPurchase,
  createGeneralSupplierPaymentWithAutoSettle,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

type BranchRow = { id: string; name: string };

type OpenPurchaseRow = {
  id: string;
  purchase_date: string;
  invoice_number: string | null;
  reference_number: string | null;
  total_amount: number;
  supplier_credit_applied: number;
  balance_due: number;
  branch_id?: string | null;
};

type OrderLookupRow = OpenPurchaseRow & {
  supplier_id: string;
  branch_id: string | null;
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
  available_credit: number;
  net_payable: number;
};

function num(v: number | string | null | undefined) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Cash applied should exclude still-unallocated payments.
 * This keeps the operational summary honest.
 */
function deriveCashApplied(snapshot?: SupplierAccountSnapshot | null) {
  return Math.max(
    num(snapshot?.totalPayments) - num(snapshot?.totalUnallocatedPayments),
    0
  );
}

function deriveCreditApplied(snapshot?: SupplierAccountSnapshot | null) {
  return num(snapshot?.totalCreditsApplied);
}

/**
 * Total settled = purchases already covered, regardless of whether by cash or credit.
 */
function deriveTotalSettled(snapshot?: SupplierAccountSnapshot | null) {
  return Math.max(
    num(snapshot?.totalPurchases) - num(snapshot?.outstandingPurchases),
    0
  );
}

/**
 * Gross outstanding should show actual open purchase balance.
 * Do not net this against credit on the Supplier Payments page.
 */
function deriveGrossOutstanding(snapshot?: SupplierAccountSnapshot | null) {
  return num(snapshot?.outstandingPurchases);
}

/**
 * Available credit on Supplier Payments page should show raw usable supplier credit pool,
 * not the already-netted post-offset value.
 */
function deriveAvailableCredit(snapshot?: SupplierAccountSnapshot | null) {
  return num(snapshot?.creditPool);
}

function deriveNetPayable(snapshot?: SupplierAccountSnapshot | null) {
  return num(snapshot?.netPayable);
}

function formatPurchaseOptionLabel(purchase: OpenPurchaseRow) {
  const orderId = purchase.invoice_number || "N/A";
  const supplierRef = purchase.reference_number ? ` • Ref: ${purchase.reference_number}` : "";
  const purchaseDate = purchase.purchase_date ? ` • Date: ${purchase.purchase_date}` : "";
  return `Order: ${orderId}${supplierRef}${purchaseDate} • Balance: GHS ${money(
    purchase.balance_due
  )}`;
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
  const [supplierSnapshots, setSupplierSnapshots] = useState<
    Record<string, SupplierAccountSnapshot>
  >({});
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
  const [openPurchases, setOpenPurchases] = useState<OpenPurchaseRow[]>([]);

  const [form, setForm] = useState<SupplierPaymentFormValues>({
    ...emptySupplierPaymentForm,
    branch_id: activeBranchId || branchId || "",
  });

  const [useAvailableCredit, setUseAvailableCredit] = useState(false);

  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [filterBranchId, setFilterBranchId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [orderLookupLoading, setOrderLookupLoading] = useState(false);
  const [orderLookupMatch, setOrderLookupMatch] = useState<OrderLookupRow | null>(null);
  const [orderLookupMessage, setOrderLookupMessage] = useState("");
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);

  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownSupplier, setBreakdownSupplier] = useState<SupplierDebtSummary | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<SupplierPaymentFormValues | null>(null);
  const [outstandingAmount, setOutstandingAmount] = useState(0);

  const lookupDebounceRef = useRef<number | null>(null);

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

  async function lookupOrderId(orderId: string) {
    if (!companyId) return;

    const normalized = orderId.trim();
    if (!normalized) {
      setOrderLookupMatch(null);
      setOrderLookupMessage("");
      setPendingPurchaseId(null);
      return;
    }

    setOrderLookupLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("supplier_purchase_balance_view")
        .select(`
          id,
          supplier_id,
          branch_id,
          purchase_date,
          invoice_number,
          reference_number,
          total_amount,
          supplier_credit_applied,
          computed_balance_due
        `)
        .eq("company_id", companyId)
        .eq("invoice_number", normalized)
        .gt("computed_balance_due", 0)
        .order("purchase_date", { ascending: false })
        .limit(2);

      if (error) throw error;

      const matches = (data ?? []) as any[];

      if (matches.length === 1) {
        const match: OrderLookupRow = {
          id: String(matches[0].id),
          supplier_id: String(matches[0].supplier_id),
          branch_id: matches[0].branch_id ? String(matches[0].branch_id) : null,
          purchase_date: String(matches[0].purchase_date || ""),
          invoice_number: matches[0].invoice_number || null,
          reference_number: matches[0].reference_number || null,
          total_amount: num(matches[0].total_amount),
          supplier_credit_applied: num(matches[0].supplier_credit_applied),
          balance_due: num(matches[0].computed_balance_due),
        };

        setOrderLookupMatch(match);
        setOrderLookupMessage(`Order found: ${match.invoice_number}`);

        setForm((prev) => ({
          ...prev,
          supplier_id: match.supplier_id,
          branch_id: match.branch_id || prev.branch_id,
          purchase_id: "none",
        }));

        setFilterSupplierId(match.supplier_id);
        setPendingPurchaseId(match.id);
      } else if (matches.length > 1) {
        setOrderLookupMatch(null);
        setOrderLookupMessage("More than one open order matched this Order ID.");
        setPendingPurchaseId(null);
      } else {
        setOrderLookupMatch(null);
        setOrderLookupMessage("No open order found for this Order ID.");
        setPendingPurchaseId(null);
      }
    } catch (e: any) {
      setOrderLookupMatch(null);
      setOrderLookupMessage("");
      setPendingPurchaseId(null);
      toast({
        title: "Order lookup failed",
        description: e?.message || "Could not search by Order ID.",
        variant: "destructive",
      });
    } finally {
      setOrderLookupLoading(false);
    }
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
  }, [companyId, activeBranchId, branchId, toast]);

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
    setUseAvailableCredit(false);
  }, [form.purchase_id, form.supplier_id]);

  useEffect(() => {
    if (!supplierIdFromUrl || suppliers.length === 0) return;
    const match = suppliers.find((s) => s.id === supplierIdFromUrl);
    if (!match) return;

    setForm((prev) => ({
      ...prev,
      supplier_id: match.id,
      purchase_id: "none",
    }));
    setFilterSupplierId(match.id);
  }, [supplierIdFromUrl, suppliers]);

  useEffect(() => {
    if (!purchaseIdFromUrl || !openPurchases.length) return;
    const match = openPurchases.find((p) => p.id === purchaseIdFromUrl);
    if (!match) return;

    setForm((prev) => ({
      ...prev,
      purchase_id: match.id,
      branch_id: match.branch_id || prev.branch_id,
    }));

    setPurchaseSearch(match.invoice_number || "");
    setOrderLookupMatch({
      ...match,
      supplier_id: form.supplier_id,
      branch_id: match.branch_id || null,
    });
    setOrderLookupMessage(match.invoice_number ? `Order found: ${match.invoice_number}` : "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [purchaseIdFromUrl, openPurchases]);

  useEffect(() => {
    if (!pendingPurchaseId || !openPurchases.length) return;

    const match = openPurchases.find((p) => p.id === pendingPurchaseId);
    if (!match) return;

    setForm((prev) => ({
      ...prev,
      purchase_id: match.id,
      branch_id: match.branch_id || prev.branch_id,
    }));

    if (match.invoice_number) {
      setPurchaseSearch(match.invoice_number);
      setOrderLookupMessage(`Order found: ${match.invoice_number}`);
    }

    setPendingPurchaseId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pendingPurchaseId, openPurchases]);

  useEffect(() => {
    if (lookupDebounceRef.current) {
      window.clearTimeout(lookupDebounceRef.current);
    }

    const q = purchaseSearch.trim();

    if (!q) {
      setOrderLookupMatch(null);
      setOrderLookupMessage("");
      setPendingPurchaseId(null);
      return;
    }

    lookupDebounceRef.current = window.setTimeout(() => {
      void lookupOrderId(q);
    }, 450);

    return () => {
      if (lookupDebounceRef.current) {
        window.clearTimeout(lookupDebounceRef.current);
      }
    };
  }, [purchaseSearch, companyId]);

  const filteredOpenPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();
    if (!q) return openPurchases;

    return openPurchases.filter((purchase) => {
      return (
        String(purchase.invoice_number || "").toLowerCase().includes(q) ||
        String(purchase.reference_number || "").toLowerCase().includes(q) ||
        String(purchase.purchase_date || "").toLowerCase().includes(q)
      );
    });
  }, [openPurchases, purchaseSearch]);

  const selectedPurchase =
    form.purchase_id && form.purchase_id !== "none"
      ? openPurchases.find((p) => p.id === form.purchase_id) || null
      : null;

  const enteredAmount = useMemo(() => num(form.amount), [form.amount]);
  const supplierSnapshot = supplierSnapshots[form.supplier_id] || null;

  const availableCredit = useMemo(
    () => deriveAvailableCredit(supplierSnapshot),
    [supplierSnapshot]
  );

  const creditToUse = useMemo(() => {
    if (!selectedPurchase || !useAvailableCredit) return 0;
    return Math.min(availableCredit, num(selectedPurchase.balance_due));
  }, [selectedPurchase, availableCredit, useAvailableCredit]);

  const totalAppliedForPreview = useMemo(
    () => creditToUse + enteredAmount,
    [creditToUse, enteredAmount]
  );

  const projectedRemainingBalance = useMemo(() => {
    if (!selectedPurchase) return null;
    return Math.max(0, num(selectedPurchase.balance_due) - totalAppliedForPreview);
  }, [selectedPurchase, totalAppliedForPreview]);

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
          available_credit: deriveAvailableCredit(snapshot),
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
        acc.totalAvailableCredit += row.available_credit;
        acc.totalNetPayable += row.net_payable;
        return acc;
      },
      {
        totalPurchased: 0,
        totalCashApplied: 0,
        totalCreditApplied: 0,
        totalSettled: 0,
        totalGrossOutstanding: 0,
        totalAvailableCredit: 0,
        totalNetPayable: 0,
      }
    );
  }, [filteredSuppliers]);

  async function resetAfterSave(currentSupplierId: string) {
    setForm({
      ...emptySupplierPaymentForm,
      branch_id: activeBranchId || branchId || "",
      supplier_id: currentSupplierId,
      purchase_id: "none",
    });
    setUseAvailableCredit(false);
    setPurchaseSearch("");
    setOrderLookupMatch(null);
    setOrderLookupMessage("");
    setPendingPurchaseId(null);

    await Promise.all([
      loadPayments(),
      loadSuppliersAndSnapshots(),
      loadOpenPurchases(currentSupplierId),
    ]);
  }

  async function savePaymentDirect(values: SupplierPaymentFormValues) {
    await createSupplierPayment({
      companyId,
      userId,
      values,
    });
  }

  async function handleConfirmAutoAllocate(autoApply: boolean) {
    if (!pendingPayment || !companyId) return;

    setSaving(true);
    try {
      if (autoApply) {
        const result = await createGeneralSupplierPaymentWithAutoSettle({
          companyId,
          userId,
          values: pendingPayment,
        });

        toast({
          title: "Payment saved",
          description:
            result.remainingCredit > 0
              ? `Outstanding settled first. GHS ${money(
                  result.allocatedTotal
                )} allocated and GHS ${money(result.remainingCredit)} kept as supplier credit.`
              : `Outstanding settled first. GHS ${money(result.allocatedTotal)} allocated.`,
        });
      } else {
        await savePaymentDirect(pendingPayment);

        toast({
          title: "Payment saved",
          description: "General supplier payment recorded as unapplied credit.",
        });
      }

      const currentSupplierId = pendingPayment.supplier_id;
      setConfirmOpen(false);
      setPendingPayment(null);
      setOutstandingAmount(0);

      await resetAfterSave(currentSupplierId);
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

  async function handleSave() {
    if (!companyId) return;

    const normalizedValues: SupplierPaymentFormValues = {
      ...form,
      purchase_id: form.purchase_id === "none" ? "none" : form.purchase_id,
    };

    const selectedPurchaseId =
      normalizedValues.purchase_id !== "none" ? normalizedValues.purchase_id : null;

    if (!selectedPurchaseId) {
      const validationError = validateSupplierPaymentForm(normalizedValues);
      if (validationError) {
        toast({
          title: "Invalid payment",
          description: validationError,
          variant: "destructive",
        });
        return;
      }

      const snapshot = supplierSnapshots[normalizedValues.supplier_id];
      const outstanding = deriveGrossOutstanding(snapshot);

      if (outstanding > 0) {
        setOutstandingAmount(outstanding);
        setPendingPayment(normalizedValues);
        setConfirmOpen(true);
        return;
      }

      setSaving(true);
      try {
        await savePaymentDirect(normalizedValues);

        toast({
          title: "Payment saved",
          description: "General supplier payment recorded successfully.",
        });

        await resetAfterSave(normalizedValues.supplier_id);
      } catch (e: any) {
        toast({
          title: "Save failed",
          description: e?.message || "Could not save supplier payment.",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (
      !normalizedValues.supplier_id ||
      !normalizedValues.branch_id ||
      !normalizedValues.payment_date
    ) {
      toast({
        title: "Invalid payment",
        description: "Please select supplier, branch, date and purchase.",
        variant: "destructive",
      });
      return;
    }

    if (!useAvailableCredit && enteredAmount <= 0) {
      toast({
        title: "Invalid payment",
        description: "Enter an amount or apply available credit.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      let remainingAfterCredit = selectedPurchase ? num(selectedPurchase.balance_due) : 0;
      let creditUsed = 0;

      if (useAvailableCredit && selectedPurchaseId) {
        const creditResult = await applyAvailableCreditToPurchase({
          purchaseId: selectedPurchaseId,
        });

        creditUsed = num(creditResult.appliedAmount);
        remainingAfterCredit = num(creditResult.remainingBalance);
      }

      if (enteredAmount > 0) {
        if (enteredAmount > remainingAfterCredit) {
          throw new Error(
            `Cash amount exceeds remaining balance after credit. Remaining balance is ${money(
              remainingAfterCredit
            )}.`
          );
        }

        await savePaymentDirect({
          ...normalizedValues,
          amount: String(enteredAmount),
        });
      }

      if (creditUsed <= 0 && enteredAmount <= 0) {
        throw new Error("Nothing was applied to this purchase.");
      }

      toast({
        title: "Payment saved",
        description:
          creditUsed > 0 && enteredAmount > 0
            ? `Applied GHS ${money(creditUsed)} from available credit and GHS ${money(
                enteredAmount
              )} as new payment.`
            : creditUsed > 0
            ? `Applied GHS ${money(creditUsed)} from available credit.`
            : "Supplier payment linked to purchase successfully.",
      });

      await resetAfterSave(normalizedValues.supplier_id);
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
            Record all supplier payments here. Link payments to purchase orders by Order ID or keep
            them as general supplier payments.
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
                  setForm((prev) => ({
                    ...prev,
                    supplier_id: value,
                    purchase_id: "none",
                  }))
                }
              >
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
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
              <Select
                value={form.branch_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, branch_id: value }))}
              >
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Payment Date</Label>
              <Input
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                className="border-slate-500 bg-slate-950 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="border-slate-500 bg-slate-950 text-white"
              />
            </div>

            <div className="space-y-2 xl:col-span-2">
              <Label className="text-slate-200">Search Order ID</Label>
              <Input
                placeholder="Enter Order ID (e.g. PO-ABCD-20260405-4821)"
                value={purchaseSearch}
                onChange={(e) => setPurchaseSearch(e.target.value)}
                className="border-slate-500 bg-slate-950 text-white"
              />
              <p className="text-xs text-slate-400">
                Smart lookup will try to find and auto-select the matching open order.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Apply to Purchase</Label>
              <Select
                value={form.purchase_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, purchase_id: value }))}
              >
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General supplier payment</SelectItem>
                  {filteredOpenPurchases.map((purchase) => (
                    <SelectItem key={purchase.id} value={purchase.id}>
                      {formatPurchaseOptionLabel(purchase)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Payment Method</Label>
              <Select
                value={form.payment_method}
                onValueChange={(value) => setForm((prev) => ({ ...prev, payment_method: value }))}
              >
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                  <SelectValue />
                </SelectTrigger>
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
              <Input
                value={form.reference_number}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reference_number: e.target.value }))
                }
                className="border-slate-500 bg-slate-950 text-white"
              />
            </div>

            <div className="space-y-2 sm:col-span-2 xl:col-span-2">
              <Label className="text-slate-200">Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="border-slate-500 bg-slate-950 text-white"
              />
            </div>
          </div>

          {purchaseSearch.trim() ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
              {orderLookupLoading ? (
                <p className="text-cyan-300">Searching Order ID...</p>
              ) : orderLookupMatch ? (
                <div className="space-y-1">
                  <p className="font-medium text-emerald-300">
                    Order found: {orderLookupMatch.invoice_number}
                  </p>
                  <p className="text-slate-300">
                    Balance: GHS {money(orderLookupMatch.balance_due)}
                  </p>
                </div>
              ) : orderLookupMessage ? (
                <p className="text-amber-300">{orderLookupMessage}</p>
              ) : null}
            </div>
          ) : null}

          {selectedPurchase ? (
            <div className="mt-2 space-y-4 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4 text-sm shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-slate-400">Order ID</p>
                  <p className="font-semibold text-white">
                    {selectedPurchase.invoice_number || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Purchase Total</p>
                  <p className="font-semibold text-white">
                    GHS {money(selectedPurchase.total_amount)}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Credit Applied So Far</p>
                  <p className="font-semibold text-cyan-300">
                    GHS {money(selectedPurchase.supplier_credit_applied)}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Current Balance</p>
                  <p className="font-semibold text-amber-300">
                    GHS {money(selectedPurchase.balance_due)}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Branch</p>
                  <p className="font-semibold text-white">
                    {branches.find((b) => b.id === form.branch_id)?.name || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Available Credit</p>
                  <p className="font-semibold text-cyan-300">
                    GHS {money(availableCredit)}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Credit To Use</p>
                  <p className="font-semibold text-cyan-300">GHS {money(creditToUse)}</p>
                </div>

                <div>
                  <p className="text-slate-400">Remaining After This Payment</p>
                  <p className="font-semibold text-emerald-300">
                    GHS {money(projectedRemainingBalance || 0)}
                  </p>
                </div>
              </div>

              {availableCredit > 0 ? (
                <div className="rounded-lg border border-cyan-500/30 bg-slate-950/50 p-3">
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={useAvailableCredit}
                      onChange={(e) => setUseAvailableCredit(e.target.checked)}
                    />
                    Apply Available Credit
                  </label>
                  <p className="mt-2 text-xs text-slate-300">
                    Available credit is only applied when a specific purchase order is selected.
                  </p>
                </div>
              ) : null}

              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
                <p className="font-semibold text-white">How this balance is calculated</p>
                <p className="mt-1">
                  Current Balance = Purchase Balance − Available Credit Used − New Cash Payment
                </p>
                <p className="mt-1">
                  In this order: Credit used{" "}
                  <span className="text-cyan-300">GHS {money(creditToUse)}</span>, New payment{" "}
                  <span className="text-emerald-300">GHS {money(enteredAmount)}</span>, Remaining{" "}
                  <span className="text-amber-300">
                    GHS {money(projectedRemainingBalance || 0)}
                  </span>
                </p>
              </div>
            </div>
          ) : form.supplier_id ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200 shadow-sm">
              General supplier payment can either settle outstanding purchases first or be kept as
              available supplier credit. Available credit itself is not used on general supplier
              payment.
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
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Filter Branch</Label>
              <Select value={filterBranchId} onValueChange={setFilterBranchId}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-slate-500 bg-slate-950 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-slate-500 bg-slate-950 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-lg shadow-black/20">
        <CardHeader>
          <CardTitle className="text-xl text-white">
            Payment History {loading ? "• Loading..." : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/70">
            <SupplierPaymentsTable payments={payments} branches={branches as any} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-lg shadow-black/20">
        <CardHeader>
          <CardTitle className="text-xl text-white">Supplier Payables Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Card className="border-slate-700 bg-slate-950">
              <CardContent className="pt-4 text-white">
                Total Purchased
                <br />
                GHS {money(totals.totalPurchased)}
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-950">
              <CardContent className="pt-4 text-emerald-300">
                Cash Applied
                <br />
                GHS {money(totals.totalCashApplied)}
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-950">
              <CardContent className="pt-4 text-cyan-300">
                Credit Used
                <br />
                GHS {money(totals.totalCreditApplied)}
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-950">
              <CardContent className="pt-4 text-white">
                Total Settled
                <br />
                GHS {money(totals.totalSettled)}
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-950">
              <CardContent className="pt-4 text-amber-300">
                Gross Outstanding
                <br />
                GHS {money(totals.totalGrossOutstanding)}
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-950">
              <CardContent className="pt-4 text-cyan-300">
                Available Credit
                <br />
                GHS {money(totals.totalAvailableCredit)}
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-950">
              <CardContent className="pt-4 text-amber-300">
                Net Payable
                <br />
                GHS {money(totals.totalNetPayable)}
              </CardContent>
            </Card>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search supplier name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-700 bg-slate-800 pl-10 text-white"
            />
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
                    <div className="rounded-md bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-400">Purchased</p>
                      <p className="text-sm font-semibold text-white">
                        GHS {money(supplier.total_purchased)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-400">Cash Applied</p>
                      <p className="text-sm font-semibold text-emerald-300">
                        GHS {money(supplier.cash_applied)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-400">Credit Used</p>
                      <p className="text-sm font-semibold text-cyan-300">
                        GHS {money(supplier.credit_applied)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-400">Total Settled</p>
                      <p className="text-sm font-semibold text-white">
                        GHS {money(supplier.total_settled)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-400">Gross Outstanding</p>
                      <p className="text-sm font-semibold text-amber-300">
                        GHS {money(supplier.gross_outstanding)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-400">Available Credit</p>
                      <p className="text-sm font-semibold text-cyan-300">
                        GHS {money(supplier.available_credit)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-400">Net Payable</p>
                      <p className="text-sm font-semibold text-amber-300">
                        GHS {money(supplier.net_payable)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBreakdownSupplier(supplier);
                      setBreakdownOpen(true);
                    }}
                  >
                    View Breakdown
                  </Button>

                  <Button
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        supplier_id: supplier.supplier_id,
                        purchase_id: "none",
                      }));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Record Payment
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <DialogContent className="border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>How balance is calculated</DialogTitle>
          </DialogHeader>

          {breakdownSupplier ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="font-semibold text-white">{breakdownSupplier.name}</p>
                <p className="mt-2 text-slate-300">
                  Gross Outstanding = actual unpaid purchase balances
                </p>
                <p className="text-slate-300">
                  Available Credit = raw unapplied supplier credit
                </p>
                <p className="text-slate-300">
                  Net Payable = Gross Outstanding − Available Credit
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <p className="text-slate-400">Total Purchased</p>
                  <p className="font-semibold text-white">
                    GHS {money(breakdownSupplier.total_purchased)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <p className="text-slate-400">Cash Applied</p>
                  <p className="font-semibold text-emerald-300">
                    GHS {money(breakdownSupplier.cash_applied)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <p className="text-slate-400">Credit Used</p>
                  <p className="font-semibold text-cyan-300">
                    GHS {money(breakdownSupplier.credit_applied)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <p className="text-slate-400">Total Settled</p>
                  <p className="font-semibold text-white">
                    GHS {money(breakdownSupplier.total_settled)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <p className="text-slate-400">Gross Outstanding</p>
                  <p className="font-semibold text-amber-300">
                    GHS {money(breakdownSupplier.gross_outstanding)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <p className="text-slate-400">Available Credit</p>
                  <p className="font-semibold text-cyan-300">
                    GHS {money(breakdownSupplier.available_credit)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 md:col-span-2">
                  <p className="text-slate-400">Net Payable</p>
                  <p className="font-semibold text-amber-300">
                    GHS {money(breakdownSupplier.net_payable)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBreakdownOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>Outstanding purchase balance found</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm text-slate-300">
            <p>
              This supplier currently has outstanding balances totaling{" "}
              <span className="font-semibold text-amber-300">GHS {money(outstandingAmount)}</span>.
            </p>
            <p>
              Do you want this general supplier payment to settle those open purchase balances first?
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => handleConfirmAutoAllocate(false)}
            >
              Keep as Available Credit
            </Button>

            <Button disabled={saving} onClick={() => handleConfirmAutoAllocate(true)}>
              {saving ? "Processing..." : "Settle Outstanding First"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}