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
} from "@/features/purchases/services";
import type {
  ProductOption,
  PurchaseFormValues,
  PurchaseItemFormRow,
  SupplierOption,
} from "@/features/purchases/types";
import { emptyPurchaseForm } from "@/features/purchases/types";
import type { BranchRow } from "@/features/reports/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from "react";

function generateOrderId(branchId?: string) {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  const branch = branchId ? branchId.replace(/-/g, "").slice(0, 4).toUpperCase() : "GEN";

  return `PO-${branch}-${yyyy}${mm}${dd}-${random}`;
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
    invoice_number: generateOrderId(activeBranchId || ""),
  });

  const [rows, setRows] = useState<PurchaseItemFormRow[]>([
    createEmptyPurchaseItemRow(),
  ]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const orderIdWasManuallyInitialized = useRef(false);

  const loadInitial = async () => {
    if (!companyId) return;

    const { supabase } = await import("@/integrations/supabase/client");

    const branchResponse = await supabase
      .from("branches")
      .select("id,name,address,phone,email,company_id,is_active")
      .eq("company_id", companyId)
      .order("name");

    const branchData = branchResponse.data as unknown as BranchRow[] | null;

    const [supplierRes, productRes] = await Promise.all([
      fetchPurchaseSuppliers(companyId),
      fetchPurchaseProducts({
        companyId,
        branchId: activeBranchId || null,
      }),
    ]);

    setBranches(branchData || []);
    setSuppliers(supplierRes);
    setProducts(productRes);
  };

  useEffect(() => {
    setLoading(true);
    loadInitial()
      .catch((e: any) =>
        toast({
          title: "Load failed",
          description: e?.message || "Could not load purchase setup data.",
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
  }, [companyId, activeBranchId, toast]);

  useEffect(() => {
    if (!companyId || !form.branch_id) {
      setProducts([]);
      return;
    }

    void (async () => {
      try {
        const rows = await fetchPurchaseProducts({
          companyId,
          branchId: form.branch_id || null,
        });
        setProducts(rows);
      } catch (e: any) {
        toast({
          title: "Products load failed",
          description: e?.message || "Could not load branch products.",
          variant: "destructive",
        });
      }
    })();
  }, [companyId, form.branch_id, toast]);

  useEffect(() => {
    if (!orderIdWasManuallyInitialized.current) {
      orderIdWasManuallyInitialized.current = true;
      return;
    }

    setForm((prev) => ({
      ...prev,
      invoice_number: generateOrderId(prev.branch_id),
    }));
  }, [form.branch_id]);

  const totals = useMemo(() => getPurchaseTotals(form, rows), [form, rows]);

  const handleSave = async () => {
    if (!companyId) {
      toast({
        title: "Missing company",
        description: "No company context found.",
        variant: "destructive",
      });
      return;
    }

    const error = validatePurchaseForm(form, rows);
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await createPurchaseWithItems({
        companyId,
        userId,
        form,
        rows,
      });

      toast({
        title: "Purchase order saved",
        description: "No payment was recorded. Use Supplier Payments to settle this order.",
      });

      setRows([createEmptyPurchaseItemRow()]);
      setForm({
        ...emptyPurchaseForm,
        branch_id: activeBranchId || "",
        invoice_number: generateOrderId(activeBranchId || ""),
      });
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save purchase order.",
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
          <h1 className="text-3xl font-bold text-white">Create Purchase Order</h1>
          <p className="text-slate-300">
            Create a supplier purchase order here. Payments are recorded later from the Supplier Payments page.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving || loading} className="w-full sm:w-auto">
          {saving ? "Saving..." : "Save Order"}
        </Button>
      </div>

      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-white">Order Header</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-slate-200">Supplier</Label>
            <Select
              value={form.supplier_id}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, supplier_id: value }))
              }
            >
              <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-white">
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
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, branch_id: value }))
              }
            >
              <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-white">
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Purchase Date</Label>
            <Input
              type="date"
              value={form.purchase_date}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, purchase_date: e.target.value }))
              }
              className="border-slate-600 bg-slate-800 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Order ID</Label>
            <Input
              value={form.invoice_number}
              readOnly
              className="border-slate-600 bg-slate-800 text-white font-semibold"
              placeholder="Auto-generated order ID"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Supplier Reference</Label>
            <Input
              value={form.reference_number}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, reference_number: e.target.value }))
              }
              className="border-slate-600 bg-slate-800 text-white"
              placeholder="Optional supplier reference"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Discount Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.discount_amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, discount_amount: e.target.value }))
              }
              className="border-slate-600 bg-slate-800 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Tax Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.tax_amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, tax_amount: e.target.value }))
              }
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
              onChange={(e) =>
                setForm((prev) => ({ ...prev, other_charges: e.target.value }))
              }
              className="border-slate-600 bg-slate-800 text-white"
            />
          </div>

          <div className="space-y-2 md:col-span-2 xl:col-span-3">
            <Label className="text-slate-200">Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              className="border-slate-600 bg-slate-800 text-white"
              placeholder="Optional notes about this order"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-white">Order Items</CardTitle>
        </CardHeader>

        <CardContent>
          <PurchaseItemsTable
            rows={rows}
            products={products}
            onChangeRow={(id, patch) =>
              setRows((current) =>
                current.map((row) => (row.rowId === id ? { ...row, ...patch } : row))
              )
            }
            onAddRow={() =>
              setRows((current) => [...current, createEmptyPurchaseItemRow()])
            }
            onRemoveRow={(id) =>
              setRows((current) => current.filter((row) => row.rowId !== id))
            }
          />
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-white">Order Totals</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-md bg-slate-800 p-3 text-white">
            <p className="text-sm text-slate-400">Subtotal</p>
            <p className="text-lg font-semibold">GHS {money(totals.subtotal)}</p>
          </div>

          <div className="rounded-md bg-slate-800 p-3 text-white">
            <p className="text-sm text-slate-400">Discount</p>
            <p className="text-lg font-semibold">GHS {money(totals.discountAmount)}</p>
          </div>

          <div className="rounded-md bg-slate-800 p-3 text-white">
            <p className="text-sm text-slate-400">Tax</p>
            <p className="text-lg font-semibold">GHS {money(totals.taxAmount)}</p>
          </div>

          <div className="rounded-md bg-slate-800 p-3 text-white">
            <p className="text-sm text-slate-400">Other Charges</p>
            <p className="text-lg font-semibold">GHS {money(totals.otherCharges)}</p>
          </div>

          <div className="rounded-md bg-slate-800 p-3 text-cyan-300">
            <p className="text-sm text-slate-400">Total Order Value</p>
            <p className="text-lg font-semibold">GHS {money(totals.totalAmount)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-700/40 bg-amber-500/10 shadow-sm">
        <CardContent className="pt-6 text-sm text-amber-100">
          This page creates the purchase order only. No payment, supplier credit application, or stock update happens here.
          Use <span className="font-semibold">Supplier Payments</span> to settle the order later.
        </CardContent>
      </Card>
    </div>
  );
}