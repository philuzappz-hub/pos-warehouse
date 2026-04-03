import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import MetricCard from "@/features/reports/components/MetricCard";
import { CURRENCY, money } from "@/features/reports/helpers";
import type {
  AttendanceSummary,
  BranchCompareRow,
  ProductStockRow,
  SalesSummary,
  TopProduct,
} from "@/features/reports/types";
import { Package, TrendingUp } from "lucide-react";

type Props = {
  scopedBranchId: string | null;
  compareLoading: boolean;
  compareRows: BranchCompareRow[];
  onRefreshComparison: () => void;
  topProducts: TopProduct[];
  lowStockProducts: ProductStockRow[];
  inventoryValuationBasis: string;
  attendanceSummary: AttendanceSummary;
  salesSummary: SalesSummary;
};

export default function FinancialReportSection({
  scopedBranchId,
  compareLoading,
  compareRows,
  onRefreshComparison,
  topProducts,
  lowStockProducts,
  inventoryValuationBasis,
  attendanceSummary,
  salesSummary,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Gross Revenue" value={`${CURRENCY} ${money(salesSummary.totalAmount)}`} />
        <MetricCard
          title="Gross Profit"
          value={`${CURRENCY} ${money(salesSummary.grossProfit)}`}
          valueClassName="text-emerald-300"
        />
        <MetricCard
          title="Operating Profit"
          value={`${CURRENCY} ${money(salesSummary.operatingProfit)}`}
          valueClassName="text-cyan-300"
        />
        <MetricCard
          title="Inventory Value"
          value={`${CURRENCY} ${money(salesSummary.inventoryValue)}`}
          valueClassName="text-violet-300"
        />
        <MetricCard
          title="Outstanding Debt"
          value={`${CURRENCY} ${money(salesSummary.outstandingDebt)}`}
          valueClassName="text-yellow-300"
        />
        <MetricCard
          title="Supplier Payables"
          value={`${CURRENCY} ${money(salesSummary.supplierPayables)}`}
          valueClassName="text-red-300"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Total Paid" value={`${CURRENCY} ${money(salesSummary.totalPaidAmount)}`} />
        <MetricCard
          title="Cash Collected"
          value={`${CURRENCY} ${money(salesSummary.cashCollectedAmount)}`}
        />
        <MetricCard
          title="MoMo Wallet"
          value={`${CURRENCY} ${money(salesSummary.momoWalletPosition)}`}
          valueClassName="text-emerald-300"
        />
        <MetricCard
          title="Bank / Card"
          value={`${CURRENCY} ${money(salesSummary.bankCardPosition)}`}
          valueClassName="text-blue-300"
        />
        <MetricCard
          title="Net Cash Position"
          value={`${CURRENCY} ${money(salesSummary.netCashPosition)}`}
          valueClassName="text-cyan-300"
        />
        <MetricCard
          title="Net After Deductions"
          value={`${CURRENCY} ${money(salesSummary.netAfterDeductions)}`}
          valueClassName="text-white"
        />
      </div>

      {!scopedBranchId && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <TrendingUp className="h-5 w-5" />
              Branch Comparison
            </CardTitle>
            <Button variant="outline" onClick={onRefreshComparison} disabled={compareLoading}>
              {compareLoading ? "Loading..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Branch</TableHead>
                  <TableHead className="text-right text-slate-400">Sales</TableHead>
                  <TableHead className="text-right text-slate-400">Revenue</TableHead>
                  <TableHead className="text-right text-slate-400">Paid</TableHead>
                  <TableHead className="text-right text-slate-400">Debt</TableHead>
                  <TableHead className="text-right text-slate-400">Deductions</TableHead>
                  <TableHead className="text-right text-slate-400">Net Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compareRows.map((r) => (
                  <TableRow key={r.branch_id} className="border-slate-700">
                    <TableCell className="text-white">{r.branch_name}</TableCell>
                    <TableCell className="text-right text-slate-300">{r.total_sales}</TableCell>
                    <TableCell className="text-right text-slate-300">
                      {CURRENCY} {money(r.total_revenue)}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {CURRENCY} {money(r.total_paid)}
                    </TableCell>
                    <TableCell className="text-right text-yellow-300">
                      {CURRENCY} {money(r.outstanding_debt)}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {CURRENCY} {money(r.total_deductions)}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {CURRENCY} {money(r.net_collected_after_deductions)}
                    </TableCell>
                  </TableRow>
                ))}

                {compareRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-slate-400">
                      No data available for selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <TrendingUp className="h-5 w-5" />
              Top Selling Products (Selected period)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-right text-slate-400">Qty Sold</TableHead>
                  <TableHead className="text-right text-slate-400">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((product, idx) => (
                  <TableRow key={idx} className="border-slate-700">
                    <TableCell className="text-white">{product.name}</TableCell>
                    <TableCell className="text-right text-slate-300">{product.total_qty}</TableCell>
                    <TableCell className="text-right text-slate-300">
                      {CURRENCY} {money(product.total_revenue)}
                    </TableCell>
                  </TableRow>
                ))}

                {topProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-slate-400">
                      No sales data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Package className="h-5 w-5 text-red-500" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-right text-slate-400">In Stock</TableHead>
                  <TableHead className="text-right text-slate-400">Reorder At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockProducts.map((product, idx) => (
                  <TableRow key={idx} className="border-slate-700">
                    <TableCell className="text-white">{product.name}</TableCell>
                    <TableCell className="text-right font-medium text-red-400">
                      {product.quantity_in_stock}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {product.reorder_level || 10}
                    </TableCell>
                  </TableRow>
                ))}

                {lowStockProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-slate-400">
                      All products are well stocked
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-300">
        <p className="font-medium text-white">Accounting note</p>
        <p className="mt-2 text-slate-400">
          Inventory value uses <span className="text-white">{inventoryValuationBasis}</span>. For best
          accounting accuracy, keep product cost fields updated so profit and stock value remain reliable.
        </p>
        <p className="mt-2 text-slate-400">
          Supplier Payables reflects unpaid purchase balances and should be monitored alongside customer
          receivables for a clearer view of working capital.
        </p>
      </div>

      <div className="text-sm text-slate-500">
        Attendance today:{" "}
        <span className="font-medium text-slate-300">
          {attendanceSummary.present_today}/{attendanceSummary.total_staff}
        </span>{" "}
        staff present.
      </div>
    </div>
  );
}