import { money } from "@/features/suppliers/helpers";
import type { SupplierStockStatementRow } from "@/features/suppliers/services_stock_statement";

type Props = {
  rows: SupplierStockStatementRow[];
  totalQuantity: number;
  totalValue: number;
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

export default function SupplierStockStatementTable({
  rows,
  totalQuantity,
  totalValue,
}: Props) {
  return (
    <table className="w-full min-w-[1300px]">
      <thead className="sticky top-0 z-10 bg-slate-900">
        <tr className="border-b border-slate-700">
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Date</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Supplier</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Branch</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Invoice / Ref</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Product</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-white">Quantity</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-white">Unit Cost</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-white">Discount</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-white">Line Total</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white">Stock Status</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <tr
            key={row.purchase_item_id}
            className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/50"
          >
            <td className="px-4 py-3 text-sm text-slate-200">
              {formatDisplayDate(row.purchase_date)}
            </td>

            <td className="px-4 py-3 text-sm text-white">
              <div className="font-medium">{row.supplier_name}</div>
              <div className="text-xs text-slate-400">{row.supplier_code || "-"}</div>
            </td>

            <td className="px-4 py-3 text-sm text-slate-200">
              {row.branch_name || "Company-wide"}
            </td>

            <td className="px-4 py-3 text-sm text-slate-200">
              {row.invoice_number || row.reference_number || "-"}
            </td>

            <td className="px-4 py-3 text-sm text-white">{row.product_name}</td>

            <td className="px-4 py-3 text-right text-sm text-slate-200">{row.quantity}</td>

            <td className="px-4 py-3 text-right text-sm text-cyan-300">
              GHS {money(row.unit_cost)}
            </td>

            <td className="px-4 py-3 text-right text-sm text-amber-300">
              GHS {money(row.line_discount)}
            </td>

            <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-300">
              GHS {money(row.line_total)}
            </td>

            <td className="px-4 py-3 text-sm text-slate-200">
              {row.stock_status || "-"}
            </td>
          </tr>
        ))}

        {rows.length === 0 && (
          <tr>
            <td colSpan={10} className="py-10 text-center text-slate-400">
              No records found for selected filters
            </td>
          </tr>
        )}
      </tbody>

      {rows.length > 0 && (
        <tfoot className="bg-slate-900/95">
          <tr className="border-t border-slate-700">
            <td
              colSpan={5}
              className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-white"
            >
              Totals
            </td>
            <td className="px-4 py-3 text-right text-sm font-bold text-cyan-300">
              {totalQuantity}
            </td>
            <td className="px-4 py-3" />
            <td className="px-4 py-3" />
            <td className="px-4 py-3 text-right text-sm font-bold text-emerald-300">
              GHS {money(totalValue)}
            </td>
            <td className="px-4 py-3" />
          </tr>
        </tfoot>
      )}
    </table>
  );
}