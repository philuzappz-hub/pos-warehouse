import {
  getEmptyReconPreview,
  getEmptySalesSummary,
  getExpectedCashForClosing,
} from "@/features/reports/calculations";
import {
  detectInventoryBasis,
  detectInventoryCost,
  detectSellingPrice,
  isoDate,
  isValidSale,
  normalizePaymentMethod,
  roundMoney,
  safeNumber,
} from "@/features/reports/helpers";
import type {
  AttendanceSummary,
  BranchCompareRow,
  BranchRow,
  CashReconciliationRow,
  CompanyRow,
  FetchOrgInfoResult,
  FetchReportsDataArgs,
  FetchReportsDataResult,
  SaveReconciliationArgs,
  SaveReconciliationResult,
} from "@/features/reports/types";
import { supabase } from "@/integrations/supabase/client";

export async function fetchOrgInfo(
  companyId: string | null,
  activeBranchId: string | null
): Promise<FetchOrgInfoResult> {
  if (!companyId) {
    return {
      company: null,
      branches: [],
      selectedBranch: null,
      selectedScopeBranchId: "all",
    };
  }

  const { data: co, error: coErr } = await (supabase as any)
    .from("companies")
    .select("id,name,address,phone,email,logo_url,receipt_footer,tax_id")
    .eq("id", companyId)
    .maybeSingle();

  if (coErr) throw coErr;

  const { data: brs, error: brErr } = await (supabase as any)
    .from("branches")
    .select("id,name,address,phone,email,company_id,is_active")
    .eq("company_id", companyId)
    .order("name");

  if (brErr) throw brErr;

  const branches = (brs ?? []) as BranchRow[];
  const selectedBranch = activeBranchId
    ? branches.find((x) => x.id === activeBranchId) || null
    : null;

  return {
    company: (co ?? null) as CompanyRow | null,
    branches,
    selectedBranch,
    selectedScopeBranchId: activeBranchId || "all",
  };
}

export async function fetchBranchComparison(args: {
  companyId: string;
  branches: BranchRow[];
  startDate: string;
  endDate: string;
}): Promise<BranchCompareRow[]> {
  const { companyId, branches, startDate, endDate } = args;

  const brMap = new Map<string, string>();
  branches.forEach((b) => brMap.set(b.id, b.name));

  const { data: sales, error: salesErr } = await (supabase as any)
    .from("sales")
    .select(
      "branch_id,total_amount,amount_paid,balance_due,created_at,is_returned,company_id,customer_id,status"
    )
    .eq("company_id", companyId)
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);

  if (salesErr) throw salesErr;

  const { data: returnsRows, error: retErr } = await (supabase as any)
    .from("returns")
    .select(`
      status,
      quantity,
      created_at,
      sale_item:sale_items(
        unit_price,
        sale:sales!inner(branch_id,company_id)
      )
    `)
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`)
    .eq("sale_item.sale.company_id", companyId);

  if (retErr) throw retErr;

  const { data: expRows, error: expErr } = await (supabase as any)
    .from("expenses")
    .select("branch_id,amount,status,expense_date,company_id")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (expErr) throw expErr;

  const byBranch = new Map<
    string,
    {
      total_sales: number;
      total_revenue: number;
      total_paid: number;
      outstanding_debt: number;
      approved_returns: number;
      approved_expenses: number;
    }
  >();

  (sales ?? []).forEach((s: any) => {
    if (!isValidSale(s)) return;

    const bid = String(s?.branch_id || "");
    if (!bid) return;

    const cur = byBranch.get(bid) || {
      total_sales: 0,
      total_revenue: 0,
      total_paid: 0,
      outstanding_debt: 0,
      approved_returns: 0,
      approved_expenses: 0,
    };

    cur.total_sales += 1;
    cur.total_revenue += roundMoney(s?.total_amount || 0);
    cur.total_paid += roundMoney(s?.amount_paid || 0);
    cur.outstanding_debt += Math.max(0, roundMoney(s?.balance_due || 0));

    byBranch.set(bid, cur);
  });

  (returnsRows ?? []).forEach((r: any) => {
    const status = String(r?.status || "").toLowerCase();
    if (status !== "approved") return;

    const bid = String(r?.sale_item?.sale?.branch_id || "");
    if (!bid) return;

    const qty = safeNumber(r?.quantity || 0);
    const unitPrice = safeNumber(r?.sale_item?.unit_price || 0);

    const cur = byBranch.get(bid) || {
      total_sales: 0,
      total_revenue: 0,
      total_paid: 0,
      outstanding_debt: 0,
      approved_returns: 0,
      approved_expenses: 0,
    };

    cur.approved_returns += roundMoney(qty * unitPrice);
    byBranch.set(bid, cur);
  });

  (expRows ?? []).forEach((e: any) => {
    const bid = String(e?.branch_id || "");
    if (!bid) return;

    const cur = byBranch.get(bid) || {
      total_sales: 0,
      total_revenue: 0,
      total_paid: 0,
      outstanding_debt: 0,
      approved_returns: 0,
      approved_expenses: 0,
    };

    cur.approved_expenses += roundMoney(e?.amount || 0);
    byBranch.set(bid, cur);
  });

  return Array.from(byBranch.entries())
    .map(([branch_id, v]) => {
      const total_deductions = roundMoney(v.approved_returns + v.approved_expenses);
      return {
        branch_id,
        branch_name: brMap.get(branch_id) || "Unknown branch",
        total_sales: v.total_sales,
        total_revenue: roundMoney(v.total_revenue),
        total_paid: roundMoney(v.total_paid),
        outstanding_debt: roundMoney(v.outstanding_debt),
        approved_returns: roundMoney(v.approved_returns),
        approved_expenses: roundMoney(v.approved_expenses),
        total_deductions,
        net_after_deductions: roundMoney(v.total_revenue - total_deductions),
        net_collected_after_deductions: roundMoney(v.total_paid - total_deductions),
      };
    })
    .sort((a, b) => b.net_collected_after_deductions - a.net_collected_after_deductions);
}

export async function fetchReportsData(
  args: FetchReportsDataArgs
): Promise<FetchReportsDataResult> {
  const { companyId, scopedBranchId, startDate, endDate, openingFloatNum } = args;

  if (!companyId) {
    return {
      salesSummary: getEmptySalesSummary(),
      topProducts: [],
      attendanceSummary: { total_staff: 0, present_today: 0 },
      lowStockProducts: [],
      totalProductsCount: 0,
      totalStockUnits: 0,
      inventoryValuationBasis: "unknown",
      reconPreview: getEmptyReconPreview(),
    };
  }

  let salesQ = (supabase as any)
    .from("sales")
    .select(
      "id,total_amount,amount_paid,balance_due,payment_status,payment_method,branch_id,company_id,created_at,is_returned,customer_id,status"
    )
    .eq("company_id", companyId)
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);

  if (scopedBranchId) {
    salesQ = salesQ.eq("branch_id", scopedBranchId);
  }

  const { data: sales, error: salesErr } = await salesQ;
  if (salesErr) throw salesErr;

  const safeSales = (sales ?? []).filter((s: any) => isValidSale(s));

  const totalAmount = roundMoney(
    safeSales.reduce((sum: number, s: any) => sum + safeNumber(s.total_amount), 0)
  );

  const totalPaidAmount = roundMoney(
    safeSales.reduce((sum: number, s: any) => sum + safeNumber(s.amount_paid), 0)
  );

  let paidSalesCount = 0;
  let partialSalesCount = 0;
  let creditSalesCount = 0;

  let cashCollectedAmount = 0;
  let momoCollectedAmount = 0;
  let cardCollectedAmount = 0;
  let creditSalesValue = 0;

  safeSales.forEach((s: any) => {
    const ps = String(s?.payment_status || "").toLowerCase();
    const pm = normalizePaymentMethod(s?.payment_method);
    const paid = roundMoney(s?.amount_paid || 0);
    const total = roundMoney(s?.total_amount || 0);

    if (ps === "paid") paidSalesCount += 1;
    else if (ps === "partial") partialSalesCount += 1;
    else if (ps === "credit") creditSalesCount += 1;

    if (pm === "cash") cashCollectedAmount += paid;
    else if (pm === "momo") momoCollectedAmount += paid;
    else if (pm === "card") cardCollectedAmount += paid;
    else if (pm === "credit") creditSalesValue += total;
  });

  cashCollectedAmount = roundMoney(cashCollectedAmount);
  momoCollectedAmount = roundMoney(momoCollectedAmount);
  cardCollectedAmount = roundMoney(cardCollectedAmount);
  creditSalesValue = roundMoney(creditSalesValue);

  const nonCashCollectedAmount = roundMoney(momoCollectedAmount + cardCollectedAmount);

  let returnsBaseQ = (supabase as any)
    .from("returns")
    .select(`
      id,
      status,
      quantity,
      created_at,
      sale_item:sale_items(
        id,
        unit_price,
        product:products(*),
        sale:sales!inner(branch_id,company_id,payment_method)
      )
    `)
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`)
    .eq("sale_item.sale.company_id", companyId);

  if (scopedBranchId) {
    returnsBaseQ = returnsBaseQ.eq("sale_item.sale.branch_id", scopedBranchId);
  }

  const { data: returnsRows, error: retErr } = await returnsBaseQ;
  if (retErr) throw retErr;

  let returnsApprovedAmount = 0;
  let returnsApprovedCount = 0;
  let returnsPendingCount = 0;
  let approvedCashReturnsAmount = 0;

  const approvedReturnedQtyBySaleItem = new Map<string, number>();

  (returnsRows ?? []).forEach((r: any) => {
    const status = String(r?.status || "").toLowerCase();
    const qty = safeNumber(r?.quantity || 0);
    const unitPrice = safeNumber(r?.sale_item?.unit_price || 0);
    const amount = roundMoney(qty * unitPrice);
    const salePaymentMethod = normalizePaymentMethod(r?.sale_item?.sale?.payment_method);
    const saleItemId = String(r?.sale_item?.id || "");

    if (status === "approved") {
      returnsApprovedCount += 1;
      returnsApprovedAmount += amount;

      if (salePaymentMethod === "cash") {
        approvedCashReturnsAmount += amount;
      }

      if (saleItemId) {
        approvedReturnedQtyBySaleItem.set(
          saleItemId,
          roundMoney((approvedReturnedQtyBySaleItem.get(saleItemId) || 0) + qty)
        );
      }
    } else if (status === "pending") {
      returnsPendingCount += 1;
    }
  });

  returnsApprovedAmount = roundMoney(returnsApprovedAmount);
  approvedCashReturnsAmount = roundMoney(approvedCashReturnsAmount);

  let expQ = (supabase as any)
    .from("expenses")
    .select("id,amount,branch_id,status,expense_date,company_id,payment_method")
    .eq("status", "approved")
    .eq("company_id", companyId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (scopedBranchId) expQ = expQ.eq("branch_id", scopedBranchId);

  const { data: expRows, error: expErr } = await expQ;
  if (expErr) throw expErr;

  const expensesApprovedAmount = roundMoney(
    (expRows ?? []).reduce((sum: number, e: any) => sum + safeNumber(e?.amount), 0)
  );

  const expensesApprovedCount = (expRows ?? []).length;

  const cashExpensesApprovedAmount = roundMoney(
    (expRows ?? []).reduce((sum: number, e: any) => {
      const pm = normalizePaymentMethod(e?.payment_method);
      if (pm !== "cash") return sum;
      return sum + safeNumber(e?.amount);
    }, 0)
  );

  let purchasesQ = (supabase as any)
    .from("purchases")
    .select("balance_due,branch_id,company_id,payment_status,stock_status")
    .eq("company_id", companyId)
    .gt("balance_due", 0);

  if (scopedBranchId) {
    purchasesQ = purchasesQ.eq("branch_id", scopedBranchId);
  }

  const { data: purchaseRows, error: purchasesErr } = await purchasesQ;
  if (purchasesErr) throw purchasesErr;

  const supplierPayables = roundMoney(
    (purchaseRows ?? []).reduce((sum: number, p: any) => {
      const balance = safeNumber(p?.balance_due);
      if (balance <= 0) return sum;

      const stockStatus = String(p?.stock_status || "").toLowerCase();
      if (stockStatus === "cancelled") return sum;

      return sum + balance;
    }, 0)
  );

  const totalSales = safeSales.length;
  const avgSale = totalSales > 0 ? roundMoney(totalAmount / totalSales) : 0;

  const outstandingDebt = roundMoney(
    safeSales.reduce((sum: number, s: any) => {
      const balance = safeNumber(s?.balance_due);
      return sum + (balance > 0 ? balance : 0);
    }, 0)
  );

  const totalCustomerDebt = roundMoney(
    safeSales.reduce((sum: number, s: any) => {
      const hasCustomer = !!String(s?.customer_id || "").trim();
      const balance = safeNumber(s?.balance_due);
      if (!hasCustomer || balance <= 0) return sum;
      return sum + balance;
    }, 0)
  );

  const totalDeductions = roundMoney(returnsApprovedAmount + expensesApprovedAmount);
  const netAfterDeductions = roundMoney(totalAmount - totalDeductions);
  const netCollectedAfterDeductions = roundMoney(totalPaidAmount - totalDeductions);
  const netCashPosition = roundMoney(
    cashCollectedAmount - approvedCashReturnsAmount - cashExpensesApprovedAmount
  );

  let saleItemsQ = (supabase as any)
    .from("sale_items")
    .select(`
      id,
      quantity,
      unit_price,
      created_at,
      product:products(*),
      sale:sales!inner(branch_id,company_id,is_returned,status,created_at)
    `)
    .eq("sale.company_id", companyId)
    .gte("sale.created_at", `${startDate}T00:00:00`)
    .lte("sale.created_at", `${endDate}T23:59:59`);

  if (scopedBranchId) {
    saleItemsQ = saleItemsQ.eq("sale.branch_id", scopedBranchId);
  }

  const { data: saleItems, error: itemsErr } = await saleItemsQ;
  if (itemsErr) throw itemsErr;

  let estimatedCostOfSales = 0;
  let topProducts: FetchReportsDataResult["topProducts"] = [];

  if (saleItems) {
    const productMap = new Map<string, { total_qty: number; total_revenue: number }>();

    saleItems.forEach((item: any) => {
      if (!isValidSale(item?.sale)) return;

      const itemId = String(item?.id || "");
      const soldQty = safeNumber(item?.quantity || 0);
      const returnedQty = safeNumber(approvedReturnedQtyBySaleItem.get(itemId) || 0);
      const netQty = Math.max(0, soldQty - returnedQty);

      const name = item?.product?.name || "Unknown";
      const sellingPrice = safeNumber(item?.unit_price || 0);
      const unitCost = detectInventoryCost(item?.product);

      estimatedCostOfSales += roundMoney(netQty * unitCost);

      const existing = productMap.get(name) || { total_qty: 0, total_revenue: 0 };

      productMap.set(name, {
        total_qty: roundMoney(existing.total_qty + netQty),
        total_revenue: roundMoney(existing.total_revenue + netQty * sellingPrice),
      });
    });

    topProducts = Array.from(productMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10);
  }

  estimatedCostOfSales = roundMoney(estimatedCostOfSales);

  const today = isoDate(new Date());

  let staffQ = (supabase as any)
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .filter("deleted_at", "is", null);

  if (scopedBranchId) staffQ = staffQ.eq("branch_id", scopedBranchId);

  const { count: totalStaff, error: staffErr } = await staffQ;
  if (staffErr) throw staffErr;

  let presentQ = (supabase as any)
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("date", today);

  if (scopedBranchId) presentQ = presentQ.eq("branch_id", scopedBranchId);

  const { count: presentToday, error: presentErr } = await presentQ;
  if (presentErr) throw presentErr;

  const attendanceSummary: AttendanceSummary = {
    total_staff: totalStaff || 0,
    present_today: presentToday || 0,
  };

  let productsQ = (supabase as any)
    .from("products")
    .select("*")
    .eq("company_id", companyId)
    .order("quantity_in_stock", { ascending: true });

  if (scopedBranchId) productsQ = productsQ.eq("branch_id", scopedBranchId);

  const { data: productsRows, error: productsErr } = await productsQ;
  if (productsErr) throw productsErr;

  const productRows = (productsRows || []) as any[];
  const totalProductsCount = productRows.length;
  const totalStockUnits = productRows.reduce(
    (sum, p) => sum + safeNumber(p.quantity_in_stock),
    0
  );
  const inventoryValuationBasis = detectInventoryBasis(productRows);

  const inventoryValue = roundMoney(
    productRows.reduce((sum, p) => {
      const qty = safeNumber(p.quantity_in_stock);
      const cost = detectInventoryCost(p);
      return sum + qty * cost;
    }, 0)
  );

  const inventorySellingValue = roundMoney(
    productRows.reduce((sum, p) => {
      const qty = safeNumber(p.quantity_in_stock);
      const selling = detectSellingPrice(p);
      return sum + qty * selling;
    }, 0)
  );

  const lowStockProducts = productRows
    .filter((p: any) => {
      const qty = safeNumber(p?.quantity_in_stock);
      const reorderLevel = safeNumber(p?.reorder_level || 10);
      return qty <= reorderLevel;
    })
    .slice(0, 10);

  const netSales = roundMoney(totalAmount - returnsApprovedAmount);
  const grossProfit = roundMoney(netSales - estimatedCostOfSales);
  const operatingProfit = roundMoney(grossProfit - expensesApprovedAmount);

  const momoWalletPosition = roundMoney(momoCollectedAmount);
  const bankCardPosition = roundMoney(cardCollectedAmount);

  const reconPreview = {
    cashSalesReceived: cashCollectedAmount,
    approvedCashReturns: approvedCashReturnsAmount,
    approvedCashExpenses: cashExpensesApprovedAmount,
  };

  const expectedCashForClosing = getExpectedCashForClosing(openingFloatNum, reconPreview);
  const totalTrackedLiquidPosition = roundMoney(
    expectedCashForClosing + momoWalletPosition + bankCardPosition
  );

  return {
    salesSummary: {
      totalSales,
      totalAmount,
      totalPaidAmount,
      outstandingDebt,
      totalCustomerDebt,
      avgSale,

      paidSalesCount,
      partialSalesCount,
      creditSalesCount,

      cashCollectedAmount,
      momoCollectedAmount,
      cardCollectedAmount,
      nonCashCollectedAmount,
      creditSalesValue,

      returnsApprovedAmount,
      returnsApprovedCount,
      returnsPendingCount,

      expensesApprovedAmount,
      expensesApprovedCount,
      cashExpensesApprovedAmount,

      totalDeductions,
      netAfterDeductions,
      netCollectedAfterDeductions,
      netCashPosition,

      inventoryValue,
      inventorySellingValue,
      estimatedCostOfSales,
      grossProfit,
      operatingProfit,

      momoWalletPosition,
      bankCardPosition,
      totalTrackedLiquidPosition,

      supplierPayables,
    },
    topProducts,
    attendanceSummary,
    lowStockProducts,
    totalProductsCount,
    totalStockUnits,
    inventoryValuationBasis,
    reconPreview,
  };
}

export async function loadExistingReconciliation(args: {
  companyId: string;
  scopedBranchId: string;
  reconciliationDate: string;
}) {
  const { companyId, scopedBranchId, reconciliationDate } = args;

  const { data, error } = await (supabase as any)
    .from("cash_reconciliations")
    .select("*")
    .eq("company_id", companyId)
    .eq("branch_id", scopedBranchId)
    .eq("reconciliation_date", reconciliationDate)
    .maybeSingle();

  if (error) throw error;

  return (data ?? null) as CashReconciliationRow | null;
}

export async function saveReconciliation(
  args: SaveReconciliationArgs
): Promise<SaveReconciliationResult> {
  const {
    existingReconciliationId,
    companyId,
    scopedBranchId,
    reconciliationDate,
    openingFloatNum,
    actualCashCountedNum,
    reconciliationNotes,
    reconPreview,
    expectedCashForClosing,
    reconciliationDifference,
    userId,
  } = args;

  const nowIso = new Date().toISOString();

  const payload = {
    company_id: companyId,
    branch_id: scopedBranchId,
    reconciliation_date: reconciliationDate,
    opening_float: openingFloatNum,
    cash_sales_received: reconPreview.cashSalesReceived,
    cash_returns_paid: reconPreview.approvedCashReturns,
    cash_expenses_paid: reconPreview.approvedCashExpenses,
    expected_cash: expectedCashForClosing,
    actual_cash_counted: actualCashCountedNum,
    difference_amount: reconciliationDifference,
    notes: reconciliationNotes.trim() || null,
    closed_by: userId,
    closed_at: nowIso,
    is_locked: true,
  };

  if (existingReconciliationId) {
    const { error } = await (supabase as any)
      .from("cash_reconciliations")
      .update({
        opening_float: payload.opening_float,
        cash_sales_received: payload.cash_sales_received,
        cash_returns_paid: payload.cash_returns_paid,
        cash_expenses_paid: payload.cash_expenses_paid,
        expected_cash: payload.expected_cash,
        actual_cash_counted: payload.actual_cash_counted,
        difference_amount: payload.difference_amount,
        notes: payload.notes,
        closed_by: payload.closed_by,
        closed_at: payload.closed_at,
        is_locked: payload.is_locked,
      })
      .eq("id", existingReconciliationId)
      .eq("is_locked", false);

    if (error) throw error;

    return { id: existingReconciliationId, is_locked: true };
  }

  const { data, error } = await (supabase as any)
    .from("cash_reconciliations")
    .insert(payload)
    .select("id,is_locked")
    .single();

  if (error) throw error;

  return {
    id: String(data?.id || ""),
    is_locked: Boolean(data?.is_locked ?? true),
  };
}