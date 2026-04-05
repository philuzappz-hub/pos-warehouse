import { supabase } from "@/integrations/supabase/client";

export type SupplierPaymentStatementRow = {
  id: string;
  payment_date: string;
  supplier_id: string;
  branch_id: string | null;
  purchase_id: string | null;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  amount: number;
  created_at: string | null;

  allocated_amount: number;
  unallocated_amount: number;
  allocation_status: string;

  supplier_name: string;
  supplier_code: string | null;
  branch_name: string | null;
  purchase_reference: string | null;
};

export type SupplierPaymentStatementSummary = {
  totalPayments: number;
  cashPayments: number;
  momoPayments: number;
  bankTransferPayments: number;
  cardPayments: number;
  linkedPayments: number;
  unallocatedPayments: number;
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeMethod(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Payment statement rows are PAYMENT records only.
 * They are useful for payment-history tables, payment method totals,
 * and allocation visibility.
 *
 * They are NOT the source of truth for supplier statement summary cards.
 * Supplier statement cards must come from the reconciled supplier snapshot /
 * statement ledger, because credit_applied and overpayment_credit movements
 * are not fully represented by this payment-only view.
 */
export async function fetchSupplierPaymentStatement(args: {
  companyId: string;
  supplierId?: string | null;
  branchId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  paymentMethod?: string | null;
  referenceSearch?: string | null;
}) {
  const {
    companyId,
    supplierId,
    branchId,
    startDate,
    endDate,
    paymentMethod,
    referenceSearch,
  } = args;

  let query = (supabase as any)
    .from("supplier_payment_balance_view")
    .select(
      `
      id,
      payment_date,
      supplier_id,
      branch_id,
      purchase_id,
      payment_method,
      reference_number,
      notes,
      amount,
      created_at,
      allocated_amount,
      unallocated_amount,
      allocation_status
    `
    )
    .eq("company_id", companyId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (branchId) query = query.eq("branch_id", branchId);
  if (startDate) query = query.gte("payment_date", startDate);
  if (endDate) query = query.lte("payment_date", endDate);

  if (paymentMethod && paymentMethod !== "all") {
    query = query.eq("payment_method", paymentMethod);
  }

  if (referenceSearch?.trim()) {
    const needle = referenceSearch.trim();
    query = query.or(`reference_number.ilike.%${needle}%,notes.ilike.%${needle}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const baseRows = data ?? [];
  const supplierIds = Array.from(
    new Set(baseRows.map((row: any) => row.supplier_id).filter(Boolean))
  );
  const branchIds = Array.from(
    new Set(baseRows.map((row: any) => row.branch_id).filter(Boolean))
  );
  const purchaseIds = Array.from(
    new Set(baseRows.map((row: any) => row.purchase_id).filter(Boolean))
  );

  const [suppliersRes, branchesRes, purchasesRes] = await Promise.all([
    supplierIds.length
      ? (supabase as any)
          .from("suppliers")
          .select("id,name,supplier_code")
          .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),

    branchIds.length
      ? (supabase as any)
          .from("branches")
          .select("id,name")
          .in("id", branchIds)
      : Promise.resolve({ data: [], error: null }),

    purchaseIds.length
      ? (supabase as any)
          .from("purchases")
          .select("id,invoice_number,reference_number")
          .in("id", purchaseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (suppliersRes.error) throw suppliersRes.error;
  if (branchesRes.error) throw branchesRes.error;
  if (purchasesRes.error) throw purchasesRes.error;

  const supplierMap = new Map<string, any>(
    (suppliersRes.data ?? []).map((row: any) => [row.id, row])
  );
  const branchMap = new Map<string, any>(
    (branchesRes.data ?? []).map((row: any) => [row.id, row])
  );
  const purchaseMap = new Map<string, any>(
    (purchasesRes.data ?? []).map((row: any) => [row.id, row])
  );

  const rows: SupplierPaymentStatementRow[] = baseRows.map((row: any) => {
    const supplier = supplierMap.get(row.supplier_id);
    const branch = row.branch_id ? branchMap.get(row.branch_id) : null;
    const purchase = row.purchase_id ? purchaseMap.get(row.purchase_id) : null;

    return {
      id: row.id,
      payment_date: row.payment_date,
      supplier_id: row.supplier_id,
      branch_id: row.branch_id,
      purchase_id: row.purchase_id,
      payment_method: row.payment_method,
      reference_number: row.reference_number,
      notes: row.notes,
      amount: roundMoney(row.amount),
      created_at: row.created_at,
      allocated_amount: roundMoney(row.allocated_amount),
      unallocated_amount: roundMoney(row.unallocated_amount),
      allocation_status: row.allocation_status || "unallocated",
      supplier_name: supplier?.name || "Unknown Supplier",
      supplier_code: supplier?.supplier_code || null,
      branch_name: branch?.name || null,
      purchase_reference:
        purchase?.invoice_number || purchase?.reference_number || null,
    };
  });

  const summary: SupplierPaymentStatementSummary = rows.reduce(
    (acc, row) => {
      const amount = roundMoney(row.amount);
      const method = normalizeMethod(row.payment_method);

      acc.totalPayments = roundMoney(acc.totalPayments + amount);

      if (method === "cash") {
        acc.cashPayments = roundMoney(acc.cashPayments + amount);
      } else if (method === "momo") {
        acc.momoPayments = roundMoney(acc.momoPayments + amount);
      } else if (method === "bank transfer" || method === "bank") {
        acc.bankTransferPayments = roundMoney(acc.bankTransferPayments + amount);
      } else if (method === "card") {
        acc.cardPayments = roundMoney(acc.cardPayments + amount);
      }

      acc.linkedPayments = roundMoney(acc.linkedPayments + roundMoney(row.allocated_amount));
      acc.unallocatedPayments = roundMoney(
        acc.unallocatedPayments + roundMoney(row.unallocated_amount)
      );

      return acc;
    },
    {
      totalPayments: 0,
      cashPayments: 0,
      momoPayments: 0,
      bankTransferPayments: 0,
      cardPayments: 0,
      linkedPayments: 0,
      unallocatedPayments: 0,
    }
  );

  return { rows, summary };
}