import { CURRENCY, money, roundMoney, safeNumber } from "@/features/reports/helpers";
import type { CashReconciliationPreview, SalesSummary } from "@/features/reports/types";

export function getEmptySalesSummary(): SalesSummary {
  return {
    totalSales: 0,
    totalAmount: 0,
    totalPaidAmount: 0,
    outstandingDebt: 0,
    totalCustomerDebt: 0,
    avgSale: 0,

    paidSalesCount: 0,
    partialSalesCount: 0,
    creditSalesCount: 0,

    cashCollectedAmount: 0,
    momoCollectedAmount: 0,
    cardCollectedAmount: 0,
    nonCashCollectedAmount: 0,
    creditSalesValue: 0,

    returnsApprovedAmount: 0,
    returnsApprovedCount: 0,
    returnsPendingCount: 0,

    expensesApprovedAmount: 0,
    expensesApprovedCount: 0,
    cashExpensesApprovedAmount: 0,

    totalDeductions: 0,
    netAfterDeductions: 0,
    netCollectedAfterDeductions: 0,
    netCashPosition: 0,

    inventoryValue: 0,
    inventorySellingValue: 0,
    estimatedCostOfSales: 0,
    grossProfit: 0,
    operatingProfit: 0,

    momoWalletPosition: 0,
    bankCardPosition: 0,
    totalTrackedLiquidPosition: 0,

    supplierPayables: 0,
  };
}

export function getEmptyReconPreview(): CashReconciliationPreview {
  return {
    cashSalesReceived: 0,
    approvedCashReturns: 0,
    approvedCashExpenses: 0,
  };
}

export function getExpectedCashForClosing(
  openingFloatNum: number,
  reconPreview: CashReconciliationPreview
) {
  return roundMoney(
    safeNumber(openingFloatNum) +
      safeNumber(reconPreview.cashSalesReceived) -
      safeNumber(reconPreview.approvedCashReturns) -
      safeNumber(reconPreview.approvedCashExpenses)
  );
}

export function getReconciliationShortAmount(
  actualCashCountedNum: number,
  expectedCashForClosing: number
) {
  return actualCashCountedNum < expectedCashForClosing
    ? roundMoney(expectedCashForClosing - actualCashCountedNum)
    : 0;
}

export function getReconciliationExcessAmount(
  actualCashCountedNum: number,
  expectedCashForClosing: number
) {
  return actualCashCountedNum > expectedCashForClosing
    ? roundMoney(actualCashCountedNum - expectedCashForClosing)
    : 0;
}

export function getReconciliationDifference(
  actualCashCountedNum: number,
  expectedCashForClosing: number
) {
  if (Math.abs(actualCashCountedNum - expectedCashForClosing) < 0.005) return 0;
  if (actualCashCountedNum < expectedCashForClosing) {
    return -roundMoney(expectedCashForClosing - actualCashCountedNum);
  }
  return roundMoney(actualCashCountedNum - expectedCashForClosing);
}

export function getReconciliationStatus(reconciliationDifference: number) {
  if (Math.abs(reconciliationDifference) < 0.005) return "Balanced";
  if (reconciliationDifference < 0) return "Short";
  return "Excess";
}

export function getReconciliationStatusClasses(reconciliationStatus: string) {
  if (reconciliationStatus === "Balanced") {
    return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  }
  if (reconciliationStatus === "Short") {
    return "text-red-300 border-red-500/30 bg-red-500/10";
  }
  return "text-amber-300 border-amber-500/30 bg-amber-500/10";
}

export function getVarianceLabel(reconciliationStatus: string) {
  if (reconciliationStatus === "Balanced") return "Balanced";
  if (reconciliationStatus === "Short") return "Cash Short";
  return "Cash Over";
}

export function getFormulaLine(
  openingFloatNum: number,
  reconPreview: CashReconciliationPreview,
  expectedCashForClosing: number
) {
  return `${CURRENCY} ${money(openingFloatNum)} + ${CURRENCY} ${money(
    reconPreview.cashSalesReceived
  )} - ${CURRENCY} ${money(reconPreview.approvedCashReturns)} - ${CURRENCY} ${money(
    reconPreview.approvedCashExpenses
  )} = ${CURRENCY} ${money(expectedCashForClosing)}`;
}

export function getPaymentBreakdownLine(salesSummary: SalesSummary) {
  return `Total Paid ${CURRENCY} ${money(salesSummary.totalPaidAmount)} = Cash ${CURRENCY} ${money(
    salesSummary.cashCollectedAmount
  )} + Momo ${CURRENCY} ${money(salesSummary.momoCollectedAmount)} + Card ${CURRENCY} ${money(
    salesSummary.cardCollectedAmount
  )}`;
}

export function getNetSalesValue(salesSummary: SalesSummary) {
  return roundMoney(salesSummary.totalAmount - salesSummary.returnsApprovedAmount);
}

export function getProfitFormulaLine(salesSummary: SalesSummary) {
  const netSalesValue = getNetSalesValue(salesSummary);

  return `Operating Profit = Net Sales ${CURRENCY} ${money(
    netSalesValue
  )} - Estimated Cost of Sales ${CURRENCY} ${money(
    salesSummary.estimatedCostOfSales
  )} - Approved Expenses ${CURRENCY} ${money(
    salesSummary.expensesApprovedAmount
  )} = ${CURRENCY} ${money(salesSummary.operatingProfit)}`;
}

export function getFinancialPositionAssets(
  expectedCashForClosing: number,
  salesSummary: SalesSummary
) {
  return roundMoney(
    expectedCashForClosing +
      salesSummary.momoWalletPosition +
      salesSummary.bankCardPosition +
      salesSummary.totalCustomerDebt +
      salesSummary.inventoryValue
  );
}

export function getFinancialPositionLiabilities(salesSummary: SalesSummary) {
  return roundMoney(salesSummary.supplierPayables);
}

export function getFinancialPositionNet(
  expectedCashForClosing: number,
  salesSummary: SalesSummary
) {
  const assets = getFinancialPositionAssets(expectedCashForClosing, salesSummary);
  const liabilities = getFinancialPositionLiabilities(salesSummary);
  return roundMoney(assets - liabilities);
}