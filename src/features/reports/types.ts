import { ReactNode } from "react";

export type ReportView =
  | "overview"
  | "financial-report"
  | "reconciliation"
  | "financial-position";

export interface SalesSummary {
  totalSales: number;
  totalAmount: number;
  totalPaidAmount: number;
  outstandingDebt: number;
  totalCustomerDebt: number;
  avgSale: number;

  paidSalesCount: number;
  partialSalesCount: number;
  creditSalesCount: number;

  cashCollectedAmount: number;
  momoCollectedAmount: number;
  cardCollectedAmount: number;
  nonCashCollectedAmount: number;
  creditSalesValue: number;

  returnsApprovedAmount: number;
  returnsApprovedCount: number;
  returnsPendingCount: number;

  expensesApprovedAmount: number;
  expensesApprovedCount: number;
  cashExpensesApprovedAmount: number;

  totalDeductions: number;
  netAfterDeductions: number;
  netCollectedAfterDeductions: number;
  netCashPosition: number;

  inventoryValue: number;
  inventorySellingValue: number;
  estimatedCostOfSales: number;
  grossProfit: number;
  operatingProfit: number;

  momoWalletPosition: number;
  bankCardPosition: number;
  totalTrackedLiquidPosition: number;

  supplierPayables: number;
}

export interface TopProduct {
  name: string;
  total_qty: number;
  total_revenue: number;
}

export interface AttendanceSummary {
  total_staff: number;
  present_today: number;
}

export type BranchRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  company_id: string | null;
  is_active?: boolean | null;
};

export type CompanyRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url?: string | null;
  receipt_footer?: string | null;
  tax_id?: string | null;
};

export type BranchCompareRow = {
  branch_id: string;
  branch_name: string;
  total_sales: number;
  total_revenue: number;
  total_paid: number;
  outstanding_debt: number;
  approved_returns: number;
  approved_expenses: number;
  total_deductions: number;
  net_after_deductions: number;
  net_collected_after_deductions: number;
};

export type CashReconciliationPreview = {
  cashSalesReceived: number;
  approvedCashReturns: number;
  approvedCashExpenses: number;
};

export type CashReconciliationRow = {
  id: string;
  company_id: string;
  branch_id: string;
  reconciliation_date: string;
  opening_float: number;
  cash_sales_received: number;
  cash_returns_paid: number;
  cash_expenses_paid: number;
  expected_cash: number;
  actual_cash_counted: number;
  difference_amount: number;
  notes: string | null;
  closed_by: string;
  closed_at: string;
  created_at: string;
  updated_at: string;
  is_locked: boolean;
};

export type ProductStockRow = {
  name: string;
  quantity_in_stock: number;
  reorder_level: number;
  [key: string]: any;
};

export type MetricCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  valueClassName?: string;
};

export type SimpleInfoRowProps = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
};

export type ReportMenuItem = {
  key: ReportView;
  label: string;
  icon: ReactNode;
};

export type FetchOrgInfoResult = {
  company: CompanyRow | null;
  branches: BranchRow[];
  selectedBranch: BranchRow | null;
  selectedScopeBranchId: string;
};

export type FetchReportsDataArgs = {
  companyId: string;
  scopedBranchId: string | null;
  startDate: string;
  endDate: string;
  openingFloatNum: number;
};

export type FetchReportsDataResult = {
  salesSummary: SalesSummary;
  topProducts: TopProduct[];
  attendanceSummary: AttendanceSummary;
  lowStockProducts: ProductStockRow[];
  totalProductsCount: number;
  totalStockUnits: number;
  inventoryValuationBasis: string;
  reconPreview: CashReconciliationPreview;
};

export type SaveReconciliationArgs = {
  existingReconciliationId: string | null;
  companyId: string;
  scopedBranchId: string;
  reconciliationDate: string;
  openingFloatNum: number;
  actualCashCountedNum: number;
  reconciliationNotes: string;
  reconPreview: CashReconciliationPreview;
  expectedCashForClosing: number;
  reconciliationDifference: number;
  userId: string;
};

export type SaveReconciliationResult = {
  id: string;
  is_locked: boolean;
};