import {
  getPurchaseLineTotal,
  getPurchaseTotals,
  normalizeOptionalText,
  roundMoney,
  safeNumber,
} from "@/features/purchases/helpers";
import type {
  ProductOption,
  PurchaseDetailsResult,
  PurchaseFormValues,
  PurchaseItemFormRow,
  PurchaseRow,
  SupplierAccountSnapshot,
  SupplierCreditInfo,
  SupplierOption,
} from "@/features/purchases/types";
import { supabase } from "@/integrations/supabase/client";

export async function fetchPurchaseSuppliers(companyId: string) {
  const { data, error } = await (supabase as any)
    .from("suppliers")
    .select("id,name,supplier_code,is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return (data ?? []) as SupplierOption[];
}

export async function fetchPurchaseProducts(args: {
  companyId: string;
  branchId?: string | null;
}) {
  const { companyId, branchId } = args;

  let query = (supabase as any)
    .from("products")
    .select("id,name,branch_id,company_id,quantity_in_stock,cost_price,last_cost")
    .eq("company_id", companyId)
    .order("name");

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as ProductOption[];
}

export async function fetchSupplierAccountSnapshot(args: {
  companyId: string;
  supplierId: string;
}): Promise<SupplierAccountSnapshot> {
  const { companyId, supplierId } = args;

  const { data: purchases, error: purchasesError } = await (supabase as any)
    .from("purchases")
    .select("total_amount,balance_due,overpayment_amount,supplier_credit_applied")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);

  if (purchasesError) throw purchasesError;

  const { data: payments, error: paymentsError } = await (supabase as any)
    .from("supplier_payments")
    .select("amount,purchase_id")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);

  if (paymentsError) throw paymentsError;

  const totalPurchases = roundMoney(
    (purchases ?? []).reduce(
      (sum: number, row: any) => sum + safeNumber(row?.total_amount),
      0
    )
  );

  const outstandingPurchases = roundMoney(
    (purchases ?? []).reduce(
      (sum: number, row: any) => sum + safeNumber(row?.balance_due),
      0
    )
  );

  const totalOverpaymentCredits = roundMoney(
    (purchases ?? []).reduce(
      (sum: number, row: any) => sum + safeNumber(row?.overpayment_amount),
      0
    )
  );

  const totalCreditsApplied = roundMoney(
    (purchases ?? []).reduce(
      (sum: number, row: any) => sum + safeNumber(row?.supplier_credit_applied),
      0
    )
  );

  const totalPayments = roundMoney(
    (payments ?? []).reduce(
      (sum: number, row: any) => sum + safeNumber(row?.amount),
      0
    )
  );

  const totalUnallocatedPayments = roundMoney(
    (payments ?? [])
      .filter((row: any) => !row?.purchase_id)
      .reduce((sum: number, row: any) => sum + safeNumber(row?.amount), 0)
  );

  const creditPool = roundMoney(
    Math.max(0, totalOverpaymentCredits + totalUnallocatedPayments - totalCreditsApplied)
  );

  const netAfterCredit = roundMoney(outstandingPurchases - creditPool);

  const netPayable = roundMoney(Math.max(0, netAfterCredit));
  const availableCredit = roundMoney(Math.max(0, -netAfterCredit));
  const closingBalance =
    netPayable > 0 ? netPayable : availableCredit > 0 ? -availableCredit : 0;

  return {
    supplierId,
    totalPurchases,
    outstandingPurchases,
    totalPayments,
    totalUnallocatedPayments,
    totalOverpaymentCredits,
    totalCreditsApplied,
    creditPool,
    availableCredit,
    netPayable,
    closingBalance: roundMoney(closingBalance),
  };
}

export async function fetchSupplierCreditBalance(args: {
  companyId: string;
  supplierId: string;
}): Promise<SupplierCreditInfo> {
  const snapshot = await fetchSupplierAccountSnapshot(args);

  return {
    supplierId: snapshot.supplierId,
    creditBalance: snapshot.availableCredit,
  };
}

export async function createPurchaseWithItems(args: {
  companyId: string;
  userId: string | null;
  form: PurchaseFormValues;
  rows: PurchaseItemFormRow[];
  supplierCreditBalance?: number;
}) {
  const { companyId, userId, form, rows, supplierCreditBalance = 0 } = args;

  const totals = getPurchaseTotals(form, rows, supplierCreditBalance);

  const purchasePayload = {
    company_id: companyId,
    branch_id: form.branch_id,
    supplier_id: form.supplier_id,
    purchase_date: form.purchase_date,
    invoice_number: normalizeOptionalText(form.invoice_number),
    reference_number: normalizeOptionalText(form.reference_number),
    subtotal: totals.subtotal,
    discount_amount: totals.discountAmount,
    tax_amount: totals.taxAmount,
    other_charges: totals.otherCharges,
    total_amount: totals.totalAmount,
    amount_paid: totals.effectivePaidAmount,
    balance_due: totals.balanceDue,
    overpayment_amount: totals.overpaymentAmount,
    supplier_credit_applied: totals.supplierCreditApplied,
    payment_status: totals.paymentStatus,
    stock_status: "received",
    notes: normalizeOptionalText(form.notes),
    created_by: userId,
    approved_by: userId,
  };

  const { data: purchase, error: purchaseError } = await (supabase as any)
    .from("purchases")
    .insert(purchasePayload)
    .select("*")
    .single();

  if (purchaseError) throw purchaseError;

  const purchaseItemsPayload = rows.map((row) => ({
    purchase_id: purchase.id,
    company_id: companyId,
    branch_id: form.branch_id,
    product_id: row.product_id,
    quantity: roundMoney(safeNumber(row.quantity)),
    unit_cost: roundMoney(safeNumber(row.unit_cost)),
    line_discount: roundMoney(safeNumber(row.line_discount)),
    line_total: getPurchaseLineTotal(row),
  }));

  const { error: itemError } = await (supabase as any)
    .from("purchase_items")
    .insert(purchaseItemsPayload);

  if (itemError) throw itemError;

  for (const row of rows) {
    const qty = roundMoney(safeNumber(row.quantity));
    const unitCost = roundMoney(safeNumber(row.unit_cost));

    const { data: product, error: productReadError } = await (supabase as any)
      .from("products")
      .select("id,quantity_in_stock")
      .eq("id", row.product_id)
      .single();

    if (productReadError) throw productReadError;

    const currentQty = roundMoney(safeNumber(product?.quantity_in_stock));
    const newQty = roundMoney(currentQty + qty);

    const { error: productUpdateError } = await (supabase as any)
      .from("products")
      .update({
        quantity_in_stock: newQty,
        cost_price: unitCost,
        last_cost: unitCost,
        average_cost: unitCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.product_id);

    if (productUpdateError) throw productUpdateError;
  }

  return purchase;
}

export async function fetchPurchases(args: {
  companyId: string;
  branchId?: string | null;
  supplierId?: string | null;
  paymentStatus?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { companyId, branchId, supplierId, paymentStatus, startDate, endDate } = args;

  let query = (supabase as any)
    .from("purchases")
    .select(`
      *,
      supplier:suppliers(id,name,supplier_code)
    `)
    .eq("company_id", companyId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (paymentStatus) query = query.eq("payment_status", paymentStatus);
  if (startDate) query = query.gte("purchase_date", startDate);
  if (endDate) query = query.lte("purchase_date", endDate);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as PurchaseRow[];
}

export async function fetchPurchaseDetails(args: {
  companyId: string;
  purchaseId: string;
}): Promise<PurchaseDetailsResult> {
  const { companyId, purchaseId } = args;

  const { data: purchase, error: purchaseError } = await (supabase as any)
    .from("purchases")
    .select(`
      *,
      supplier:suppliers(id,name,supplier_code,phone,email,contact_person)
    `)
    .eq("company_id", companyId)
    .eq("id", purchaseId)
    .single();

  if (purchaseError) throw purchaseError;

  const { data: items, error: itemsError } = await (supabase as any)
    .from("purchase_items")
    .select(`
      *,
      product:products(id,name)
    `)
    .eq("purchase_id", purchaseId)
    .order("created_at", { ascending: true });

  if (itemsError) throw itemsError;

  const { data: payments, error: paymentsError } = await (supabase as any)
    .from("supplier_payments")
    .select("*")
    .eq("company_id", companyId)
    .eq("purchase_id", purchaseId)
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (paymentsError) throw paymentsError;

  return {
    purchase: purchase as PurchaseRow,
    items: (items ?? []) as any,
    payments: (payments ?? []) as any,
  };
}