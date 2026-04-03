import type {
  PurchaseFormValues,
  PurchaseItemFormRow,
  PurchaseRow,
  PurchaseStats,
} from "@/features/purchases/types";

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

export function createEmptyPurchaseItemRow(): PurchaseItemFormRow {
  return {
    rowId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    product_id: "",
    product_name: "",
    quantity: "1",
    unit_cost: "0",
    line_discount: "0",
  };
}

export function getPurchaseLineTotal(row: PurchaseItemFormRow) {
  const quantity = safeNumber(row.quantity);
  const unitCost = safeNumber(row.unit_cost);
  const lineDiscount = safeNumber(row.line_discount);

  return roundMoney(quantity * unitCost - lineDiscount);
}

export function getPurchaseSubtotal(rows: PurchaseItemFormRow[]) {
  return roundMoney(rows.reduce((sum, row) => sum + getPurchaseLineTotal(row), 0));
}

export function getPurchaseTotals(
  form: PurchaseFormValues,
  rows: PurchaseItemFormRow[],
  supplierCreditBalance = 0
) {
  const subtotal = getPurchaseSubtotal(rows);
  const discountAmount = roundMoney(safeNumber(form.discount_amount));
  const taxAmount = roundMoney(safeNumber(form.tax_amount));
  const otherCharges = roundMoney(safeNumber(form.other_charges));

  const totalAmount = roundMoney(subtotal - discountAmount + taxAmount + otherCharges);

  const rawAmountPaid = roundMoney(safeNumber(form.amount_paid));
  const supplierCreditApplied = roundMoney(Math.min(supplierCreditBalance, totalAmount));

  const remainingAfterCredit = roundMoney(Math.max(0, totalAmount - supplierCreditApplied));
  const appliedCashAmount = roundMoney(Math.min(rawAmountPaid, remainingAfterCredit));
  const effectivePaidAmount = roundMoney(supplierCreditApplied + appliedCashAmount);

  const overpaymentAmount = roundMoney(Math.max(0, rawAmountPaid - remainingAfterCredit));
  const balanceDue = roundMoney(Math.max(0, totalAmount - effectivePaidAmount));

  let paymentStatus: "paid" | "partial" | "unpaid" = "unpaid";
  if (totalAmount <= 0) {
    paymentStatus = "unpaid";
  } else if (effectivePaidAmount >= totalAmount) {
    paymentStatus = "paid";
  } else if (effectivePaidAmount > 0) {
    paymentStatus = "partial";
  }

  return {
    subtotal,
    discountAmount,
    taxAmount,
    otherCharges,
    totalAmount,
    rawAmountPaid,
    supplierCreditApplied,
    appliedCashAmount,
    effectivePaidAmount,
    overpaymentAmount,
    balanceDue,
    paymentStatus,
  };
}

export function validatePurchaseForm(form: PurchaseFormValues, rows: PurchaseItemFormRow[]) {
  if (!normalizeText(form.supplier_id)) {
    return "Please select a supplier.";
  }

  if (!normalizeText(form.branch_id)) {
    return "Please select a branch.";
  }

  if (!normalizeText(form.purchase_date)) {
    return "Please select purchase date.";
  }

  if (rows.length === 0) {
    return "Please add at least one purchase item.";
  }

  for (const row of rows) {
    if (!normalizeText(row.product_id)) {
      return "Every row must have a product selected.";
    }

    if (safeNumber(row.quantity) <= 0) {
      return "Quantity must be greater than zero.";
    }

    if (safeNumber(row.unit_cost) < 0) {
      return "Unit cost cannot be negative.";
    }

    if (getPurchaseLineTotal(row) < 0) {
      return "A line total cannot be negative.";
    }
  }

  return null;
}

export function getPurchaseStats(rows: PurchaseRow[]): PurchaseStats {
  return {
    totalPurchases: rows.length,
    grossPurchases: roundMoney(rows.reduce((sum, row) => sum + safeNumber(row.total_amount), 0)),
    totalPaid: roundMoney(rows.reduce((sum, row) => sum + safeNumber(row.amount_paid), 0)),
    totalOutstanding: roundMoney(
      rows.reduce((sum, row) => sum + safeNumber(row.balance_due), 0)
    ),
    totalOverpayments: roundMoney(
      rows.reduce((sum, row) => sum + safeNumber(row.overpayment_amount), 0)
    ),
  };
}