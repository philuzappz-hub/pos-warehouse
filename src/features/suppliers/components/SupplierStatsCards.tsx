import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/features/suppliers/helpers";
import type { SupplierStats } from "@/features/suppliers/types";

type Props = {
  stats: SupplierStats;
};

export default function SupplierStatsCards({ stats }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-300">
            Total Suppliers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{stats.totalSuppliers}</div>
        </CardContent>
      </Card>

      <Card className="border-emerald-700/60 bg-slate-900 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-300">
            Active
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-emerald-400">
            {stats.activeSuppliers}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-700/60 bg-slate-900 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-300">
            Inactive
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-amber-400">
            {stats.inactiveSuppliers}
          </div>
        </CardContent>
      </Card>

      <Card className="border-cyan-700/60 bg-slate-900 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-300">
            Opening Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-cyan-400">
            GHS {money(stats.totalOpeningBalance)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}