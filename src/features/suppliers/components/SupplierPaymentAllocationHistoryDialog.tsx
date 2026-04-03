import { useEffect, useState } from "react";

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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
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

export default function SupplierPaymentAllocationHistoryDialog({
  open,
  onOpenChange,
  paymentId,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-700 bg-slate-900 text-white sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Payment Allocation History</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-slate-700 bg-slate-950/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-900">
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                    Purchase Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                    Invoice / Ref
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">
                    Purchase Total
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">
                    Allocated
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                    Notes
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                    Allocated At
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.allocation_id}
                    className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/50"
                  >
                    <td className="px-4 py-3 text-sm text-slate-200">
                      {formatDisplayDate(row.purchase_date)}
                    </td>

                    <td className="px-4 py-3 text-sm text-white">
                      {row.invoice_number || row.reference_number || "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-sm text-cyan-300">
                      GHS {money(row.purchase_total_amount)}
                    </td>

                    <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-300">
                      GHS {money(row.allocated_amount)}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-300">
                      {row.notes || "-"}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-200">
                      {formatDisplayDateTime(row.created_at)}
                    </td>
                  </tr>
                ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No allocation history found for this payment
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Loading allocation history...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}