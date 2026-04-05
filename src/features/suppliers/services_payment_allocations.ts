import { supabase } from "@/integrations/supabase/client";

export type SupplierOpenPurchaseOption = {
  purchase_id: string;
  company_id: string;
  branch_id: string;
  supplier_id: string;
  purchase_date: string;
  invoice_number: string | null;
  reference_number: string | null;
  total_amount: number;
  supplier_credit_applied: number;
  allocated_amount: number;
  balance_due: number;
  payment_status: string;
};

export type SupplierPaymentAllocationRow = {
  allocation_id: string;
  payment_id: string;
  purchase_id: string;
  company_id: string;
  branch_id: string;
  supplier_id: string;
  allocated_amount: number;
  allocation_order: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  purchase_date: string;
  invoice_number: string | null;
  reference_number: string | null;
  purchase_total_amount: number;
};

export type SupplierPaymentBalanceRow = {
  payment_id: string;
  company_id: string;
  branch_id: string;
  supplier_id: string;
  purchase_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  allocated_amount: number;
  unallocated_amount: number;
  allocation_status: string;
};

export type AutoAllocateSupplierPaymentResult = {
  success: boolean;
  message: string;
  payment_id: string;
  allocated_count: number;
  allocated_now: number;
  remaining_unallocated: number;
};

export type RemoveSupplierPaymentAllocationResult = {
  success: boolean;
  message: string;
  allocation_id: string;
  purchase_id: string;
  payment_id: string;
};

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export async function fetchOpenSupplierPurchases(
  supplierId: string
): Promise<SupplierOpenPurchaseOption[]> {
  const { data, error } = await (supabase as any).rpc("get_open_supplier_purchases", {
    p_supplier_id: supplierId,
  });

  if (error) {
    console.error("fetchOpenSupplierPurchases error:", error);
    throw error;
  }

  return ((data ?? []) as any[]).map((row) => ({
    purchase_id: String(row.purchase_id),
    company_id: String(row.company_id),
    branch_id: String(row.branch_id),
    supplier_id: String(row.supplier_id),
    purchase_date: String(row.purchase_date),
    invoice_number: row.invoice_number ?? null,
    reference_number: row.reference_number ?? null,
    total_amount: toNumber(row.total_amount),
    supplier_credit_applied: toNumber(row.supplier_credit_applied),
    allocated_amount: toNumber(row.allocated_amount),
    balance_due: toNumber(row.balance_due),
    payment_status: String(row.payment_status ?? "unpaid"),
  }));
}

export async function fetchSupplierPaymentAllocations(
  paymentId: string
): Promise<SupplierPaymentAllocationRow[]> {
  const { data, error } = await (supabase as any).rpc("get_supplier_payment_allocations", {
    p_payment_id: paymentId,
  });

  if (error) {
    console.error("fetchSupplierPaymentAllocations error:", error);
    throw error;
  }

  return ((data ?? []) as any[]).map((row) => ({
    allocation_id: String(row.allocation_id),
    payment_id: String(row.payment_id),
    purchase_id: String(row.purchase_id),
    company_id: String(row.company_id),
    branch_id: String(row.branch_id),
    supplier_id: String(row.supplier_id),
    allocated_amount: toNumber(row.allocated_amount),
    allocation_order: toNumber(row.allocation_order),
    notes: row.notes ?? null,
    created_by: row.created_by ?? null,
    created_at: String(row.created_at),
    purchase_date: String(row.purchase_date),
    invoice_number: row.invoice_number ?? null,
    reference_number: row.reference_number ?? null,
    purchase_total_amount: toNumber(row.purchase_total_amount),
  }));
}

export async function fetchSupplierPaymentBalance(
  paymentId: string
): Promise<SupplierPaymentBalanceRow | null> {
  const { data, error } = await (supabase as any).rpc("get_supplier_payment_balance", {
    p_payment_id: paymentId,
  });

  if (error) {
    console.error("fetchSupplierPaymentBalance error:", error);
    throw error;
  }

  const row = (data ?? [])[0];
  if (!row) return null;

  return {
    payment_id: String(row.payment_id),
    company_id: String(row.company_id),
    branch_id: String(row.branch_id),
    supplier_id: String(row.supplier_id),
    purchase_id: row.purchase_id ? String(row.purchase_id) : null,
    payment_date: String(row.payment_date),
    amount: toNumber(row.amount),
    payment_method: row.payment_method ?? null,
    reference_number: row.reference_number ?? null,
    notes: row.notes ?? null,
    allocated_amount: toNumber(row.allocated_amount),
    unallocated_amount: toNumber(row.unallocated_amount),
    allocation_status: String(row.allocation_status ?? "unallocated"),
  };
}

export async function autoAllocateSupplierPayment(
  paymentId: string
): Promise<AutoAllocateSupplierPaymentResult> {
  const before = await fetchSupplierPaymentBalance(paymentId);

  const { data, error } = await (supabase as any).rpc("auto_allocate_supplier_payment", {
    p_supplier_payment_id: paymentId,
  });

  if (error) {
    console.error("autoAllocateSupplierPayment error:", error);
    throw error;
  }

  const after = await fetchSupplierPaymentBalance(paymentId);
  const allocatedCount = toNumber(data);
  const allocatedNow = Math.max(
    0,
    toNumber(before?.unallocated_amount) - toNumber(after?.unallocated_amount)
  );

  return {
    success: true,
    message:
      allocatedCount > 0
        ? `Auto allocation completed. ${allocatedCount} purchase(s) updated.`
        : "No open purchase balance was available for allocation.",
    payment_id: paymentId,
    allocated_count: allocatedCount,
    allocated_now: allocatedNow,
    remaining_unallocated: toNumber(after?.unallocated_amount),
  };
}

export async function allocateSupplierPaymentToPurchase(args: {
  paymentId: string;
  purchaseId: string;
  amount: number;
  notes?: string | null;
}) {
  const { data, error } = await (supabase as any).rpc("allocate_supplier_payment_to_purchase", {
    p_payment_id: args.paymentId,
    p_purchase_id: args.purchaseId,
    p_allocated_amount: args.amount,
    p_notes: args.notes ?? null,
  });

  if (error) {
    console.error("allocateSupplierPaymentToPurchase error:", error);
    throw error;
  }

  return data;
}

export async function removeSupplierPaymentAllocation(
  allocationId: string
): Promise<RemoveSupplierPaymentAllocationResult> {
  const { data, error } = await (supabase as any).rpc("remove_supplier_payment_allocation", {
    p_allocation_id: allocationId,
  });

  if (error) {
    console.error("removeSupplierPaymentAllocation error:", error);
    throw error;
  }

  const row = (data ?? {}) as any;

  return {
    success: Boolean(row.success),
    message: String(row.message ?? ""),
    allocation_id: String(row.allocation_id ?? allocationId),
    purchase_id: String(row.purchase_id ?? ""),
    payment_id: String(row.payment_id ?? ""),
  };
}