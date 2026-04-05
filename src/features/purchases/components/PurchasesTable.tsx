import { Button } from "@/components/ui/button";
import { money } from "@/features/purchases/helpers";
import type { PurchaseRow } from "@/features/purchases/types";
import type { BranchRow } from "@/features/reports/types";
import { Link } from "react-router-dom";

type Props = {
  purchases: PurchaseRow[];
  branches: BranchRow[];
};

export default function PurchasesTable({ purchases, branches }: Props) {
  const getBranchName = (branchId: string) => {
    return branches.find((b) => b.id === branchId)?.name || "Unknown branch";
  };

  const getPaymentBadgeClass = (status: string) => {
    if (status === "paid") return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30";
    if (status === "partial") return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30";
    return "bg-red-500/15 text-red-300 ring-1 ring-red-500/30";
  };

  const getStockBadgeClass = (status: string) => {
    if (status === "received") return "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30";
    if (status === "draft") return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30";
    return "bg-red-500/15 text-red-300 ring-1 ring-red-500/30";
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-600 bg-slate-900 shadow-sm">
      <table className="w-full min-w-[1400px]">
        <thead className="bg-slate-800">
          <tr className="border-b border-slate-700">
            <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">Date</th>
            <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">Supplier</th>
            <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">Invoice</th>
            <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">Reference</th>
            <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">Branch</th>
            <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">Total</th>
            <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">Paid</th>
            <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">Balance</th>
            <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">Overpay</th>
            <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">Payment</th>
            <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">Stock</th>
            <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">Actions</th>
          </tr>
        </thead>

        <tbody>
          {purchases.map((purchase) => {
            const canPay =
              purchase.payment_status !== "paid" && Number(purchase.balance_due || 0) > 0;

            return (
              <tr
                key={purchase.id}
                className="border-b border-slate-700 last:border-b-0 hover:bg-slate-800/60"
              >
                <td className="px-3 py-3 text-slate-200">{purchase.purchase_date}</td>

                <td className="px-3 py-3 text-white">
                  <div className="font-semibold">{purchase.supplier?.name || "-"}</div>
                  {purchase.supplier?.supplier_code ? (
                    <div className="text-xs text-slate-400">{purchase.supplier.supplier_code}</div>
                  ) : null}
                </td>

                <td className="px-3 py-3 text-slate-200">{purchase.invoice_number || "-"}</td>
                <td className="px-3 py-3 text-slate-200">{purchase.reference_number || "-"}</td>
                <td className="px-3 py-3 text-slate-200">{getBranchName(purchase.branch_id)}</td>

                <td className="px-3 py-3 text-right text-slate-100">
                  GHS {money(purchase.total_amount)}
                </td>

                <td className="px-3 py-3 text-right text-emerald-300">
                  GHS {money(purchase.amount_paid)}
                </td>

                <td className="px-3 py-3 text-right text-amber-300">
                  GHS {money(purchase.balance_due)}
                </td>

                <td className="px-3 py-3 text-right text-cyan-300">
                  GHS {money(purchase.overpayment_amount || 0)}
                </td>

                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getPaymentBadgeClass(
                      purchase.payment_status
                    )}`}
                  >
                    {purchase.payment_status}
                  </span>
                </td>

                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getStockBadgeClass(
                      purchase.stock_status
                    )}`}
                  >
                    {purchase.stock_status}
                  </span>
                </td>

                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/purchases/${purchase.id}`}>View Details</Link>
                    </Button>

                    {canPay && (
                      <Button asChild size="sm">
                        <Link
                          to={`/suppliers/payments?supplierId=${purchase.supplier_id}&purchaseId=${purchase.id}`}
                        >
                          Pay Order
                        </Link>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {purchases.length === 0 && (
            <tr>
              <td colSpan={12} className="py-8 text-center text-slate-300">
                No purchases found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}