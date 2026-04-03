import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MetricCard from "@/features/reports/components/MetricCard";
import SimpleInfoRow from "@/features/reports/components/SimpleInfoRow";
import { CURRENCY, money } from "@/features/reports/helpers";
import type { AttendanceSummary, SalesSummary } from "@/features/reports/types";
import { BarChart3 } from "lucide-react";

type Props = {
  scopeLabel: string;
  salesSummary: SalesSummary;
  inventoryValuationBasis: string;
  totalStockUnits: number;
  totalProductsCount: number;
  attendanceSummary: AttendanceSummary;
  paymentBreakdownLine: string;
  formulaLine: string;
  profitFormulaLine: string;
  expectedCashForClosing: number;
};

export default function OverviewSection({
  scopeLabel,
  salesSummary,
  inventoryValuationBasis,
  totalStockUnits,
  totalProductsCount,
  attendanceSummary,
  paymentBreakdownLine,
  formulaLine,
  profitFormulaLine,
  expectedCashForClosing,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Gross Revenue"
          value={`${CURRENCY} ${money(salesSummary.totalAmount)}`}
          subtitle={scopeLabel}
        />
        <MetricCard
          title="Operating Profit"
          value={`${CURRENCY} ${money(salesSummary.operatingProfit)}`}
          subtitle="Based on tracked cost, returns and expenses"
          valueClassName="text-emerald-300"
        />
        <MetricCard
          title="Expected Closing Cash"
          value={`${CURRENCY} ${money(expectedCashForClosing)}`}
          subtitle="Based on current cash drawer logic"
          valueClassName="text-cyan-300"
        />
        <MetricCard
          title="Inventory Value"
          value={`${CURRENCY} ${money(salesSummary.inventoryValue)}`}
          subtitle={inventoryValuationBasis}
          valueClassName="text-violet-300"
        />
        <MetricCard
          title="Supplier Payables"
          value={`${CURRENCY} ${money(salesSummary.supplierPayables)}`}
          subtitle="Unpaid purchase balances"
          valueClassName="text-red-300"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-700 bg-slate-800/50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <BarChart3 className="h-5 w-5" />
              Reports Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
              <p className="font-medium text-white">Payment Mix</p>
              <p className="mt-2 text-slate-400">{paymentBreakdownLine}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
              <p className="font-medium text-white">Cash Drawer Position</p>
              <p className="mt-2 text-slate-400">
                Expected Closing Cash = Opening Float + Cash Sales Received − Approved Cash Returns −
                Approved Cash Expenses
              </p>
              <p className="mt-2 text-slate-300">{formulaLine}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
              <p className="font-medium text-white">Profit Logic</p>
              <p className="mt-2 text-slate-400">{profitFormulaLine}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
              <p className="font-medium text-white">Payables Note</p>
              <p className="mt-2 text-slate-400">
                Supplier Payables shows the unpaid balances from recorded purchases. This now feeds
                directly into the Financial Position view as liabilities.
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
              <p className="font-medium text-white">Quick guidance</p>
              <p className="mt-2 text-slate-400">
                Use <span className="text-white">Financial Report</span> for revenue, profit, stock
                value and performance, <span className="text-white">Cash Reconciliation</span> for till
                balancing, and <span className="text-white">Financial Position</span> for a higher-level
                view of liquid funds, receivables, inventory and obligations.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="text-white">Quick Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <SimpleInfoRow
              label="Cash Received"
              value={`${CURRENCY} ${money(salesSummary.cashCollectedAmount)}`}
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
              label="Tracked Liquid Position"
              value={`${CURRENCY} ${money(salesSummary.totalTrackedLiquidPosition)}`}
              valueClassName="text-cyan-300"
            />
            <SimpleInfoRow
              label="Supplier Payables"
              value={`${CURRENCY} ${money(salesSummary.supplierPayables)}`}
              valueClassName="text-red-300"
            />
            <SimpleInfoRow label="Stock Units On Hand" value={totalStockUnits} />
            <SimpleInfoRow label="Products Tracked" value={totalProductsCount} />
            <SimpleInfoRow
              label="Staff Present Today"
              value={`${attendanceSummary.present_today}/${attendanceSummary.total_staff}`}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}