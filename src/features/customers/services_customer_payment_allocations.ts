import { supabase } from "@/integrations/supabase/client";

/** ================================
 * TYPES
 * ================================ */

export type CustomerOpenSaleOption = {
  sale_id: string;
  company_id: string;
  branch_id: string;
  customer_id: string;
  created_at: string;
  receipt_number: string | null;
  total_amount: number;
  allocated_amount: number;
  balance_due: number;
  payment_status: string;
};

export type CustomerPaymentAllocationRow = {
  allocation_id: string;
  payment_id: string;
  sale_id: string;
  company_id: string;
  branch_id: string;
  customer_id: string;
  allocated_amount: number;
  allocation_order: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  receipt_number: string | null;
  sale_total_amount: number;
};

export type CustomerPaymentBalanceRow = {
  payment_id: string;
  company_id: string;
  branch_id: string | null;
  customer_id: string;
  sale_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  allocated_amount: number;
  unallocated_amount: number;
  allocation_status: string;
};

export type AutoAllocateCustomerPaymentResult = {
  success: boolean;
  message: string;
  payment_id: string;
  allocated_count: number;
  allocated_now: number;
  remaining_unallocated: number;
};

export type RemoveCustomerPaymentAllocationResult = {
  success: boolean;
  message: string;
  allocation_id: string;
  sale_id: string;
  payment_id: string;
};

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** ================================
 * FETCH OPEN SALES FOR CUSTOMER
 * ================================ */

export async function fetchOpenCustomerSales(
  customerId: string
): Promise<CustomerOpenSaleOption[]> {
  const { data, error } = await (supabase as any)
    .from("customer_sale_balance_view")
    .select(`
      id,
      company_id,
      branch_id,
      customer_id,
      created_at,
      receipt_number,
      total_amount,
      allocated_amount,
      computed_balance_due,
      computed_payment_status
    `)
    .eq("customer_id", customerId)
    .gt("computed_balance_due", 0)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchOpenCustomerSales error:", error);
    throw error;
  }

  return ((data ?? []) as any[]).map((row) => ({
    sale_id: String(row.id),
    company_id: String(row.company_id),
    branch_id: String(row.branch_id),
    customer_id: String(row.customer_id),
    created_at: String(row.created_at),
    receipt_number: row.receipt_number ?? null,
    total_amount: toNumber(row.total_amount),
    allocated_amount: toNumber(row.allocated_amount),
    balance_due: toNumber(row.computed_balance_due),
    payment_status: String(row.computed_payment_status ?? "credit"),
  }));
}

/** ================================
 * FETCH PAYMENT ALLOCATION HISTORY
 * ================================ */

export async function fetchCustomerPaymentAllocations(
  paymentId: string
): Promise<CustomerPaymentAllocationRow[]> {
  const { data, error } = await (supabase as any)
    .from("customer_payment_allocations")
    .select(`
      id,
      payment_id,
      sale_id,
      company_id,
      branch_id,
      customer_id,
      allocated_amount,
      allocation_order,
      notes,
      created_by,
      created_at,
      sale:sales (
        receipt_number,
        total_amount
      )
    `)
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: true })
    .order("allocation_order", { ascending: true });

  if (error) {
    console.error("fetchCustomerPaymentAllocations error:", error);
    throw error;
  }

  return ((data ?? []) as any[]).map((row) => ({
    allocation_id: String(row.id),
    payment_id: String(row.payment_id),
    sale_id: String(row.sale_id),
    company_id: String(row.company_id),
    branch_id: String(row.branch_id),
    customer_id: String(row.customer_id),
    allocated_amount: toNumber(row.allocated_amount),
    allocation_order: toNumber(row.allocation_order),
    notes: row.notes ?? null,
    created_by: row.created_by ?? null,
    created_at: String(row.created_at),
    receipt_number: row.sale?.receipt_number ?? null,
    sale_total_amount: toNumber(row.sale?.total_amount),
  }));
}

/** ================================
 * FETCH SINGLE PAYMENT BALANCE
 * ================================ */

export async function fetchCustomerPaymentBalance(
  paymentId: string
): Promise<CustomerPaymentBalanceRow | null> {
  const { data, error } = await (supabase as any)
    .from("customer_payment_balance_view")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    console.error("fetchCustomerPaymentBalance error:", error);
    throw error;
  }

  if (!data) return null;

  return {
    payment_id: String(data.id),
    company_id: String(data.company_id),
    branch_id: data.branch_id ? String(data.branch_id) : null,
    customer_id: String(data.customer_id),
    sale_id: data.sale_id ? String(data.sale_id) : null,
    payment_date: String(data.payment_date),
    amount: toNumber(data.amount),
    payment_method: data.payment_method ?? null,
    reference_number: data.reference_number ?? null,
    notes: data.notes ?? null,
    allocated_amount: toNumber(data.allocated_amount),
    unallocated_amount: toNumber(data.unallocated_amount),
    allocation_status: String(data.allocation_status ?? "unallocated"),
  };
}

/** ================================
 * AUTO ALLOCATE PAYMENT
 * ================================ */

export async function autoAllocateCustomerPayment(
  paymentId: string
): Promise<AutoAllocateCustomerPaymentResult> {
  const { data, error } = await (supabase as any).rpc(
    "auto_allocate_customer_payment",
    {
      p_payment_id: paymentId,
    }
  );

  if (error) {
    console.error("autoAllocateCustomerPayment error:", error);
    throw error;
  }

  const row = (data ?? {}) as any;

  return {
    success: Boolean(row.success),
    message: String(row.message ?? ""),
    payment_id: String(row.payment_id ?? paymentId),
    allocated_count: toNumber(row.allocated_count),
    allocated_now: toNumber(row.allocated_now),
    remaining_unallocated: toNumber(row.remaining_unallocated),
  };
}

/** ================================
 * MANUAL ALLOCATION
 * ================================ */

export async function allocateCustomerPaymentToSale(args: {
  paymentId: string;
  saleId: string;
  amount: number;
  notes?: string | null;
}) {
  const { data, error } = await (supabase as any).rpc(
    "allocate_customer_payment_to_sale",
    {
      p_payment_id: args.paymentId,
      p_sale_id: args.saleId,
      p_allocated_amount: args.amount,
      p_notes: args.notes ?? null,
    }
  );

  if (error) {
    console.error("allocateCustomerPaymentToSale error:", error);
    throw error;
  }

  return data;
}

/** ================================
 * REMOVE ALLOCATION
 * ================================ */

export async function removeCustomerPaymentAllocation(
  allocationId: string
): Promise<RemoveCustomerPaymentAllocationResult> {
  const { data, error } = await (supabase as any).rpc(
    "remove_customer_payment_allocation",
    {
      p_allocation_id: allocationId,
    }
  );

  if (error) {
    console.error("removeCustomerPaymentAllocation error:", error);
    throw error;
  }

  const row = (data ?? {}) as any;

  return {
    success: Boolean(row.success),
    message: String(row.message ?? ""),
    allocation_id: String(row.allocation_id ?? allocationId),
    sale_id: String(row.sale_id ?? ""),
    payment_id: String(row.payment_id ?? ""),
  };
}