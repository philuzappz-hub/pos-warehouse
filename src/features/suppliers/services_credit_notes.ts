import { supabase } from "@/integrations/supabase/client";

export type SupplierCreditNoteRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  supplier_id: string;
  credit_date: string;
  amount: number;
  reference_number: string | null;
  reason: string | null;
  notes: string | null;
  status: "open" | "partial" | "used" | "cancelled";
  created_by: string | null;
  created_at: string;
  updated_at: string;

  supplier_name?: string;
  supplier_code?: string | null;
  branch_name?: string | null;

  used_amount?: number;
  available_amount?: number;
};

export type SupplierCreditNoteAllocationRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  supplier_credit_note_id: string;
  purchase_id: string;
  supplier_id: string;
  allocated_amount: number;
  allocation_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  purchase_date?: string | null;
  invoice_number?: string | null;
  reference_number?: string | null;
  purchase_total_amount?: number;
};

export type SupplierCreditNoteFormValues = {
  supplier_id: string;
  branch_id: string;
  credit_date: string;
  amount: string;
  reference_number: string;
  reason: string;
  notes: string;
};

export const emptySupplierCreditNoteForm: SupplierCreditNoteFormValues = {
  supplier_id: "",
  branch_id: "",
  credit_date: new Date().toISOString().slice(0, 10),
  amount: "0",
  reference_number: "",
  reason: "",
  notes: "",
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeOptionalText(value: unknown) {
  const v = String(value || "").trim();
  return v ? v : null;
}

export async function fetchSupplierCreditNotes(args: {
  companyId: string;
  supplierId?: string | null;
  branchId?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { companyId, supplierId, branchId, status, startDate, endDate } = args;

  let query = (supabase as any)
    .from("supplier_credit_notes")
    .select(`
      id,
      company_id,
      branch_id,
      supplier_id,
      credit_date,
      amount,
      reference_number,
      reason,
      notes,
      status,
      created_by,
      created_at,
      updated_at
    `)
    .eq("company_id", companyId)
    .order("credit_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (branchId) query = query.eq("branch_id", branchId);
  if (status && status !== "all") query = query.eq("status", status);
  if (startDate) query = query.gte("credit_date", startDate);
  if (endDate) query = query.lte("credit_date", endDate);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as any[];

  const creditIds = rows.map((row) => String(row.id));
  const supplierIds = Array.from(
    new Set(rows.map((row) => String(row.supplier_id || "")).filter(Boolean))
  );
  const branchIds = Array.from(
    new Set(rows.map((row) => String(row.branch_id || "")).filter(Boolean))
  );

  let usedMap = new Map<string, number>();
  let supplierMap = new Map<string, { name: string; supplier_code: string | null }>();
  let branchMap = new Map<string, { name: string }>();

  if (creditIds.length > 0) {
    const { data: allocations, error: allocationsError } = await (supabase as any)
      .from("supplier_credit_note_allocations")
      .select("supplier_credit_note_id,allocated_amount")
      .in("supplier_credit_note_id", creditIds);

    if (allocationsError) throw allocationsError;

    for (const row of allocations ?? []) {
      const id = String(row.supplier_credit_note_id || "");
      if (!id) continue;
      usedMap.set(id, roundMoney((usedMap.get(id) || 0) + safeNumber(row.allocated_amount)));
    }
  }

  if (supplierIds.length > 0) {
    const { data: suppliers, error: suppliersError } = await (supabase as any)
      .from("suppliers")
      .select("id,name,supplier_code")
      .in("id", supplierIds);

    if (suppliersError) throw suppliersError;

    supplierMap = new Map(
      (suppliers ?? []).map((row: any) => [
        String(row.id),
        {
          name: String(row.name || "Unknown Supplier"),
          supplier_code: row.supplier_code || null,
        },
      ])
    );
  }

  if (branchIds.length > 0) {
    const { data: branches, error: branchesError } = await (supabase as any)
      .from("branches")
      .select("id,name")
      .in("id", branchIds);

    if (branchesError) throw branchesError;

    branchMap = new Map(
      (branches ?? []).map((row: any) => [
        String(row.id),
        {
          name: String(row.name || "Unknown Branch"),
        },
      ])
    );
  }

  return rows.map((row) => {
    const id = String(row.id);
    const amount = roundMoney(row.amount);
    const usedAmount = roundMoney(usedMap.get(id) || 0);
    const availableAmount = roundMoney(Math.max(0, amount - usedAmount));

    const supplierInfo = supplierMap.get(String(row.supplier_id));
    const branchInfo = row.branch_id ? branchMap.get(String(row.branch_id)) : null;

    return {
      id,
      company_id: String(row.company_id),
      branch_id: row.branch_id || null,
      supplier_id: String(row.supplier_id),
      credit_date: String(row.credit_date),
      amount,
      reference_number: row.reference_number || null,
      reason: row.reason || null,
      notes: row.notes || null,
      status: (row.status || "open") as "open" | "partial" | "used" | "cancelled",
      created_by: row.created_by || null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      supplier_name: supplierInfo?.name || "Unknown Supplier",
      supplier_code: supplierInfo?.supplier_code || null,
      branch_name: branchInfo?.name || null,
      used_amount: usedAmount,
      available_amount: availableAmount,
    } satisfies SupplierCreditNoteRow;
  });
}

export async function createSupplierCreditNote(args: {
  companyId: string;
  userId: string | null;
  values: SupplierCreditNoteFormValues;
}) {
  const { companyId, userId, values } = args;

  const amount = roundMoney(safeNumber(values.amount));
  if (amount <= 0) {
    throw new Error("Credit amount must be greater than zero.");
  }

  if (!normalizeText(values.supplier_id)) {
    throw new Error("Supplier is required.");
  }

  if (!normalizeText(values.credit_date)) {
    throw new Error("Credit date is required.");
  }

  const payload = {
    company_id: companyId,
    branch_id: values.branch_id || null,
    supplier_id: values.supplier_id,
    credit_date: values.credit_date,
    amount,
    reference_number: normalizeOptionalText(values.reference_number),
    reason: normalizeOptionalText(values.reason),
    notes: normalizeOptionalText(values.notes),
    status: "open",
    created_by: userId,
  };

  const { data, error } = await (supabase as any)
    .from("supplier_credit_notes")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data as SupplierCreditNoteRow;
}

export async function fetchOpenSupplierPurchasesForCredit(args: {
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
      computed_balance_due
    `)
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .gt("computed_balance_due", 0)
    .order("purchase_date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    purchase_id: row.id,
    purchase_date: row.purchase_date,
    invoice_number: row.invoice_number,
    reference_number: row.reference_number,
    total_amount: roundMoney(row.total_amount),
    allocated_amount: roundMoney(row.allocated_amount),
    balance_due: roundMoney(row.computed_balance_due),
  }));
}

export async function applySupplierCreditNoteToPurchase(args: {
  creditNoteId: string;
  purchaseId: string;
  amount: number;
  notes?: string | null;
}) {
  const { creditNoteId, purchaseId, amount, notes } = args;

  const { data, error } = await (supabase as any).rpc(
    "apply_supplier_credit_note_to_purchase",
    {
      p_credit_note_id: creditNoteId,
      p_purchase_id: purchaseId,
      p_amount: roundMoney(amount),
      p_notes: notes ?? null,
    }
  );

  if (error) throw error;
  return data;
}

export async function fetchSupplierCreditNoteAllocations(args: {
  creditNoteId: string;
}) {
  const { creditNoteId } = args;

  const { data, error } = await (supabase as any)
    .from("supplier_credit_note_allocations")
    .select(`
      id,
      company_id,
      branch_id,
      supplier_credit_note_id,
      purchase_id,
      supplier_id,
      allocated_amount,
      allocation_date,
      notes,
      created_by,
      created_at,
      updated_at
    `)
    .eq("supplier_credit_note_id", creditNoteId)
    .order("allocation_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as any[];
  const purchaseIds = Array.from(
    new Set(rows.map((row) => String(row.purchase_id || "")).filter(Boolean))
  );

  let purchaseMap = new Map<
    string,
    {
      purchase_date: string | null;
      invoice_number: string | null;
      reference_number: string | null;
      total_amount: number;
    }
  >();

  if (purchaseIds.length > 0) {
    const { data: purchases, error: purchasesError } = await (supabase as any)
      .from("purchases")
      .select("id,purchase_date,invoice_number,reference_number,total_amount")
      .in("id", purchaseIds);

    if (purchasesError) throw purchasesError;

    purchaseMap = new Map(
      (purchases ?? []).map((row: any) => [
        String(row.id),
        {
          purchase_date: row.purchase_date || null,
          invoice_number: row.invoice_number || null,
          reference_number: row.reference_number || null,
          total_amount: roundMoney(row.total_amount || 0),
        },
      ])
    );
  }

  return rows.map((row: any) => {
    const purchase = purchaseMap.get(String(row.purchase_id));

    return {
      id: String(row.id),
      company_id: String(row.company_id),
      branch_id: row.branch_id || null,
      supplier_credit_note_id: String(row.supplier_credit_note_id),
      purchase_id: String(row.purchase_id),
      supplier_id: String(row.supplier_id),
      allocated_amount: roundMoney(row.allocated_amount),
      allocation_date: String(row.allocation_date),
      notes: row.notes || null,
      created_by: row.created_by || null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      purchase_date: purchase?.purchase_date || null,
      invoice_number: purchase?.invoice_number || null,
      reference_number: purchase?.reference_number || null,
      purchase_total_amount: purchase?.total_amount || 0,
    } satisfies SupplierCreditNoteAllocationRow;
  });
}