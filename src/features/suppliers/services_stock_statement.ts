import { supabase } from "@/integrations/supabase/client";

export type SupplierStockStatementRow = {
  purchase_item_id: string;
  purchase_id: string;
  purchase_date: string;
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;
  branch_id: string | null;
  branch_name: string | null;

  product_id: string;
  product_name: string;

  quantity: number;
  unit_cost: number;
  line_discount: number;
  line_total: number;

  invoice_number: string | null;
  reference_number: string | null;
  stock_status: string | null;
};

export type SupplierStockStatementSummary = {
  totalLines: number;
  totalQuantity: number;
  totalValue: number;
  avgUnitCost: number;
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

export async function fetchSupplierStockStatement(args: {
  companyId: string;
  supplierId?: string | null;
  branchId?: string | null;
  productId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { companyId, supplierId, branchId, productId, startDate, endDate } = args;

  let query = (supabase as any)
    .from("purchase_items")
    .select(`
      id,
      purchase_id,
      product_id,
      quantity,
      unit_cost,
      line_discount,
      line_total,
      product:products(id,name),
      purchase:purchases(
        id,
        purchase_date,
        supplier_id,
        branch_id,
        invoice_number,
        reference_number,
        stock_status,
        supplier:suppliers(id,name,supplier_code),
        branch:branches(id,name)
      )
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (productId) query = query.eq("product_id", productId);

  const { data, error } = await query;
  if (error) throw error;

  let rows: SupplierStockStatementRow[] = (data ?? []).map((row: any) => ({
    purchase_item_id: row.id,
    purchase_id: row.purchase_id,
    purchase_date: row?.purchase?.purchase_date,
    supplier_id: row?.purchase?.supplier_id,
    supplier_name: row?.purchase?.supplier?.name || "Unknown Supplier",
    supplier_code: row?.purchase?.supplier?.supplier_code || null,
    branch_id: row?.purchase?.branch_id || null,
    branch_name: row?.purchase?.branch?.name || null,

    product_id: row.product_id,
    product_name: row?.product?.name || "Unknown Product",

    quantity: roundMoney(row.quantity),
    unit_cost: roundMoney(row.unit_cost),
    line_discount: roundMoney(row.line_discount),
    line_total: roundMoney(row.line_total),

    invoice_number: row?.purchase?.invoice_number || null,
    reference_number: row?.purchase?.reference_number || null,
    stock_status: row?.purchase?.stock_status || null,
  }));

  if (supplierId) {
    rows = rows.filter((row) => row.supplier_id === supplierId);
  }

  if (branchId) {
    rows = rows.filter((row) => row.branch_id === branchId);
  }

  if (startDate) {
    rows = rows.filter((row) => row.purchase_date >= startDate);
  }

  if (endDate) {
    rows = rows.filter((row) => row.purchase_date <= endDate);
  }

  rows.sort((a, b) => {
    if (a.purchase_date !== b.purchase_date) {
      return b.purchase_date.localeCompare(a.purchase_date);
    }
    return String(b.purchase_item_id).localeCompare(String(a.purchase_item_id));
  });

  const totalLines = rows.length;
  const totalQuantity = roundMoney(
    rows.reduce((sum, row) => sum + safeNumber(row.quantity), 0)
  );
  const totalValue = roundMoney(
    rows.reduce((sum, row) => sum + safeNumber(row.line_total), 0)
  );
  const avgUnitCost =
    totalQuantity > 0 ? roundMoney(totalValue / totalQuantity) : 0;

  const summary: SupplierStockStatementSummary = {
    totalLines,
    totalQuantity,
    totalValue,
    avgUnitCost,
  };

  return { rows, summary };
}