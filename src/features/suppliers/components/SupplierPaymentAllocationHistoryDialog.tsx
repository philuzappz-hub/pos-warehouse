import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/features/suppliers/helpers";
import {
  fetchSupplierPaymentAllocations,
  type SupplierPaymentAllocationRow,
} from "@/features/suppliers/services_payment_allocations";
import { useToast } from "@/hooks/use-toast";

type PaymentSummary = {
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  allocation_status: string | null;
  payment_date?: string | null;
  payment_method?: string | null;
  reference_number?: string | null;
  supplier_name?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
  paymentSummary?: PaymentSummary | null;
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

function formatDisplayDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function SupplierPaymentAllocationHistoryDialog({
  open,
  onOpenChange,
  paymentId,
  paymentSummary,
}: Props) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SupplierPaymentAllocationRow[]>([]);

  useEffect(() => {
    if (!open || !paymentId) return;

    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const data = await fetchSupplierPaymentAllocations(paymentId);
        if (!active) return;
        setRows(data);
      } catch (e: any) {
        if (!active) return;
        toast({
          title: "Load failed",
          description: e?.message || "Could not load allocation history.",
          variant: "destructive",
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [open, paymentId, toast]);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setLoading(false);
    }
  }, [open]);

  const totalAllocatedInRows = useMemo(
    () => rows.reduce((sum, row) => sum + toNumber(row.allocated_amount), 0),
    [rows]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-700 bg-slate-950 text-white sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Allocation Log</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {paymentSummary ? (
            <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4 md:grid-cols-4 xl:grid-cols-8">
              <div>
                <p className="text-xs text-slate-400">Payment Amount</p>
                <p className="font-semibold text-emerald-300">
                  GHS {money(paymentSummary.amount)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Allocated</p>
                <p className="font-semibold text-cyan-300">
                  GHS {money(paymentSummary.allocated_amount)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Unallocated</p>
                <p className="font-semibold text-amber-300">
                  GHS {money(paymentSummary.unallocated_amount)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Status</p>
                <p className="font-semibold text-white">
                  {paymentSummary.allocation_status || "-"}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Payment Date</p>
                <p className="font-semibold text-white">
                  {formatDisplayDate(paymentSummary.payment_date)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Method</p>
                <p className="font-semibold text-white">
                  {paymentSummary.payment_method || "-"}
                </p>
              </div>

              <div className="xl:col-span-2">
                <p className="text-xs text-slate-400">Reference</p>
                <p className="font-semibold text-white">
                  {paymentSummary.reference_number || "-"}
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-700 bg-slate-950/70">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead className="bg-slate-900">
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                      Purchase Date
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                      Order ID
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-white">
                      Purchase Total
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-white">
                      Allocated
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-white">
                      Remaining
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                      Notes
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                      Allocated At
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-white">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => {
                    const remaining = Math.max(
                      0,
                      toNumber(row.purchase_total_amount) - toNumber(row.allocated_amount)
                    );

                    return (
                      <tr
                        key={row.allocation_id}
                        className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/50"
                      >
                        <td className="px-4 py-3 text-sm text-slate-200">
                          {formatDisplayDate(row.purchase_date)}
                        </td>

                        <td className="px-4 py-3 text-sm font-medium text-white">
                          {row.invoice_number || row.purchase_id}
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-300">
                          {row.reference_number || "-"}
                        </td>

                        <td className="px-4 py-3 text-right text-sm text-cyan-300">
                          GHS {money(row.purchase_total_amount)}
                        </td>

                        <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-300">
                          GHS {money(row.allocated_amount)}
                        </td>

                        <td className="px-4 py-3 text-right text-sm font-semibold text-amber-300">
                          GHS {money(remaining)}
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-300">
                          {row.notes || "-"}
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-200">
                          {formatDisplayDateTime(row.created_at)}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/purchases/${row.purchase_id}`}>View Purchase</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">
                        No allocation history found for this payment.
                      </td>
                    </tr>
                  )}

                  {loading && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">
                        Loading allocation history...
                      </td>
                    </tr>
                  )}
                </tbody>

                {!loading && rows.length > 0 && (
                  <tfoot className="bg-slate-900/95">
                    <tr className="border-t border-slate-700">
                      <td colSpan={4} className="px-4 py-3 text-left text-sm font-semibold text-white">
                        Total Allocated in This Log
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-emerald-300">
                        GHS {money(totalAllocatedInRows)}
                      </td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}