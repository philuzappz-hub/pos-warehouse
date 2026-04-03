import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
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
import { money } from "@/features/suppliers/helpers";
import {
    allocateSupplierPaymentToPurchase,
    fetchOpenSupplierPurchases,
    type SupplierOpenPurchaseOption,
} from "@/features/suppliers/services_payment_allocations";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
  supplierId: string | null;
  supplierName: string;
  unallocatedAmount: number;
  onSuccess?: () => void | Promise<void>;
};

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function SupplierPaymentAllocationDialog({
  open,
  onOpenChange,
  paymentId,
  supplierId,
  supplierName,
  unallocatedAmount,
  onSuccess,
}: Props) {
  const { toast } = useToast();

  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [saving, setSaving] = useState(false);
  const [purchases, setPurchases] = useState<SupplierOpenPurchaseOption[]>([]);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open || !supplierId) return;

    let active = true;

    const run = async () => {
      setLoadingPurchases(true);
      try {
        const rows = await fetchOpenSupplierPurchases(supplierId);
        if (!active) return;
        setPurchases(rows);
      } catch (e: any) {
        if (!active) return;
        toast({
          title: "Load failed",
          description: e?.message || "Could not load open purchases.",
          variant: "destructive",
        });
      } finally {
        if (active) setLoadingPurchases(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [open, supplierId, toast]);

  useEffect(() => {
    if (!open) {
      setSelectedPurchaseId("");
      setAmount("");
      setNotes("");
      setPurchases([]);
      setLoadingPurchases(false);
      setSaving(false);
    }
  }, [open]);

  const selectedPurchase = useMemo(
    () => purchases.find((item) => item.purchase_id === selectedPurchaseId) ?? null,
    [purchases, selectedPurchaseId]
  );

  const maxAllocatable = useMemo(() => {
    const purchaseDue = selectedPurchase?.balance_due ?? 0;
    return Math.min(Number(unallocatedAmount || 0), Number(purchaseDue || 0));
  }, [selectedPurchase, unallocatedAmount]);

  useEffect(() => {
    if (selectedPurchase && !amount) {
      if (maxAllocatable > 0) {
        setAmount(String(maxAllocatable));
      }
    }
  }, [selectedPurchase, maxAllocatable, amount]);

  const handleSave = async () => {
    const parsedAmount = Number(amount);

    if (!paymentId) {
      toast({
        title: "Missing payment",
        description: "No payment was selected.",
        variant: "destructive",
      });
      return;
    }

    if (!supplierId) {
      toast({
        title: "Missing supplier",
        description: "No supplier was selected.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedPurchaseId) {
      toast({
        title: "Select purchase",
        description: "Please choose a purchase to allocate this payment to.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a valid allocation amount greater than zero.",
        variant: "destructive",
      });
      return;
    }

    if (parsedAmount > maxAllocatable) {
      toast({
        title: "Amount too high",
        description: `Maximum allowed for this allocation is GHS ${money(maxAllocatable)}.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await allocateSupplierPaymentToPurchase({
        paymentId,
        purchaseId: selectedPurchaseId,
        amount: parsedAmount,
        notes: notes.trim() || null,
      });

      toast({
        title: "Allocation saved",
        description: "Payment allocated successfully.",
      });

      onOpenChange(false);

      if (onSuccess) {
        await onSuccess();
      }
    } catch (e: any) {
      toast({
        title: "Allocation failed",
        description: e?.message || "Could not save allocation.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-700 bg-slate-900 text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Allocate Supplier Payment</DialogTitle>
          <DialogDescription className="text-slate-400">
            Apply this payment to one unpaid supplier purchase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 rounded-lg border border-slate-700 bg-slate-950/70 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Supplier
              </p>
              <p className="mt-1 text-sm font-medium text-white">
                {supplierName || "-"}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Unallocated Amount
              </p>
              <p className="mt-1 text-sm font-semibold text-amber-300">
                GHS {money(unallocatedAmount)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Choose Purchase</Label>
            <Select
              value={selectedPurchaseId}
              onValueChange={setSelectedPurchaseId}
              disabled={loadingPurchases || purchases.length === 0}
            >
              <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                <SelectValue
                  placeholder={
                    loadingPurchases
                      ? "Loading open purchases..."
                      : purchases.length === 0
                      ? "No open purchases found"
                      : "Select purchase"
                  }
                />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-white">
                {purchases.map((purchase) => {
                  const label =
                    purchase.invoice_number ||
                    purchase.reference_number ||
                    purchase.purchase_id;

                  return (
                    <SelectItem key={purchase.purchase_id} value={purchase.purchase_id}>
                      {`${formatDisplayDate(purchase.purchase_date)} • ${label} • Due: GHS ${money(
                        purchase.balance_due
                      )}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedPurchase && (
            <div className="grid gap-4 rounded-lg border border-slate-700 bg-slate-950/70 p-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Purchase Date
                </p>
                <p className="mt-1 text-sm text-white">
                  {formatDisplayDate(selectedPurchase.purchase_date)}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Purchase Ref
                </p>
                <p className="mt-1 text-sm text-white">
                  {selectedPurchase.invoice_number ||
                    selectedPurchase.reference_number ||
                    "-"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Balance Due
                </p>
                <p className="mt-1 text-sm font-semibold text-cyan-300">
                  GHS {money(selectedPurchase.balance_due)}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-200">Allocation Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="border-slate-500 bg-slate-950 text-white"
              />
              {selectedPurchase && (
                <p className="text-xs text-slate-400">
                  Max allowed now: GHS {money(maxAllocatable)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Notes (optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allocation note"
                className="border-slate-500 bg-slate-950 text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-500 bg-slate-950 text-white hover:bg-slate-800"
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                loadingPurchases ||
                !selectedPurchaseId ||
                !amount ||
                Number(amount) <= 0
              }
            >
              {saving ? "Saving..." : "Save Allocation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}