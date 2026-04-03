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
import {
    allocateCustomerPaymentToSale,
    autoAllocateCustomerPayment,
    fetchOpenCustomerSales,
    type CustomerOpenSaleOption,
} from "@/features/customers/services_customer_payment_allocations";
import { money } from "@/features/suppliers/helpers";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
  customerId: string | null;
  customerName: string;
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

export default function CustomerPaymentAllocationDialog({
  open,
  onOpenChange,
  paymentId,
  customerId,
  customerName,
  unallocatedAmount,
  onSuccess,
}: Props) {
  const { toast } = useToast();

  const [loadingSales, setLoadingSales] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoAllocating, setAutoAllocating] = useState(false);
  const [sales, setSales] = useState<CustomerOpenSaleOption[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open || !customerId) return;

    let active = true;

    const run = async () => {
      setLoadingSales(true);
      try {
        const rows = await fetchOpenCustomerSales(customerId);
        if (!active) return;
        setSales(rows);
      } catch (e: any) {
        if (!active) return;
        toast({
          title: "Load failed",
          description: e?.message || "Could not load open sales.",
          variant: "destructive",
        });
      } finally {
        if (active) setLoadingSales(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [open, customerId, toast]);

  useEffect(() => {
    if (!open) {
      setSelectedSaleId("");
      setAmount("");
      setNotes("");
      setSales([]);
      setLoadingSales(false);
      setSaving(false);
      setAutoAllocating(false);
    }
  }, [open]);

  const selectedSale = useMemo(
    () => sales.find((item) => item.sale_id === selectedSaleId) ?? null,
    [sales, selectedSaleId]
  );

  const maxAllocatable = useMemo(() => {
    const saleDue = selectedSale?.balance_due ?? 0;
    return Math.min(Number(unallocatedAmount || 0), Number(saleDue || 0));
  }, [selectedSale, unallocatedAmount]);

  useEffect(() => {
    if (selectedSale && !amount && maxAllocatable > 0) {
      setAmount(String(maxAllocatable));
    }
  }, [selectedSale, maxAllocatable, amount]);

  const handleAutoAllocate = async () => {
    if (!paymentId) {
      toast({
        title: "Missing payment",
        description: "No payment was selected.",
        variant: "destructive",
      });
      return;
    }

    setAutoAllocating(true);
    try {
      const result = await autoAllocateCustomerPayment(paymentId);

      toast({
        title: "Auto allocation complete",
        description:
          result.message ||
          `Allocated GHS ${money(result.allocated_now)} automatically.`,
      });

      onOpenChange(false);

      if (onSuccess) {
        await onSuccess();
      }
    } catch (e: any) {
      toast({
        title: "Auto allocation failed",
        description: e?.message || "Could not auto allocate this payment.",
        variant: "destructive",
      });
    } finally {
      setAutoAllocating(false);
    }
  };

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

    if (!customerId) {
      toast({
        title: "Missing customer",
        description: "No customer was selected.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedSaleId) {
      toast({
        title: "Select sale",
        description: "Please choose a sale to allocate this payment to.",
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
      await allocateCustomerPaymentToSale({
        paymentId,
        saleId: selectedSaleId,
        amount: parsedAmount,
        notes: notes.trim() || null,
      });

      toast({
        title: "Allocation saved",
        description: "Customer payment allocated successfully.",
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
          <DialogTitle>Allocate Customer Payment</DialogTitle>
          <DialogDescription className="text-slate-400">
            Apply this customer payment to one unpaid sale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 rounded-lg border border-slate-700 bg-slate-950/70 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Customer
              </p>
              <p className="mt-1 text-sm font-medium text-white">
                {customerName || "-"}
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
            <Label className="text-slate-200">Choose Sale</Label>
            <Select
              value={selectedSaleId}
              onValueChange={setSelectedSaleId}
              disabled={loadingSales || sales.length === 0}
            >
              <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                <SelectValue
                  placeholder={
                    loadingSales
                      ? "Loading open sales..."
                      : sales.length === 0
                      ? "No open sales found"
                      : "Select sale"
                  }
                />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-white">
                {sales.map((sale) => {
                  const label = sale.receipt_number || sale.sale_id;

                  return (
                    <SelectItem key={sale.sale_id} value={sale.sale_id}>
                      {`${formatDisplayDate(sale.created_at)} • ${label} • Due: GHS ${money(
                        sale.balance_due
                      )}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedSale && (
            <div className="grid gap-4 rounded-lg border border-slate-700 bg-slate-950/70 p-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Sale Date
                </p>
                <p className="mt-1 text-sm text-white">
                  {formatDisplayDate(selectedSale.created_at)}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Receipt
                </p>
                <p className="mt-1 text-sm text-white">
                  {selectedSale.receipt_number || "-"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Balance Due
                </p>
                <p className="mt-1 text-sm font-semibold text-cyan-300">
                  GHS {money(selectedSale.balance_due)}
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
              {selectedSale && (
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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-500 bg-slate-950 text-white hover:bg-slate-800"
              disabled={saving || autoAllocating}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={handleAutoAllocate}
              disabled={autoAllocating || saving || !paymentId}
            >
              {autoAllocating ? "Auto Allocating..." : "Auto Allocate"}
            </Button>

            <Button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                autoAllocating ||
                loadingSales ||
                !selectedSaleId ||
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