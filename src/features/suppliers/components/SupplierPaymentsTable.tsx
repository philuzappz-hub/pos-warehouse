import type { BranchRow } from "@/features/reports/types";
import { money } from "@/features/suppliers/helpers";
import type { SupplierPaymentRow } from "@/features/suppliers/types";

type Props = {
  payments: SupplierPaymentRow[];
  branches: BranchRow[];
};

export default function SupplierPaymentsTable({ payments, branches }: Props) {
  const getBranchName = (branchId: string) => {
    return branches.find((b) => b.id === branchId)?.name || "Unknown branch";
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full min-w-[1100px]">
        <thead className="bg-slate-800">
          <tr className="border-b border-slate-700">
            <th className="px-3 py-3 text-left text-sm font-medium text-slate-400">Date</th>
            <th className="px-3 py-3 text-left text-sm font-medium text-slate-400">Supplier</th>
            <th className="px-3 py-3 text-left text-sm font-medium text-slate-400">Branch</th>
            <th className="px-3 py-3 text-left text-sm font-medium text-slate-400">Method</th>
            <th className="px-3 py-3 text-left text-sm font-medium text-slate-400">Reference</th>
            <th className="px-3 py-3 text-left text-sm font-medium text-slate-400">Notes</th>
            <th className="px-3 py-3 text-right text-sm font-medium text-slate-400">Amount</th>
          </tr>
        </thead>

        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id} className="border-b border-slate-700 last:border-b-0">
              <td className="px-3 py-3 text-slate-300">{payment.payment_date}</td>
              <td className="px-3 py-3 text-white">
                <div className="font-medium">{payment.supplier?.name || "-"}</div>
                {payment.supplier?.supplier_code ? (
                  <div className="text-xs text-slate-500">{payment.supplier.supplier_code}</div>
                ) : null}
              </td>
              <td className="px-3 py-3 text-slate-300">{getBranchName(payment.branch_id)}</td>
              <td className="px-3 py-3 text-slate-300 capitalize">{payment.payment_method}</td>
              <td className="px-3 py-3 text-slate-300">{payment.reference_number || "-"}</td>
              <td className="px-3 py-3 text-slate-300">{payment.notes || "-"}</td>
              <td className="px-3 py-3 text-right font-medium text-emerald-300">
                GHS {money(payment.amount)}
              </td>
            </tr>
          ))}

          {payments.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-slate-400">
                No supplier payments found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}