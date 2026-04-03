import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SimpleInfoRow from "@/features/reports/components/SimpleInfoRow";
import { CURRENCY, money } from "@/features/reports/helpers";
import type { ProductStockRow, SalesSummary } from "@/features/reports/types";

type Props = {
  salesSummary: SalesSummary;
  totalStockUnits: number;
  totalProductsCount: number;
  lowStockProducts: ProductStockRow[];
  financialPositionAssets: number;
  financialPositionLiabilities: number;
  financialPositionNet: number;
  expectedCashForClosing: number;
};

export default function FinancialPositionSection({
  salesSummary,
  totalStockUnits,
  totalProductsCount,
  lowStockProducts,
  financialPositionAssets,
  financialPositionLiabilities,
  financialPositionNet,
  expectedCashForClosing,
}: Props) {
  return (
    <div className="space-y-6">
      {/* TOP SUMMARY */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-300">
              {CURRENCY} {money(financialPositionAssets)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400">Supplier Payables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-300">
              {CURRENCY} {money(financialPositionLiabilities)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400">Net Position</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-300">
              {CURRENCY} {money(financialPositionNet)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BREAKDOWN */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ASSETS */}
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="text-white">Assets Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <SimpleInfoRow
              label="Cash (Expected Drawer)"
              value={`${CURRENCY} ${money(expectedCashForClosing)}`}
              valueClassName="text-cyan-300"
            />
            <SimpleInfoRow
              label="MoMo Wallet"
              value={`${CURRENCY} ${money(salesSummary.momoWalletPosition)}`}
              valueClassName="text-emerald-300"
            />
            <SimpleInfoRow
              label="Bank / Card"
              value={`${CURRENCY} ${money(salesSummary.bankCardPosition)}`}
              valueClassName="text-blue-300"
            />
            <SimpleInfoRow
              label="Customer Receivables"
              value={`${CURRENCY} ${money(salesSummary.totalCustomerDebt)}`}
              valueClassName="text-yellow-300"
            />
            <SimpleInfoRow
              label="Inventory Value"
              value={`${CURRENCY} ${money(salesSummary.inventoryValue)}`}
              valueClassName="text-violet-300"
            />
          </CardContent>
        </Card>

        {/* LIABILITIES */}
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="text-white">Liabilities Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <SimpleInfoRow
              label="Supplier Payables"
              value={`${CURRENCY} ${money(financialPositionLiabilities)}`}
              valueClassName="text-red-300"
            />

            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-xs text-slate-400">
              Supplier payables represent unpaid balances from recorded purchases.
              These are real obligations your business owes suppliers.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* INVENTORY SNAPSHOT */}
      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader>
          <CardTitle className="text-white">Inventory Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <SimpleInfoRow label="Total Products" value={totalProductsCount} />
          <SimpleInfoRow label="Total Units in Stock" value={totalStockUnits} />

          {lowStockProducts.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <p className="mb-2 font-medium text-red-300">Low Stock Items</p>
              <div className="space-y-1 text-xs text-slate-300">
                {lowStockProducts.slice(0, 5).map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-red-300">{p.quantity_in_stock}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* EXPLANATION */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-300">
        <p className="font-medium text-white">Financial Position Insight</p>
        <p className="mt-2 text-slate-400">
          Net Position = Total Assets − Supplier Payables. This gives a realistic
          picture of how financially strong the business is after accounting for
          obligations to suppliers.
        </p>
      </div>
    </div>
  );
}