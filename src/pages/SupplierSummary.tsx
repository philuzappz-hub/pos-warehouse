import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/features/suppliers/helpers";
import {
  fetchSupplierAccountSnapshot,
  fetchSuppliers
} from "@/features/suppliers/services";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";

type DisplayRow = {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;

  balance_due: number;
  supplier_credit: number;

  cash_payments: number;
  credit_used: number;
  total_settled: number;
};

function num(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

export default function SupplierSummary() {
  const { profile, activeBranchId } = useAuth() as any;
  const { toast } = useToast();

  const companyId = profile?.company_id ?? null;

  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSummary = async () => {
    if (!companyId) return;

    setLoading(true);
    try {
      const suppliers = await fetchSuppliers({
        companyId,
        branchId: activeBranchId || null,
        includeAllBranches: true,
      });

      const results = await Promise.all(
        suppliers.map(async (supplier) => {
          const snapshot = await fetchSupplierAccountSnapshot({
            companyId,
            supplierId: supplier.id,
          });

          const totalPurchases = num(snapshot?.totalPurchases);
          const totalPayments = num(snapshot?.totalPayments);
          const creditUsed = num(snapshot?.totalCreditsApplied);
          const availableCredit = num(snapshot?.availableCredit);

          const totalSettled = roundMoney(totalPayments + creditUsed);
          const grossOutstanding = roundMoney(
            Math.max(totalPurchases - totalSettled, 0)
          );
          const balanceDue = roundMoney(
            Math.max(grossOutstanding - availableCredit, 0)
          );

          return {
            supplier_id: supplier.id,
            supplier_name: supplier.name,
            supplier_code: supplier.supplier_code || null,

            balance_due: balanceDue,
            supplier_credit: roundMoney(availableCredit),

            cash_payments: roundMoney(Math.max(totalPayments, 0)),
            credit_used: roundMoney(creditUsed),
            total_settled: roundMoney(totalSettled),
          };
        })
      );

      setRows(results);
    } catch (e: any) {
      toast({
        title: "Load failed",
        description: e?.message || "Could not load supplier summary.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, [companyId, activeBranchId]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalPayables += num(row.balance_due);
        acc.totalCredits += num(row.supplier_credit);
        acc.cashPayments += num(row.cash_payments);
        acc.creditUsed += num(row.credit_used);
        acc.totalSettled += num(row.total_settled);
        return acc;
      },
      {
        totalPayables: 0,
        totalCredits: 0,
        cashPayments: 0,
        creditUsed: 0,
        totalSettled: 0,
      }
    );
  }, [rows]);

  return (
    <div className="space-y-6 bg-slate-950 p-1">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Supplier Summary
        </h1>
        <p className="text-slate-300">
          Reconciled snapshot-driven supplier balances.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-red-500/35 bg-red-500/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">
              Total Payables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">
              GHS {money(totals.totalPayables)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/35 bg-green-500/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">
              Unused Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">
              GHS {money(totals.totalCredits)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-600 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">
              Cash Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-cyan-300">
              GHS {money(totals.cashPayments)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-600 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">
              Credit Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-sky-300">
              GHS {money(totals.creditUsed)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-600 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">
              Total Settled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-300">
              GHS {money(totals.totalSettled)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-600 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-2xl text-white">
            Supplier Summary
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-white">Supplier</th>
                  <th className="px-4 py-3 text-right text-white">Payable</th>
                  <th className="px-4 py-3 text-right text-white">Credit</th>
                  <th className="px-4 py-3 text-right text-white">Cash Payments</th>
                  <th className="px-4 py-3 text-right text-white">Credit Used</th>
                  <th className="px-4 py-3 text-right text-white">Total Settled</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.supplier_id} className="border-b border-slate-800">
                    <td className="px-4 py-3 text-white">
                      {r.supplier_name}
                    </td>

                    <td className="px-4 py-3 text-right text-red-400">
                      GHS {money(r.balance_due)}
                    </td>

                    <td className="px-4 py-3 text-right text-green-400">
                      GHS {money(r.supplier_credit)}
                    </td>

                    <td className="px-4 py-3 text-right text-cyan-300">
                      GHS {money(r.cash_payments)}
                    </td>

                    <td className="px-4 py-3 text-right text-sky-300">
                      GHS {money(r.credit_used)}
                    </td>

                    <td className="px-4 py-3 text-right text-emerald-300">
                      GHS {money(r.total_settled)}
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      {loading ? "Loading..." : "No data"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}