import { Button } from "@/components/ui/button";
import { money } from "@/features/suppliers/helpers";
import type { SupplierCreditNoteRow } from "@/features/suppliers/services_credit_notes";

type Props = {
  rows: SupplierCreditNoteRow[];
  onApply: (row: SupplierCreditNoteRow) => void;
};

function badgeClass(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "used") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (s === "partial") return "bg-amber-500/15 text-amber-300 border-amber-500/25";
  if (s === "cancelled") return "bg-red-500/15 text-red-300 border-red-500/25";
  return "bg-cyan-500/15 text-cyan-300 border-cyan-500/25";
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

export default function SupplierCreditNoteTable({ rows, onApply }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-600 bg-slate-900">
      <table className="w-full min-w-[1300px]">
        <thead className="bg-slate-800">
          <tr className="border-b border-slate-700">
            <th className="px-4 py-3 text-left text-sm font-semibold text-white">Date</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-white">Supplier</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-white">Branch</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-white">Reference</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-white">Reason</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-white">Amount</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-white">Used</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-white">Available</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-white">Status</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-white">Action</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/50">
              <td className="px-4 py-3 text-sm text-slate-200">
                {formatDisplayDate(row.credit_date)}
              </td>

              <td className="px-4 py-3 text-sm text-white">
                <div className="font-medium">{row.supplier_name || "-"}</div>
                <div className="text-xs text-slate-400">{row.supplier_code || "-"}</div>
              </td>

              <td className="px-4 py-3 text-sm text-slate-200">
                {row.branch_name || "Company-wide"}
              </td>

              <td className="px-4 py-3 text-sm text-slate-200">
                {row.reference_number || "-"}
              </td>

              <td className="px-4 py-3 text-sm text-slate-300">
                {row.reason || "-"}
              </td>

              <td className="px-4 py-3 text-right text-sm font-semibold text-cyan-300">
                GHS {money(row.amount)}
              </td>

              <td className="px-4 py-3 text-right text-sm font-semibold text-amber-300">
                GHS {money(row.used_amount || 0)}
              </td>

              <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-300">
                GHS {money(row.available_amount || 0)}
              </td>

              <td className="px-4 py-3 text-sm">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(row.status)}`}>
                  {row.status}
                </span>
              </td>

              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onApply(row)}
                  disabled={(row.available_amount || 0) <= 0 || row.status === "cancelled"}
                >
                  Apply
                </Button>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="py-10 text-center text-slate-400">
                No supplier credit notes found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}