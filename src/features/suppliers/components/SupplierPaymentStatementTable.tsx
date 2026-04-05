import { Button } from "@/components/ui/button";
import { money } from "@/features/suppliers/helpers";
import type { SupplierPaymentStatementRow } from "@/features/suppliers/services_payment_statement";

type Props = {
  rows: SupplierPaymentStatementRow[];
  totalAmount: number;
  onAutoAllocate?: (row: SupplierPaymentStatementRow) => void;
  onOpenAllocate?: (row: SupplierPaymentStatementRow) => void;
  onViewHistory?: (row: SupplierPaymentStatementRow) => void;
};

function methodBadgeClass(method: string | null) {
  const value = String(method || "").toLowerCase();

  if (value === "cash") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (value === "momo") return "bg-cyan-500/15 text-cyan-300 border-cyan-500/25";
  if (value === "bank transfer") {
    return "bg-violet-500/15 text-violet-300 border-violet-500/25";
  }
  if (value === "card") return "bg-amber-500/15 text-amber-300 border-amber-500/25";

  return "bg-slate-500/15 text-slate-300 border-slate-500/25";
}

function allocationStatusBadgeClass(status: string | null) {
  const value = String(status || "").toLowerCase();

  if (value === "fully_allocated") {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  }

  if (value === "partial") {
    return "bg-amber-500/15 text-amber-300 border-amber-500/25";
  }

  return "bg-slate-500/15 text-slate-300 border-slate-500/25";
}

function formatAllocationStatus(status: string | null) {
  const value = String(status || "").toLowerCase();

  if (value === "fully_allocated") return "Fully Allocated";
  if (value === "partial") return "Partially Allocated";
  return "Unallocated";
}

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

export default function SupplierPaymentStatementTable({
  rows,
  totalAmount,
  onAutoAllocate,
  onOpenAllocate,
  onViewHistory,
}: Props) {
  return (
    <table className="w-full min-w-[1600px]">
      <thead className="sticky top-0 z-10 bg-slate-900">
        <tr className="border-b border-slate-700">
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Date</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Supplier</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Branch</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Method</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Reference</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Purchase Link</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Notes</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-white">Amount</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-white">Allocated</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-white">Unallocated</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Status</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-white">Actions</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/50"
          >
            <td className="px-4 py-3 text-sm text-slate-200">
              {formatDisplayDate(row.payment_date)}
            </td>

            <td className="px-4 py-3 text-sm text-white">
              <div className="font-medium">{row.supplier_name}</div>
              <div className="text-xs text-slate-400">{row.supplier_code || "-"}</div>
            </td>

            <td className="px-4 py-3 text-sm text-slate-200">
              {row.branch_name || "Company-wide"}
            </td>

            <td className="px-4 py-3 text-sm">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${methodBadgeClass(
                  row.payment_method
                )}`}
              >
                {row.payment_method || "-"}
              </span>
            </td>

            <td className="px-4 py-3 text-sm text-slate-200">
              {row.reference_number || "-"}
            </td>

            <td className="px-4 py-3 text-sm text-slate-200">
              {row.purchase_reference || "General / Unallocated"}
            </td>

            <td className="px-4 py-3 text-sm text-slate-300">{row.notes || "-"}</td>

            <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-300">
              GHS {money(row.amount)}
            </td>

            <td
              className="px-4 py-3 text-right text-sm font-semibold text-cyan-300"
              title={`Allocated: GHS ${money(row.allocated_amount)} | Remaining: GHS ${money(
                row.unallocated_amount
              )}`}
            >
              GHS {money(row.allocated_amount)}
            </td>

            <td
              className="px-4 py-3 text-right text-sm font-semibold text-amber-300"
              title={`Allocated: GHS ${money(row.allocated_amount)} | Remaining: GHS ${money(
                row.unallocated_amount
              )}`}
            >
              GHS {money(row.unallocated_amount)}
            </td>

            <td className="px-4 py-3 text-sm">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${allocationStatusBadgeClass(
                  row.allocation_status
                )}`}
              >
                {formatAllocationStatus(row.allocation_status)}
              </span>
            </td>

            <td className="px-4 py-3 text-right">
              <div className="flex justify-end gap-2">
                {row.unallocated_amount > 0 && onAutoAllocate ? (
                  <Button size="sm" variant="outline" onClick={() => onAutoAllocate(row)}>
                    Auto Allocate
                  </Button>
                ) : null}

                {row.allocated_amount > 0 && onViewHistory ? (
                  <Button size="sm" variant="outline" onClick={() => onViewHistory(row)}>
                    Allocation Log
                  </Button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>

      <tfoot className="bg-slate-900/95">
        <tr className="border-t border-slate-700">
          <td colSpan={7} className="px-4 py-3 text-left text-sm font-semibold text-white">
            Totals
          </td>
          <td className="px-4 py-3 text-right text-sm font-bold text-emerald-300">
            GHS {money(totalAmount)}
          </td>
          <td className="px-4 py-3" />
          <td className="px-4 py-3" />
          <td className="px-4 py-3" />
          <td className="px-4 py-3" />
        </tr>
      </tfoot>
    </table>
  );
}