import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/features/purchases/helpers";
import type { PurchaseStats } from "@/features/purchases/types";

type Props = {
  stats: PurchaseStats;
};

export default function PurchaseStatsCards({ stats }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Total Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{stats.totalPurchases}</div>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Gross Order Value</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-cyan-300">
            GHS {money(stats.grossPurchases)}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Total Paid</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-300">
            GHS {money(stats.totalPaid)}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Outstanding Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-300">
            GHS {money(stats.totalOutstanding)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}