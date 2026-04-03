import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MetricCard from "@/features/reports/components/MetricCard";
import { CURRENCY, money } from "@/features/reports/helpers";
import type { CashReconciliationPreview, SalesSummary } from "@/features/reports/types";
import { Wallet } from "lucide-react";

type Props = {
  scopedBranchId: string | null;
  reconciliationDate: string;
  setReconciliationDate: (value: string) => void;
  openingFloat: string;
  setOpeningFloat: (value: string) => void;
  actualCashCounted: string;
  setActualCashCounted: (value: string) => void;
  reconciliationNotes: string;
  setReconciliationNotes: (value: string) => void;
  isReconLocked: boolean;
  existingReconciliationId: string | null;
  reconLoading: boolean;
  reconSaving: boolean;
  reconciliationStatusClasses: string;
  varianceLabel: string;
  salesSummary: SalesSummary;
  reconPreview: CashReconciliationPreview;
  openingFloatNum: number;
  expectedCashForClosing: number;
  actualCashCountedNum: number;
  reconciliationStatus: string;
  reconciliationShortAmount: number;
  reconciliationExcessAmount: number;
  paymentBreakdownLine: string;
  formulaLine: string;
  handleSaveReconciliation: () => void;
  loadExistingReconciliation: () => void;
  printClosingSlip: () => void;
};

export default function ReconciliationSection({
  scopedBranchId,
  reconciliationDate,
  setReconciliationDate,
  openingFloat,
  setOpeningFloat,
  actualCashCounted,
  setActualCashCounted,
  reconciliationNotes,
  setReconciliationNotes,
  isReconLocked,
  existingReconciliationId,
  reconLoading,
  reconSaving,
  reconciliationStatusClasses,
  varianceLabel,
  salesSummary,
  reconPreview,
  openingFloatNum,
  expectedCashForClosing,
  actualCashCountedNum,
  reconciliationStatus,
  reconciliationShortAmount,
  reconciliationExcessAmount,
  paymentBreakdownLine,
  formulaLine,
  handleSaveReconciliation,
  loadExistingReconciliation,
  printClosingSlip,
}: Props) {
  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-white">
          <Wallet className="h-5 w-5" />
          Daily Cash Reconciliation
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {!scopedBranchId ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-slate-300">
            Cash reconciliation is <span className="font-semibold text-white">branch-specific</span>.
            Please select one branch above.
          </div>
        ) : (
          <>
            {existingReconciliationId && isReconLocked && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-300">
                    Locked Closing Record
                  </span>
                  <span className="text-sm text-slate-300">
                    This reconciliation has already been closed and cannot be edited.
                  </span>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Reconciliation Date</Label>
                <Input
                  type="date"
                  value={reconciliationDate}
                  onChange={(e) => setReconciliationDate(e.target.value)}
                  className="border-slate-600 bg-slate-700 text-white"
                  disabled={isReconLocked}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Opening Float</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  className="border-slate-600 bg-slate-700 text-white"
                  disabled={isReconLocked}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Actual Cash Counted</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={actualCashCounted}
                  onChange={(e) => setActualCashCounted(e.target.value)}
                  className="border-slate-600 bg-slate-700 text-white"
                  disabled={isReconLocked}
                />
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <p className="text-[11px] text-slate-400">Status</p>
                <div
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-medium ${reconciliationStatusClasses}`}
                >
                  {varianceLabel}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Notes</Label>
              <Input
                value={reconciliationNotes}
                onChange={(e) => setReconciliationNotes(e.target.value)}
                className="border-slate-600 bg-slate-700 text-white"
                placeholder="Optional note about shortage, excess, or closing remarks"
                disabled={isReconLocked}
              />
            </div>

            <div className="space-y-4 rounded-xl border border-slate-700/80 bg-slate-900/20 p-4">
              <div>
                <p className="text-sm font-semibold text-white">Payment Breakdown</p>
                <p className="text-xs text-slate-400">
                  This shows how total paid is split across payment channels.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  title="Total Paid Received"
                  value={`${CURRENCY} ${money(salesSummary.totalPaidAmount)}`}
                />
                <MetricCard
                  title="Cash Received"
                  value={`${CURRENCY} ${money(salesSummary.cashCollectedAmount)}`}
                />
                <MetricCard
                  title="Momo Received"
                  value={`${CURRENCY} ${money(salesSummary.momoCollectedAmount)}`}
                  valueClassName="text-emerald-300"
                />
                <MetricCard
                  title="Card Received"
                  value={`${CURRENCY} ${money(salesSummary.cardCollectedAmount)}`}
                  valueClassName="text-blue-300"
                />
                <MetricCard
                  title="Total Non-Cash Received"
                  value={`${CURRENCY} ${money(salesSummary.nonCashCollectedAmount)}`}
                  valueClassName="text-violet-300"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-700/80 bg-slate-900/20 p-4">
              <div>
                <p className="text-sm font-semibold text-white">Cash Drawer Reconciliation</p>
                <p className="text-xs text-slate-400">
                  Only cash affects physical till reconciliation. Momo and card do not enter the drawer.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard title="Opening Float" value={`${CURRENCY} ${money(openingFloatNum)}`} />
                <MetricCard
                  title="Cash Sales Received"
                  value={`${CURRENCY} ${money(reconPreview.cashSalesReceived)}`}
                />
                <MetricCard
                  title="Approved Cash Returns"
                  value={`${CURRENCY} ${money(reconPreview.approvedCashReturns)}`}
                />
                <MetricCard
                  title="Approved Cash Expenses"
                  value={`${CURRENCY} ${money(reconPreview.approvedCashExpenses)}`}
                />
                <MetricCard
                  title="Expected Closing Cash"
                  value={`${CURRENCY} ${money(expectedCashForClosing)}`}
                  valueClassName="text-cyan-100"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard
                  title="Actual Cash Counted"
                  value={`${CURRENCY} ${money(actualCashCountedNum)}`}
                />

                <Card className="border-slate-700 bg-slate-800/50">
                  <CardContent className="pt-6">
                    <p className="text-[11px] text-slate-400">{varianceLabel}</p>
                    <p
                      className={`mt-2 text-2xl font-bold ${
                        reconciliationStatus === "Balanced"
                          ? "text-emerald-300"
                          : reconciliationStatus === "Short"
                          ? "text-red-300"
                          : "text-amber-300"
                      }`}
                    >
                      {reconciliationStatus === "Balanced" && `${CURRENCY} ${money(0)}`}
                      {reconciliationStatus === "Short" &&
                        `${CURRENCY} ${money(reconciliationShortAmount)}`}
                      {reconciliationStatus === "Excess" &&
                        `${CURRENCY} ${money(reconciliationExcessAmount)}`}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSaveReconciliation}
                disabled={reconSaving || reconLoading || isReconLocked}
              >
                {reconSaving ? "Saving..." : "Save Closing Record"}
              </Button>

              <Button variant="outline" onClick={loadExistingReconciliation} disabled={reconLoading}>
                {reconLoading ? "Loading..." : "Reload Saved Record"}
              </Button>

              <Button
                variant="outline"
                onClick={printClosingSlip}
                disabled={!scopedBranchId || !existingReconciliationId || !isReconLocked}
              >
                Print Closing Slip
              </Button>
            </div>

            <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">How the figures work</p>

              <div>
                <p className="text-white">Total Paid Breakdown</p>
                <p className="text-slate-400">{paymentBreakdownLine}</p>
              </div>

              <div>
                <p className="text-white">Cash Drawer Formula</p>
                <p>
                  Expected Closing Cash = Opening Float + Cash Sales Received − Approved Cash Returns −
                  Approved Cash Expenses
                </p>
                <p className="text-slate-400">{formulaLine}</p>
              </div>

              <p className="text-xs text-slate-500">
                Momo and card payments are successfully received but are not part of the physical cash
                drawer, so they are excluded from drawer cash reconciliation.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}