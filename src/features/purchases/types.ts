export type SupplierOption = {
  id: string;
  name: string;
  supplier_code: string | null;
  is_active: boolean;
};

export type ProductOption = {
  id: string;
  name: string;
  branch_id?: string | null;
  company_id?: string | null;
  quantity_in_stock?: number | null;
  cost_price?: number | null;
  last_cost?: number | null;
};

export type PurchaseItemFormRow = {
  rowId: string;
  product_id: string;
  product_name: string;
  quantity: string;
  unit_cost: string;
  line_discount: string;
};

export type PurchaseFormValues = {
  supplier_id: string;
  branch_id: string;
  purchase_date: string;
  invoice_number: string;
  reference_number: string;
  discount_amount: string;
  tax_amount: string;
  other_charges: string;
  amount_paid: string;
  notes: string;
};

export const emptyPurchaseForm: PurchaseFormValues = {
  supplier_id: "",
  branch_id: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  invoice_number: "",
  reference_number: "",
  discount_amount: "0",
  tax_amount: "0",
  other_charges: "0",
  amount_paid: "0",
  notes: "",
};

export type PurchaseRow = {
  id: string;
  company_id: string;
  branch_id: string;
  supplier_id: string;

  purchase_date: string;
  invoice_number: string | null;
  reference_number: string | null;

  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  other_charges: number;
  total_amount: number;

  amount_paid: number;
  balance_due: number;
  overpayment_amount?: number | null;
  supplier_credit_applied?: number | null;

  payment_status: "paid" | "partial" | "unpaid";
  stock_status: "draft" | "received" | "cancelled";

  notes: string | null;
  created_by: string | null;
  approved_by: string | null;

  created_at: string;
  updated_at: string;

  supplier?: {
    id: string;
    name: string;
    supplier_code?: string | null;
    phone?: string | null;
    email?: string | null;
    contact_person?: string | null;
  } | null;
};

export type PurchaseItemRow = {
  id: string;
  purchase_id: string;
  company_id: string;
  branch_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_discount: number;
  line_total: number;
  created_at: string;
  updated_at: string;
  product?: {
    id: string;
    name: string;
  } | null;
};

export type PurchasePaymentRow = {
  id: string;
  company_id: string;
  branch_id: string;
  supplier_id: string;
  purchase_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseDetailsResult = {
  purchase: PurchaseRow;
  items: PurchaseItemRow[];
  payments: PurchasePaymentRow[];
};

export type PurchaseStats = {
  totalPurchases: number;
  grossPurchases: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverpayments: number;
};

export type SupplierCreditInfo = {
  supplierId: string;
  creditBalance: number;
};

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