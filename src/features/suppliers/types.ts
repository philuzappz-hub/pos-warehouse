export type SupplierRow = {
  id: string;
  company_id: string;
  branch_id: string | null;

  supplier_code: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;

  opening_balance: number;
  is_active: boolean;

  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierFormValues = {
  supplier_code: string;
  name: string;
  contact_person: string;
  phone: string;
  alt_phone: string;
  email: string;
  address: string;
  notes: string;
  opening_balance: string;
  branch_id: string | "all";
  is_active: boolean;
};

export type SupplierStats = {
  totalSuppliers: number;
  activeSuppliers: number;
  inactiveSuppliers: number;
  totalOpeningBalance: number;
};

export type SupplierStatementEntry = {
  id: string;
  entry_type:
    | "opening_balance"
    | "purchase"
    | "payment"
    | "overpayment_credit"
    | "credit_applied";
  entry_date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
};

export type SupplierStatementSummary = {
  openingBalance: number;
  totalPurchases: number;
  totalPayments: number;
  totalOverpaymentCredits: number;
  totalCreditsApplied: number;
  closingBalance: number;
};

export type SupplierPaymentRow = {
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

  supplier?: {
    id: string;
    name: string;
    supplier_code?: string | null;
  } | null;
};

export type SupplierPaymentFormValues = {
  supplier_id: string;
  branch_id: string;
  purchase_id: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference_number: string;
  notes: string;
};

export const emptySupplierForm: SupplierFormValues = {
  supplier_code: "",
  name: "",
  contact_person: "",
  phone: "",
  alt_phone: "",
  email: "",
  address: "",
  notes: "",
  opening_balance: "0",
  branch_id: "all",
  is_active: true,
};

export const emptySupplierPaymentForm: SupplierPaymentFormValues = {
  supplier_id: "",
  branch_id: "",
  purchase_id: "none",
  payment_date: new Date().toISOString().slice(0, 10),
  amount: "0",
  payment_method: "cash",
  reference_number: "",
  notes: "",
};