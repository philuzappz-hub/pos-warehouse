import type {
  SupplierFormValues,
  SupplierPaymentFormValues,
  SupplierRow,
  SupplierStatementEntry,
  SupplierStatementSummary,
  SupplierStats,
} from "@/features/suppliers/types";

export function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function roundMoney(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

export function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export function normalizeOptionalText(value: unknown) {
  const v = String(value || "").trim();
  return v ? v : null;
}

export function getSupplierStats(rows: SupplierRow[]): SupplierStats {
  return {
    totalSuppliers: rows.length,
    activeSuppliers: rows.filter((r) => r.is_active).length,
    inactiveSuppliers: rows.filter((r) => !r.is_active).length,
    totalOpeningBalance: roundMoney(
      rows.reduce((sum, row) => sum + safeNumber(row.opening_balance), 0)
    ),
  };
}

export function validateSupplierForm(values: SupplierFormValues) {
  if (!normalizeText(values.name)) {
    return "Supplier name is required.";
  }

  if (safeNumber(values.opening_balance) < 0) {
    return "Opening balance cannot be negative.";
  }

  return null;
}

export function getSupplierStatementSummary(
  entries: SupplierStatementEntry[]
): SupplierStatementSummary {
  const openingBalance = roundMoney(
    entries
      .filter((e) => e.entry_type === "opening_balance")
      .reduce((sum, e) => sum + safeNumber(e.debit) - safeNumber(e.credit), 0)
  );

  const totalPurchases = roundMoney(
    entries
      .filter((e) => e.entry_type === "purchase")
      .reduce((sum, e) => sum + safeNumber(e.debit), 0)
  );

  const totalPayments = roundMoney(
    entries
      .filter((e) => e.entry_type === "payment")
      .reduce((sum, e) => sum + safeNumber(e.credit), 0)
  );

  const totalOverpaymentCredits = roundMoney(
    entries
      .filter((e) => e.entry_type === "overpayment_credit")
      .reduce((sum, e) => sum + safeNumber(e.credit), 0)
  );

  const totalCreditsApplied = roundMoney(
    entries
      .filter((e) => e.entry_type === "credit_applied")
      .reduce((sum, e) => sum + safeNumber(e.credit), 0)
  );

  const totalCreditNotesIssued = roundMoney(
    entries
      .filter((e) => e.entry_type === "credit_note_issued")
      .reduce((sum, e) => sum + safeNumber(e.credit), 0)
  );

  const totalCreditNotesApplied = roundMoney(
    entries
      .filter((e) => e.entry_type === "credit_note_applied")
      .reduce((sum, e) => sum + safeNumber(e.credit), 0)
  );

  const rawClosingBalance =
    entries.length > 0
      ? roundMoney(safeNumber(entries[entries.length - 1].running_balance))
      : 0;

  return {
    openingBalance,
    totalPurchases,
    totalPayments,
    totalOverpaymentCredits,
    totalCreditsApplied,
    totalCreditNotesIssued,
    totalCreditNotesApplied,
    closingBalance: rawClosingBalance,
  };
}

export function validateSupplierPaymentForm(values: SupplierPaymentFormValues) {
  if (!normalizeText(values.supplier_id)) {
    return "Please select a supplier.";
  }

  if (!normalizeText(values.branch_id)) {
    return "Please select a branch.";
  }

  if (!normalizeText(values.payment_date)) {
    return "Please select payment date.";
  }

  if (safeNumber(values.amount) <= 0) {
    return "Payment amount must be greater than zero.";
  }

  if (!normalizeText(values.payment_method)) {
    return "Please select payment method.";
  }

  return null;
}