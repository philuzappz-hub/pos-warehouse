import {
  normalizeOptionalText,
  normalizeText,
  roundMoney,
  safeNumber,
} from "@/features/suppliers/helpers";
import type {
  SupplierFormValues,
  SupplierPaymentFormValues,
  SupplierPaymentRow,
  SupplierRow,
  SupplierStatementEntry,
} from "@/features/suppliers/types";
import { supabase } from "@/integrations/supabase/client";

export type SupplierAccountSnapshot = {
  supplierId: string;
  totalPurchases: number;
  outstandingPurchases: number;
  totalPayments: number;
  totalUnallocatedPayments: number;
  totalOverpaymentCredits: number;
  totalCreditsApplied: number;
  creditPool: number;
  availableCredit: number;
  netPayable: number;
  closingBalance: number;
};

type PurchaseBalanceRow = {
  id: string;
  purchase_date: string;
  invoice_number: string | null;
  reference_number: string | null;
  total_amount: number | string | null;
  supplier_credit_applied: number | string | null;
  allocated_amount: number | string | null;
  computed_balance_due: number | string | null;
  stock_status?: string | null;
};

type PaymentBalanceRow = {
  id: string;
  payment_date: string;
  reference_number: string | null;
  amount: number | string | null;
  notes: string | null;
  purchase_id: string | null;
  allocated_amount: number | string | null;
  unallocated_amount: number | string | null;
  allocation_status: string | null;
  payment_method: string | null;
  created_at?: string | null;
};

type SnapshotRpcRow = {
  supplier_id: string;
  total_purchases: number | string | null;
  outstanding_purchases: number | string | null;
  total_payments: number | string | null;
  total_unallocated_payments: number | string | null;
  total_overpayment_credits: number | string | null;
  total_credits_applied: number | string | null;
  credit_pool: number | string | null;
  available_credit: number | string | null;
  net_payable: number | string | null;
  closing_balance: number | string | null;
};

function toMoney(value: unknown) {
  return roundMoney(safeNumber(value));
}

function refLabel(row: { invoice_number?: string | null; reference_number?: string | null }) {
  return row.invoice_number || row.reference_number || "—";
}

function statementTypeOrder(entryType: SupplierStatementEntry["entry_type"]) {
  switch (entryType) {
    case "opening_balance":
      return 0;
    case "purchase":
      return 1;
    case "payment":
      return 2;
    case "credit_applied":
      return 3;
    case "overpayment_credit":
      return 4;
    default:
      return 99;
  }
}

export async function fetchSuppliers(args: {
  companyId: string;
  branchId?: string | null;
  includeAllBranches?: boolean;
}) {
  const { companyId, branchId, includeAllBranches = true } = args;

  let query = (supabase as any)
    .from("suppliers")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (!includeAllBranches && branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SupplierRow[];
}

export async function createSupplier(args: {
  companyId: string;
  userId: string | null;
  values: SupplierFormValues;
}) {
  const { companyId, userId, values } = args;

  const payload = {
    company_id: companyId,
    branch_id: values.branch_id === "all" ? null : values.branch_id,
    supplier_code: normalizeOptionalText(values.supplier_code),
    name: normalizeText(values.name),
    contact_person: normalizeOptionalText(values.contact_person),
    phone: normalizeOptionalText(values.phone),
    alt_phone: normalizeOptionalText(values.alt_phone),
    email: normalizeOptionalText(values.email),
    address: normalizeOptionalText(values.address),
    notes: normalizeOptionalText(values.notes),
    opening_balance: roundMoney(safeNumber(values.opening_balance)),
    is_active: Boolean(values.is_active),
    created_by: userId,
  };

  const { data, error } = await (supabase as any)
    .from("suppliers")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data as SupplierRow;
}

export async function updateSupplier(args: {
  supplierId: string;
  values: SupplierFormValues;
}) {
  const { supplierId, values } = args;

  const payload = {
    branch_id: values.branch_id === "all" ? null : values.branch_id,
    supplier_code: normalizeOptionalText(values.supplier_code),
    name: normalizeText(values.name),
    contact_person: normalizeOptionalText(values.contact_person),
    phone: normalizeOptionalText(values.phone),
    alt_phone: normalizeOptionalText(values.alt_phone),
    email: normalizeOptionalText(values.email),
    address: normalizeOptionalText(values.address),
    notes: normalizeOptionalText(values.notes),
    opening_balance: roundMoney(safeNumber(values.opening_balance)),
    is_active: Boolean(values.is_active),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase as any)
    .from("suppliers")
    .update(payload)
    .eq("id", supplierId)
    .select("*")
    .single();

  if (error) throw error;
  return data as SupplierRow;
}

export async function fetchSupplierAccountSnapshot(args: {
  companyId: string;
  supplierId: string;
}): Promise<SupplierAccountSnapshot> {
  const { companyId, supplierId } = args;

  const { data, error } = await (supabase as any).rpc(
    "get_supplier_account_snapshot_v2",
    {
      p_company_id: companyId,
      p_supplier_id: supplierId,
    }
  );

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as SnapshotRpcRow | undefined;

  if (!row) {
    return {
      supplierId,
      totalPurchases: 0,
      outstandingPurchases: 0,
      totalPayments: 0,
      totalUnallocatedPayments: 0,
      totalOverpaymentCredits: 0,
      totalCreditsApplied: 0,
      creditPool: 0,
      availableCredit: 0,
      netPayable: 0,
      closingBalance: 0,
    };
  }

  return {
    supplierId: row.supplier_id || supplierId,
    totalPurchases: toMoney(row.total_purchases),
    outstandingPurchases: toMoney(row.outstanding_purchases),
    totalPayments: toMoney(row.total_payments),
    totalUnallocatedPayments: toMoney(row.total_unallocated_payments),
    totalOverpaymentCredits: toMoney(row.total_overpayment_credits),
    totalCreditsApplied: toMoney(row.total_credits_applied),
    creditPool: toMoney(row.credit_pool),
    availableCredit: toMoney(row.available_credit),
    netPayable: toMoney(row.net_payable),
    closingBalance: toMoney(row.closing_balance),
  };
}

export async function fetchSupplierStatement(args: {
  companyId: string;
  supplierId: string;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { companyId, supplierId, startDate, endDate } = args;

  const { data: supplier, error: supplierError } = await (supabase as any)
    .from("suppliers")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", supplierId)
    .single();

  if (supplierError) throw supplierError;

  const snapshot = await fetchSupplierAccountSnapshot({ companyId, supplierId });

  let purchasesQuery = (supabase as any)
    .from("supplier_purchase_balance_view")
    .select(`
      id,
      purchase_date,
      invoice_number,
      reference_number,
      total_amount,
      supplier_credit_applied,
      allocated_amount,
      computed_balance_due,
      stock_status
    `)
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .neq("stock_status", "cancelled")
    .order("purchase_date", { ascending: true })
    .order("id", { ascending: true });

  if (startDate) purchasesQuery = purchasesQuery.gte("purchase_date", startDate);
  if (endDate) purchasesQuery = purchasesQuery.lte("purchase_date", endDate);

  const { data: purchases, error: purchasesError } = await purchasesQuery;
  if (purchasesError) throw purchasesError;

  type EntrySeed = Omit<SupplierStatementEntry, "running_balance">;

  const seeds: EntrySeed[] = [];
  const openingBalance = toMoney((supplier as any)?.opening_balance);

  if (openingBalance !== 0) {
    seeds.push({
      id: `opening-${supplier.id}`,
      entry_type: "opening_balance",
      entry_date: startDate || "0001-01-01",
      reference: "Opening Balance",
      description: "Opening supplier balance",
      debit: openingBalance > 0 ? openingBalance : 0,
      credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
    });
  }

  for (const row of (purchases ?? []) as PurchaseBalanceRow[]) {
    const purchaseAmount = toMoney(row.total_amount);
    const cashApplied = toMoney(row.allocated_amount);
    const creditApplied = toMoney(row.supplier_credit_applied);
    const reference = refLabel(row);

    seeds.push({
      id: `purchase-${row.id}`,
      entry_type: "purchase",
      entry_date: row.purchase_date,
      reference,
      description: "Purchase recorded",
      debit: purchaseAmount,
      credit: 0,
    });

    if (cashApplied > 0) {
      seeds.push({
        id: `payment-${row.id}`,
        entry_type: "payment",
        entry_date: row.purchase_date,
        reference,
        description: "Cash applied to purchase",
        debit: 0,
        credit: cashApplied,
      });
    }

    if (creditApplied > 0) {
      seeds.push({
        id: `credit-applied-${row.id}`,
        entry_type: "credit_applied",
        entry_date: row.purchase_date,
        reference,
        description: "Supplier credit applied to purchase",
        debit: 0,
        credit: creditApplied,
      });
    }
  }

  seeds.sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date.localeCompare(b.entry_date);
    const typeCompare = statementTypeOrder(a.entry_type) - statementTypeOrder(b.entry_type);
    if (typeCompare !== 0) return typeCompare;
    return a.id.localeCompare(b.id);
  });

  let runningBalance = 0;
  const entries: SupplierStatementEntry[] = seeds.map((entry) => {
    runningBalance = toMoney(runningBalance + toMoney(entry.debit) - toMoney(entry.credit));
    return { ...entry, running_balance: runningBalance };
  });

  return {
    supplier: supplier as SupplierRow,
    entries,
    snapshot,
  };
}

export async function fetchSupplierPayments(args: {
  companyId: string;
  supplierId?: string | null;
  branchId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { companyId, supplierId, branchId, startDate, endDate } = args;

  let query = (supabase as any)
    .from("supplier_payments")
    .select(`
      *,
      supplier:suppliers(id,name,supplier_code)
    `)
    .eq("company_id", companyId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (branchId) query = query.eq("branch_id", branchId);
  if (startDate) query = query.gte("payment_date", startDate);
  if (endDate) query = query.lte("payment_date", endDate);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as SupplierPaymentRow[];
}

export async function createSupplierPayment(args: {
  companyId: string;
  userId: string | null;
  values: SupplierPaymentFormValues;
}) {
  const { companyId, userId, values } = args;

  const paymentAmount = roundMoney(safeNumber(values.amount));
  const purchaseId = values.purchase_id === "none" ? null : values.purchase_id;

  if (paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (purchaseId) {
    const { data: purchase, error: purchaseReadError } = await (supabase as any)
      .from("supplier_purchase_balance_view")
      .select("id,company_id,supplier_id,computed_balance_due")
      .eq("company_id", companyId)
      .eq("id", purchaseId)
      .single();

    if (purchaseReadError) throw purchaseReadError;
    if (!purchase) throw new Error("Selected purchase was not found.");
    if (String(purchase.supplier_id) !== String(values.supplier_id)) {
      throw new Error("Selected purchase does not belong to the chosen supplier.");
    }

    const currentBalance = roundMoney(safeNumber(purchase.computed_balance_due));
    if (paymentAmount > currentBalance) {
      throw new Error(
        `Payment amount cannot exceed purchase balance. Current balance is ${currentBalance}.`
      );
    }
  }

  const payload = {
    company_id: companyId,
    branch_id: values.branch_id,
    supplier_id: values.supplier_id,
    purchase_id: purchaseId,
    payment_date: values.payment_date,
    amount: paymentAmount,
    payment_method: normalizeText(values.payment_method),
    reference_number: normalizeOptionalText(values.reference_number),
    notes: normalizeOptionalText(values.notes),
    recorded_by: userId,
  };

  const { data, error } = await (supabase as any)
    .from("supplier_payments")
    .insert(payload)
    .select(`
      *,
      supplier:suppliers(id,name,supplier_code)
    `)
    .single();

  if (error) throw error;

  if (purchaseId) {
    const { error: allocationError } = await (supabase as any).rpc(
      "apply_supplier_payment_allocation",
      {
        p_supplier_payment_id: data.id,
        p_purchase_id: purchaseId,
        p_allocated_amount: paymentAmount,
        p_notes: normalizeOptionalText(values.notes) || "Direct payment allocation",
      }
    );

    if (allocationError) throw allocationError;
  }

  return data as SupplierPaymentRow;
}

export async function fetchSupplierOpenPurchases(args: {
  companyId: string;
  supplierId: string;
}) {
  const { companyId, supplierId } = args;

  const { data, error } = await (supabase as any)
    .from("supplier_purchase_balance_view")
    .select(`
      id,
      purchase_date,
      invoice_number,
      reference_number,
      total_amount,
      allocated_amount,
      supplier_credit_applied,
      computed_balance_due
    `)
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .gt("computed_balance_due", 0)
    .order("purchase_date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    purchase_date: row.purchase_date,
    invoice_number: row.invoice_number,
    reference_number: row.reference_number,
    total_amount: toMoney(row.total_amount),
    amount_paid: toMoney(row.allocated_amount),
    supplier_credit_applied: toMoney(row.supplier_credit_applied),
    balance_due: toMoney(row.computed_balance_due),
  }));
}
