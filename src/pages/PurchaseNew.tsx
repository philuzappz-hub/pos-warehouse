import BalanceBreakdownTooltip from "@/components/accounting/BalanceBreakdownTooltip";
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
import PurchaseItemsTable from "@/features/purchases/components/PurchaseItemsTable";

import {
  createEmptyPurchaseItemRow,
  getPurchaseTotals,
  money,
  validatePurchaseForm,
} from "@/features/purchases/helpers";
import {
  createPurchaseWithItems,
  fetchPurchaseProducts,
  fetchPurchaseSuppliers,
  fetchSupplierAccountSnapshot,
} from "@/features/purchases/services";
import type {
  ProductOption,
  PurchaseFormValues,
  PurchaseItemFormRow,
  SupplierAccountSnapshot,
  SupplierOption,
} from "@/features/purchases/types";
import { emptyPurchaseForm } from "@/features/purchases/types";
import type { BranchRow } from "@/features/reports/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from "react";

function computeSmartOffsetPreview(totalAmount: number, availableCredit: number) {
  const total = Number(totalAmount || 0);
  const credit = Number(availableCredit || 0);
  const creditToUse = Math.min(total, credit);
  const balanceLeft = Math.max(total - creditToUse, 0);

  return {
    total,
    availableCredit: credit,
    creditToUse,
    balanceLeft,
  };
}

export default function PurchaseNew() {
  const { toast } = useToast();
  const { profile, user, activeBranchId } = useAuth() as any;

  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [form, setForm] = useState<PurchaseFormValues>({
    ...emptyPurchaseForm,
    branch_id: activeBranchId || "",
  });

  const [rows, setRows] = useState<PurchaseItemFormRow[]>([createEmptyPurchaseItemRow()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSupplierAccount, setLoadingSupplierAccount] = useState(false);

  const [supplierAccount, setSupplierAccount] = useState<SupplierAccountSnapshot | null>(null);
  const supplierToastKeyRef = useRef("");

  const loadBranches = async () => {
    if (!companyId) return;

    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await (supabase as any)
      .from("branches")
      .select("id,name,address,phone,email,company_id,is_active")
      .eq("company_id", companyId)
      .order("name");

    if (error) throw error;
    setBranches((data ?? []) as BranchRow[]);
  };

  const loadSuppliers = async () => {
    if (!companyId) {
      setSuppliers([]);
      return;
    }

    setLoadingSuppliers(true);
    try {
      const rows = await fetchPurchaseSuppliers(companyId);
      setSuppliers(rows);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const loadProducts = async (branchId?: string | null) => {
    if (!companyId) {
      setProducts([]);
      return;
    }

    setLoadingProducts(true);
    try {
      const rows = await fetchPurchaseProducts({
        companyId,
        branchId: branchId || null,
      });
      setProducts(rows);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadSupplierAccount = async (supplierId?: string) => {
    if (!companyId || !supplierId) {
      setSupplierAccount(null);
      supplierToastKeyRef.current = "";
      return;
    }

    setLoadingSupplierAccount(true);
    try {
      const snapshot = await fetchSupplierAccountSnapshot({
        companyId,
        supplierId,
      });

      setSupplierAccount(snapshot);

      const supplierName = suppliers.find((s) => s.id === supplierId)?.name || "Supplier";

      const toastKey = `${supplierId}-${snapshot.netPayable}-${snapshot.availableCredit}`;
      if (supplierToastKeyRef.current !== toastKey) {
        supplierToastKeyRef.current = toastKey;

        if (snapshot.netPayable > 0) {
          toast({
            title: "Supplier balance payable",
            description: `You currently owe ${supplierName} GHS ${money(snapshot.netPayable)}.`,
            variant: "destructive",
          });
        } else if (snapshot.availableCredit > 0) {
          toast({
            title: "Supplier credit available",
            description: `${supplierName} currently owes you GHS ${money(
              snapshot.availableCredit
            )}.`,
          });
        } else {
          toast({
            title: "Supplier account settled",
            description: `${supplierName} is currently balanced.`,
          });
        }
      }
    } catch (e: any) {
      toast({
        title: "Account load failed",
        description: e?.message || "Could not load supplier account position.",
        variant: "destructive",
      });
      setSupplierAccount(null);
      supplierToastKeyRef.current = "";
    } finally {
      setLoadingSupplierAccount(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await loadBranches();
        await loadSuppliers();
        await loadProducts(activeBranchId || null);
      } catch (e: any) {
        toast({
          title: "Load failed",
          description: e?.message || "Could not load purchase setup data.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, activeBranchId, toast]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      branch_id: prev.branch_id || activeBranchId || "",
    }));
  }, [activeBranchId]);

  useEffect(() => {
    void loadProducts(form.branch_id || null);
  }, [form.branch_id, companyId]);

  useEffect(() => {
    void loadSupplierAccount(form.supplier_id);
  }, [form.supplier_id, companyId, suppliers]);

  const totals = useMemo(
    () => getPurchaseTotals(form, rows, supplierAccount?.availableCredit || 0),
    [form, rows, supplierAccount]
  );

  const smartOffsetPreview = useMemo(() => {
    return computeSmartOffsetPreview(
      Number(totals.totalAmount || 0),
      Number(supplierAccount?.availableCredit || 0)
    );
  }, [totals.totalAmount, supplierAccount]);

  const supplierBreakdown = useMemo(
    () => ({
      openingBalance: 0,
      purchases: Number(supplierAccount?.totalPurchases || 0),
      payments: Number(supplierAccount?.totalPayments || 0),
      overpaymentCredits: Number(supplierAccount?.totalOverpaymentCredits || 0),
      unallocatedPayments: Number(supplierAccount?.totalUnallocatedPayments || 0),
      creditsApplied: Number(supplierAccount?.totalCreditsApplied || 0),
      netPayable: Number(supplierAccount?.netPayable || 0),
      availableCredit: Number(supplierAccount?.availableCredit || 0),
    }),
    [supplierAccount]
  );

  const handleChangeRow = (rowId: string, patch: Partial<PurchaseItemFormRow>) => {
    setRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyPurchaseItemRow()]);
  };

  const handleSave = async () => {
    if (!companyId) {
      toast({
        title: "Missing company",
        description: "Company context is missing.",
        variant: "destructive",
      });
      return;
    }

    const validationError = validatePurchaseForm(form, rows);
    if (validationError) {
      toast({
        title: "Invalid purchase",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await createPurchaseWithItems({
        companyId,
        userId,
        form,
        rows,
        supplierCreditBalance: supplierAccount?.availableCredit || 0,
      });

      const parts = [];
      if (totals.supplierCreditApplied > 0) {
        parts.push(`Credit used: GHS ${money(totals.supplierCreditApplied)}`);
      }
      if (totals.overpaymentAmount > 0) {
        parts.push(`Overpayment recorded: GHS ${money(totals.overpaymentAmount)}`);
      }

      toast({
        title: "Purchase saved",
        description:
          parts.length > 0
            ? `Purchase saved. ${parts.join(" • ")}`
            : "Purchase and stock update saved successfully.",
      });

      const savedSupplierId = form.supplier_id;

      setForm({
        ...emptyPurchaseForm,
        branch_id: activeBranchId || "",
        supplier_id: savedSupplierId,
      });
      setRows([createEmptyPurchaseItemRow()]);

      await loadSupplierAccount(savedSupplierId);
      await loadProducts(activeBranchId || null);
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save purchase.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 bg-slate-950 p-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">New Purchase</h1>
          <p className="text-slate-300">
            Record supplier purchases, stock received, and cost updates.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving || loading} className="w-full font-semibold sm:w-auto">
          {saving ? "Saving..." : "Save Purchase"}
        </Button>
      </div>

      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-white">Purchase Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Supplier</Label>
              <Select
                value={form.supplier_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, supplier_id: value }))}
              >
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue
                    placeholder={loadingSuppliers ? "Loading suppliers..." : "Select supplier"}
                  />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-white">
                  {loadingSuppliers ? (
                    <SelectItem value="__loading_suppliers" disabled>
                      Loading suppliers...
                    </SelectItem>
                  ) : suppliers.length > 0 ? (
                    suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__no_suppliers" disabled>
                      No suppliers found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Branch</Label>
              <Select
                value={form.branch_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, branch_id: value }))}
              >
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-white">
                  {branches.length > 0 ? (
                    branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__no_branches" disabled>
                      No branches found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Purchase Date</Label>
              <Input
                type="date"
                value={form.purchase_date}
                onChange={(e) => setForm((prev) => ({ ...prev, purchase_date: e.target.value }))}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Invoice Number</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm((prev) => ({ ...prev, invoice_number: e.target.value }))}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Reference Number</Label>
              <Input
                value={form.reference_number}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reference_number: e.target.value }))
                }
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2 sm:col-span-2 xl:col-span-3">
              <Label className="text-slate-200">Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="border-slate-600 bg-slate-800 text-white placeholder:text-slate-400"
                placeholder="Optional purchase note"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-slate-400">
              {loadingProducts
                ? "Loading products..."
                : `${products.length} product${products.length === 1 ? "" : "s"} available`}
            </span>

            {form.supplier_id ? (
              loadingSupplierAccount ? (
                <span className="text-slate-400">Loading supplier position...</span>
              ) : supplierAccount?.netPayable ? (
                <span className="font-medium text-red-400">
                  You owe supplier: GHS {money(supplierAccount.netPayable)}
                </span>
              ) : supplierAccount?.availableCredit ? (
                <span className="font-medium text-green-400">
                  Supplier owes you: GHS {money(supplierAccount.availableCredit)}
                </span>
              ) : (
                <span className="text-slate-400">Supplier account settled</span>
              )
            ) : null}
          </div>

          {form.supplier_id && supplierAccount && (
            <div
              className={`mt-4 rounded-lg border p-3 text-sm ${
                supplierAccount.netPayable > 0
                  ? "border-red-500/25 bg-red-500/10 text-red-200"
                  : supplierAccount.availableCredit > 0
                    ? "border-green-500/25 bg-green-500/10 text-green-200"
                    : "border-slate-700 bg-slate-800/60 text-slate-300"
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  {supplierAccount.netPayable > 0 && (
                    <span>
                      Outstanding supplier balance:{" "}
                      <span className="font-semibold">GHS {money(supplierAccount.netPayable)}</span>
                    </span>
                  )}

                  {supplierAccount.availableCredit > 0 && (
                    <span>
                      Usable supplier credit:{" "}
                      <span className="font-semibold">
                        GHS {money(supplierAccount.availableCredit)}
                      </span>
                    </span>
                  )}

                  {supplierAccount.netPayable === 0 && supplierAccount.availableCredit === 0 && (
                    <span>Supplier account is currently balanced.</span>
                  )}
                </div>

                <BalanceBreakdownTooltip
                  openingBalance={supplierBreakdown.openingBalance}
                  purchases={supplierBreakdown.purchases}
                  payments={supplierBreakdown.payments}
                  overpaymentCredits={supplierBreakdown.overpaymentCredits}
                  unallocatedPayments={supplierBreakdown.unallocatedPayments}
                  creditsApplied={supplierBreakdown.creditsApplied}
                  netPayable={supplierBreakdown.netPayable}
                  availableCredit={supplierBreakdown.availableCredit}
                  money={money}
                  label="View balance breakdown"
                />
              </div>
            </div>
          )}

          {form.supplier_id && supplierAccount && (
            <div className="mt-4 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4 text-sm shadow-sm">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-cyan-100">Smart Supplier Credit Preview</p>
                  <p className="text-xs text-cyan-200/80">
                    See how available supplier credit can reduce this purchase automatically.
                  </p>
                </div>

                <BalanceBreakdownTooltip
                  openingBalance={supplierBreakdown.openingBalance}
                  purchases={supplierBreakdown.purchases}
                  payments={supplierBreakdown.payments}
                  overpaymentCredits={supplierBreakdown.overpaymentCredits}
                  unallocatedPayments={supplierBreakdown.unallocatedPayments}
                  creditsApplied={supplierBreakdown.creditsApplied}
                  netPayable={supplierBreakdown.netPayable}
                  availableCredit={supplierBreakdown.availableCredit}
                  money={money}
                  label="How credit was built"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-slate-400">Available Supplier Credit</p>
                  <p className="font-semibold text-cyan-300">
                    GHS {money(smartOffsetPreview.availableCredit)}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Purchase Total</p>
                  <p className="font-semibold text-white">GHS {money(smartOffsetPreview.total)}</p>
                </div>

                <div>
                  <p className="text-slate-400">Credit To Use</p>
                  <p className="font-semibold text-emerald-300">
                    GHS {money(smartOffsetPreview.creditToUse)}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Balance Left After Using Credit</p>
                  <p className="font-semibold text-amber-300">
                    GHS {money(smartOffsetPreview.balanceLeft)}
                  </p>
                </div>
              </div>

              {smartOffsetPreview.total <= 0 ? (
                <p className="mt-3 text-xs text-slate-300">
                  Supplier credit will apply automatically once this purchase total is greater than
                  GHS 0.00.
                </p>
              ) : smartOffsetPreview.creditToUse > 0 ? (
                <p className="mt-3 text-xs text-cyan-100">
                  This purchase will use GHS {money(smartOffsetPreview.creditToUse)} from supplier
                  credit automatically.
                </p>
              ) : (
                <p className="mt-3 text-xs text-slate-300">
                  No supplier credit will be used for this purchase.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-white">Purchase Items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <PurchaseItemsTable
            rows={rows}
            products={products}
            loadingProducts={loadingProducts}
            onChangeRow={handleChangeRow}
            onRemoveRow={handleRemoveRow}
            onAddRow={handleAddRow}
          />
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-white">Totals & Payment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label className="text-slate-200">Subtotal</Label>
              <Input
                value={`GHS ${money(totals.subtotal)}`}
                readOnly
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Discount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.discount_amount}
                onChange={(e) => setForm((prev) => ({ ...prev, discount_amount: e.target.value }))}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Tax</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.tax_amount}
                onChange={(e) => setForm((prev) => ({ ...prev, tax_amount: e.target.value }))}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Other Charges</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.other_charges}
                onChange={(e) => setForm((prev) => ({ ...prev, other_charges: e.target.value }))}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Total Amount</Label>
              <Input
                value={`GHS ${money(totals.totalAmount)}`}
                readOnly
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Cash Paid Now</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount_paid}
                onChange={(e) => setForm((prev) => ({ ...prev, amount_paid: e.target.value }))}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Supplier Credit Applied</Label>
              <Input
                value={`GHS ${money(totals.supplierCreditApplied)}`}
                readOnly
                className="border-slate-600 bg-slate-800 text-green-300"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Applied to Purchase</Label>
              <Input
                value={`GHS ${money(totals.effectivePaidAmount)}`}
                readOnly
                className="border-slate-600 bg-slate-800 text-emerald-300"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Balance Due</Label>
              <Input
                value={`GHS ${money(totals.balanceDue)}`}
                readOnly
                className="border-slate-600 bg-slate-800 text-amber-300"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Overpayment</Label>
              <Input
                value={`GHS ${money(totals.overpaymentAmount)}`}
                readOnly
                className="border-slate-600 bg-slate-800 text-cyan-300"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Payment Status</Label>
              <Input
                value={totals.paymentStatus}
                readOnly
                className="border-slate-600 bg-slate-800 text-white capitalize"
              />
            </div>
          </div>

          {totals.supplierCreditApplied > 0 && (
            <div className="mt-4 rounded-lg border border-green-500/25 bg-green-500/10 p-3 text-sm text-green-200">
              Supplier credit auto-applied:
              <span className="ml-1 font-semibold">GHS {money(totals.supplierCreditApplied)}</span>
            </div>
          )}

          {totals.overpaymentAmount > 0 && (
            <div className="mt-4 rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3 text-sm text-cyan-200">
              You are paying more than the remaining amount after supplier credit. Extra amount
              recorded as overpayment:
              <span className="ml-1 font-semibold">GHS {money(totals.overpaymentAmount)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
