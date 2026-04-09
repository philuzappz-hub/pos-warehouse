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

type SupplierPaymentBalanceRow = {
  id: string;
  payment_date: string | null;
  created_at?: string | null;
  amount: number | string | null;
  allocated_amount: number | string | null;
  unallocated_amount: number | string | null;
  allocation_status?: string | null;
};

export type SupplierCreditNoteRow = {
  id: string;
  credit_date: string | null;
  created_at?: string | null;
  amount: number | string | null;
  reference_number: string | null;
  reason: string | null;
  notes: string | null;
  status?: string | null;
};

export type SupplierCreditNoteAllocationRow = {
  id: string;
  purchase_id: string;
  allocation_date: string | null;
  created_at?: string | null;
  allocated_amount: number | string | null;
  notes: string | null;
  supplier_credit_note_id: string;
  credit_note?: {
    id: string;
    credit_date?: string | null;
    reference_number?: string | null;
    reason?: string | null;
  } | null;
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

export type SupplierAutoSettlePreview = {
  outstandingAmount: number;
  paymentAmount: number;
  willAllocate: number;
  willRemainAsCredit: number;
};

export type SupplierAutoSettleResult = {
  allocatedTotal: number;
  remainingCredit: number;
  allocationsCount: number;
};

export type SupplierCreditApplyResult = {
  success: boolean;
  message: string;
  appliedAmount: number;
  allocationCount: number;
  remainingBalance: number;
};

export type FetchSupplierStatementResult = {
  supplier: SupplierRow;
  entries: SupplierStatementEntry[];
  snapshot: SupplierAccountSnapshot;
  creditNotes: SupplierCreditNoteRow[];
  creditNoteAllocations: SupplierCreditNoteAllocationRow[];
};

type SupplierPaymentCreateArgs = {
  companyId: string;
  userId: string | null;
  values: SupplierPaymentFormValues;
};

type EntrySeed = Omit<SupplierStatementEntry, "running_balance"> & {
  sortKey?: string;
  affects_running_balance?: boolean;
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
    case "credit_note_issued":
      return 5;
    case "credit_note_applied":
      return 6;
    default:
      return 99;
  }
}

function sortOpenPurchasesOldestFirst<T extends { purchase_date: string; id: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    if (a.purchase_date !== b.purchase_date) {
      return String(a.purchase_date).localeCompare(String(b.purchase_date));
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

async function getPurchaseBalanceForPayment(args: {
  companyId: string;
  purchaseId: string;
  supplierId: string;
}) {
  const { companyId, purchaseId, supplierId } = args;

  const { data: purchase, error: purchaseReadError } = await (supabase as any)
    .from("supplier_purchase_balance_view")
    .select("id,company_id,supplier_id,computed_balance_due")
    .eq("company_id", companyId)
    .eq("id", purchaseId)
    .single();

  if (purchaseReadError) throw purchaseReadError;
  if (!purchase) throw new Error("Selected purchase was not found.");
  if (String(purchase.supplier_id) !== String(supplierId)) {
    throw new Error("Selected purchase does not belong to the chosen supplier.");
  }

  return {
    purchaseId: String(purchase.id),
    currentBalance: roundMoney(safeNumber(purchase.computed_balance_due)),
  };
}

async function insertSupplierPayment(args: SupplierPaymentCreateArgs) {
  const { companyId, userId, values } = args;

  const paymentAmount = roundMoney(safeNumber(values.amount));
  const purchaseId = values.purchase_id === "none" ? null : values.purchase_id;

  if (paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (purchaseId) {
    const { currentBalance } = await getPurchaseBalanceForPayment({
      companyId,
      purchaseId,
      supplierId: values.supplier_id,
    });

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

export async function applyAvailableCreditToPurchase(args: {
  purchaseId: string;
}): Promise<SupplierCreditApplyResult> {
  const { purchaseId } = args;

  const { data, error } = await (supabase as any).rpc("apply_supplier_credit_to_purchase", {
    p_purchase_id: purchaseId,
  });

  if (error) throw error;

  const row = (data ?? {}) as any;

  return {
    success: Boolean(row.success),
    message: String(row.message ?? ""),
    appliedAmount: toMoney(row.applied_amount),
    allocationCount: toMoney(row.allocation_count),
    remainingBalance: toMoney(row.remaining_balance),
  };
}

export async function fetchSupplierStatement(args: {
  companyId: string;
  supplierId: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<FetchSupplierStatementResult> {
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

  let paymentBalanceQuery = (supabase as any)
    .from("supplier_payment_balance_view")
    .select(`
      id,
      payment_date,
      created_at,
      amount,
      allocated_amount,
      unallocated_amount,
      allocation_status
    `)
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (startDate) paymentBalanceQuery = paymentBalanceQuery.gte("payment_date", startDate);
  if (endDate) paymentBalanceQuery = paymentBalanceQuery.lte("payment_date", endDate);

  const { data: paymentBalances, error: paymentBalancesError } = await paymentBalanceQuery;
  if (paymentBalancesError) throw paymentBalancesError;

  let creditNotesQuery = (supabase as any)
    .from("supplier_credit_notes")
    .select(`
      id,
      credit_date,
      created_at,
      amount,
      reference_number,
      reason,
      notes,
      status
    `)
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .neq("status", "cancelled")
    .order("credit_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (startDate) creditNotesQuery = creditNotesQuery.gte("credit_date", startDate);
  if (endDate) creditNotesQuery = creditNotesQuery.lte("credit_date", endDate);

  const { data: creditNotes, error: creditNotesError } = await creditNotesQuery;
  if (creditNotesError) throw creditNotesError;

  let creditNoteAllocationsQuery = (supabase as any)
    .from("supplier_credit_note_allocations")
    .select(`
      id,
      purchase_id,
      allocation_date,
      created_at,
      allocated_amount,
      notes,
      supplier_credit_note_id
    `)
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .order("allocation_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (startDate) creditNoteAllocationsQuery = creditNoteAllocationsQuery.gte("allocation_date", startDate);
  if (endDate) creditNoteAllocationsQuery = creditNoteAllocationsQuery.lte("allocation_date", endDate);

  const { data: creditNoteAllocationsRaw, error: creditNoteAllocationsError } =
    await creditNoteAllocationsQuery;
  if (creditNoteAllocationsError) throw creditNoteAllocationsError;

  const creditNoteAllocations =
    (creditNoteAllocationsRaw ?? []) as SupplierCreditNoteAllocationRow[];

  const creditNoteIds = Array.from(
    new Set(
      creditNoteAllocations
        .map((row) => String(row.supplier_credit_note_id || ""))
        .filter(Boolean)
    )
  );

  let creditNoteMap = new Map<
    string,
    {
      id: string;
      credit_date?: string | null;
      reference_number?: string | null;
      reason?: string | null;
    }
  >();

  if (creditNoteIds.length > 0) {
    const { data: relatedCreditNotes, error: relatedCreditNotesError } = await (supabase as any)
      .from("supplier_credit_notes")
      .select("id,credit_date,reference_number,reason")
      .in("id", creditNoteIds);

    if (relatedCreditNotesError) throw relatedCreditNotesError;

    creditNoteMap = new Map(
      (relatedCreditNotes ?? []).map((row: any) => [
        String(row.id),
        {
          id: String(row.id),
          credit_date: row.credit_date || null,
          reference_number: row.reference_number || null,
          reason: row.reason || null,
        },
      ])
    );
  }

  const allocationsWithCredit: SupplierCreditNoteAllocationRow[] = creditNoteAllocations.map(
    (row) => ({
      ...row,
      credit_note: creditNoteMap.get(String(row.supplier_credit_note_id)) || null,
    })
  );

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
      sortKey: "0000",
      affects_running_balance: true,
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
      sortKey: `purchase-${row.id}`,
      affects_running_balance: true,
    });

    if (cashApplied > 0) {
      seeds.push({
        id: `payment-allocated-${row.id}`,
        entry_type: "payment",
        entry_date: row.purchase_date,
        reference,
        description: "Payment allocated to purchase",
        debit: 0,
        credit: cashApplied,
        sortKey: `payment-allocated-${row.id}`,
        affects_running_balance: true,
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
        sortKey: `credit-applied-${row.id}`,
        affects_running_balance: false,
      });
    }
  }

  for (const payment of (paymentBalances ?? []) as SupplierPaymentBalanceRow[]) {
    const unallocatedAmount = toMoney(payment.unallocated_amount);
    if (unallocatedAmount <= 0) continue;

    const paymentDate = String(payment.payment_date || "");
    const paymentId = String(payment.id || "");
    const createdAt = String(payment.created_at || "");

    seeds.push({
      id: `payment-unallocated-${paymentId}`,
      entry_type: "payment",
      entry_date: paymentDate,
      reference: "Payment Credit",
      description: "General supplier payment kept as available credit",
      debit: 0,
      credit: unallocatedAmount,
      sortKey: `payment-unallocated-${paymentDate}-${createdAt}-${paymentId}`,
      affects_running_balance: true,
    });
  }

  for (const creditNote of (creditNotes ?? []) as SupplierCreditNoteRow[]) {
    const amount = toMoney(creditNote.amount);
    if (amount <= 0) continue;

    const creditDate = String(creditNote.credit_date || "");
    const creditId = String(creditNote.id || "");
    const createdAt = String(creditNote.created_at || "");
    const reference = creditNote.reference_number || `Credit Note ${creditId}`;
    const reasonText = creditNote.reason ? ` • ${creditNote.reason}` : "";

    seeds.push({
      id: `credit-note-issued-${creditId}`,
      entry_type: "credit_note_issued",
      entry_date: creditDate,
      reference,
      description: `Supplier credit note issued${reasonText}`,
      debit: 0,
      credit: amount,
      sortKey: `credit-note-issued-${creditDate}-${createdAt}-${creditId}`,
      affects_running_balance: true,
    });
  }

  for (const allocation of allocationsWithCredit) {
    const amount = toMoney(allocation.allocated_amount);
    if (amount <= 0) continue;

    const allocationDate = String(allocation.allocation_date || "");
    const allocationId = String(allocation.id || "");
    const createdAt = String(allocation.created_at || "");
    const creditRef =
      allocation.credit_note?.reference_number ||
      `Credit Note ${allocation.supplier_credit_note_id}`;
    const reasonText = allocation.credit_note?.reason
      ? ` • ${allocation.credit_note.reason}`
      : "";

    seeds.push({
      id: `credit-note-applied-${allocationId}`,
      entry_type: "credit_note_applied",
      entry_date: allocationDate,
      reference: creditRef,
      description: `Credit note applied to purchase${reasonText}`,
      debit: 0,
      credit: amount,
      sortKey: `credit-note-applied-${allocationDate}-${createdAt}-${allocationId}`,
      affects_running_balance: false,
    });
  }

  seeds.sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date.localeCompare(b.entry_date);

    const typeCompare = statementTypeOrder(a.entry_type) - statementTypeOrder(b.entry_type);
    if (typeCompare !== 0) return typeCompare;

    return String(a.sortKey || a.id).localeCompare(String(b.sortKey || b.id));
  });

  let runningBalance = 0;
  const entries: SupplierStatementEntry[] = seeds.map((entry) => {
    const affectsRunningBalance = entry.affects_running_balance !== false;

    if (affectsRunningBalance) {
      runningBalance = toMoney(runningBalance + toMoney(entry.debit) - toMoney(entry.credit));
    }

    return {
      id: entry.id,
      entry_type: entry.entry_type,
      entry_date: entry.entry_date,
      reference: entry.reference,
      description: entry.description,
      debit: toMoney(entry.debit),
      credit: toMoney(entry.credit),
      running_balance: runningBalance,
    };
  });

  return {
    supplier: supplier as SupplierRow,
    entries,
    snapshot,
    creditNotes: (creditNotes ?? []) as SupplierCreditNoteRow[],
    creditNoteAllocations: allocationsWithCredit,
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

export async function createSupplierPayment(args: SupplierPaymentCreateArgs) {
  return insertSupplierPayment(args);
}

export async function previewGeneralSupplierPaymentSettlement(args: {
  companyId: string;
  supplierId: string;
  amount: number | string;
}) {
  const { companyId, supplierId, amount } = args;

  const paymentAmount = toMoney(amount);
  if (paymentAmount <= 0) {
    return {
      outstandingAmount: 0,
      paymentAmount: 0,
      willAllocate: 0,
      willRemainAsCredit: 0,
    } satisfies SupplierAutoSettlePreview;
  }

  const snapshot = await fetchSupplierAccountSnapshot({ companyId, supplierId });
  const outstandingAmount = Math.max(toMoney(snapshot.netPayable), 0);
  const willAllocate = Math.min(outstandingAmount, paymentAmount);
  const willRemainAsCredit = Math.max(paymentAmount - outstandingAmount, 0);

  return {
    outstandingAmount,
    paymentAmount,
    willAllocate,
    willRemainAsCredit,
  } satisfies SupplierAutoSettlePreview;
}

export async function createGeneralSupplierPaymentWithAutoSettle(args: SupplierPaymentCreateArgs) {
  const { companyId, userId, values } = args;

  if (values.purchase_id !== "none") {
    throw new Error("Auto-settle flow only supports general supplier payments.");
  }

  const paymentAmount = toMoney(values.amount);
  if (paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const latestOpenPurchases = sortOpenPurchasesOldestFirst(
    (await fetchSupplierOpenPurchases({
      companyId,
      supplierId: values.supplier_id,
    })) as Array<{
      id: string;
      branch_id?: string | null;
      purchase_date: string;
      invoice_number: string | null;
      reference_number: string | null;
      total_amount: number;
      amount_paid?: number;
      supplier_credit_applied: number;
      balance_due: number;
    }>
  );

  let remaining = paymentAmount;
  let allocatedTotal = 0;
  let allocationsCount = 0;

  for (const purchase of latestOpenPurchases) {
    if (remaining <= 0) break;

    const purchaseBalance = toMoney(purchase.balance_due);
    if (purchaseBalance <= 0) continue;

    const chunk = Math.min(remaining, purchaseBalance);
    if (chunk <= 0) continue;

    await insertSupplierPayment({
      companyId,
      userId,
      values: {
        ...values,
        branch_id: purchase.branch_id || values.branch_id,
        purchase_id: purchase.id,
        amount: String(chunk),
        notes: values.notes
          ? `${values.notes} • Auto-settled from general payment`
          : "Auto-settled from general payment",
      },
    });

    remaining = toMoney(remaining - chunk);
    allocatedTotal = toMoney(allocatedTotal + chunk);
    allocationsCount += 1;
  }

  if (remaining > 0) {
    await insertSupplierPayment({
      companyId,
      userId,
      values: {
        ...values,
        purchase_id: "none",
        amount: String(remaining),
        notes: values.notes
          ? `${values.notes} • Remaining kept as supplier credit`
          : "Remaining kept as supplier credit",
      },
    });
  }

  return {
    allocatedTotal,
    remainingCredit: remaining,
    allocationsCount,
  } satisfies SupplierAutoSettleResult;
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
      branch_id,
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
    branch_id: row.branch_id || null,
    purchase_date: row.purchase_date,
    invoice_number: row.invoice_number,
    reference_number: row.reference_number,
    total_amount: toMoney(row.total_amount),
    amount_paid: toMoney(row.allocated_amount),
    supplier_credit_applied: toMoney(row.supplier_credit_applied),
    balance_due: toMoney(row.computed_balance_due),
  }));
}