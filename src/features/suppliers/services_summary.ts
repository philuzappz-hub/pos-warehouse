import { roundMoney, safeNumber } from "@/features/suppliers/helpers";
import { supabase } from "@/integrations/supabase/client";

function daysBetween(dateStr: string) {
  const today = new Date();
  const d = new Date(dateStr);
  const diff = today.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export type SupplierSummaryRow = {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;

  total_purchases: number;
  total_paid: number;
  balance_due: number;
  supplier_credit: number;

  current: number;
  days30: number;
  days60: number;
  days90: number;
};

type SnapshotRow = {
  total_purchases: number;
  outstanding_purchases: number;
  total_payments: number;
  total_credits_applied: number;
  available_credit: number;
};

async function fetchSupplierSnapshot(args: {
  companyId: string;
  supplierId: string;
}) {
  const { companyId, supplierId } = args;

  const { data, error } = await (supabase as any).rpc(
    "get_supplier_account_snapshot_v2",
    {
      p_company_id: companyId,
      p_supplier_id: supplierId,
    }
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  return {
    total_purchases: roundMoney(safeNumber(row?.total_purchases)),
    outstanding_purchases: roundMoney(safeNumber(row?.outstanding_purchases)),
    total_payments: roundMoney(safeNumber(row?.total_payments)),
    total_credits_applied: roundMoney(safeNumber(row?.total_credits_applied)),
    available_credit: roundMoney(safeNumber(row?.available_credit)),
  } as SnapshotRow;
}

export async function fetchSupplierSummary(args: {
  companyId: string;
  branchId?: string | null;
}) {
  const { companyId, branchId } = args;

  let suppliersQuery = (supabase as any)
    .from("suppliers")
    .select("id,name,supplier_code,branch_id,is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (branchId) {
    suppliersQuery = suppliersQuery.eq("branch_id", branchId);
  }

  const { data: suppliers, error: suppliersError } = await suppliersQuery;
  if (suppliersError) throw suppliersError;

  let purchaseQuery = (supabase as any)
    .from("purchases")
    .select("supplier_id,purchase_date,total_amount")
    .eq("company_id", companyId);

  if (branchId) {
    purchaseQuery = purchaseQuery.eq("branch_id", branchId);
  }

  const { data: purchases } = await purchaseQuery;

  const agingMap = new Map<
    string,
    { current: number; days30: number; days60: number; days90: number }
  >();

  (purchases ?? []).forEach((row: any) => {
    const supplierId = String(row?.supplier_id || "");
    if (!supplierId) return;

    const amount = roundMoney(safeNumber(row?.total_amount));
    if (amount <= 0) return;

    const age = daysBetween(String(row?.purchase_date || ""));

    const existing = agingMap.get(supplierId) || {
      current: 0,
      days30: 0,
      days60: 0,
      days90: 0,
    };

    if (age <= 30) existing.current += amount;
    else if (age <= 60) existing.days30 += amount;
    else if (age <= 90) existing.days60 += amount;
    else existing.days90 += amount;

    agingMap.set(supplierId, {
      current: roundMoney(existing.current),
      days30: roundMoney(existing.days30),
      days60: roundMoney(existing.days60),
      days90: roundMoney(existing.days90),
    });
  });

  const rows = await Promise.all(
    (suppliers ?? []).map(async (supplier: any) => {
      const supplierId = String(supplier.id);

      const snapshot = await fetchSupplierSnapshot({
        companyId,
        supplierId,
      });

      const aging = agingMap.get(supplierId) || {
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
      };

      const totalPaid = roundMoney(
        snapshot.total_purchases - snapshot.outstanding_purchases
      );

      return {
        supplier_id: supplierId,
        supplier_name: supplier.name || "Unknown",
        supplier_code: supplier.supplier_code || null,

        total_purchases: snapshot.total_purchases,
        total_paid: totalPaid,
        balance_due: snapshot.outstanding_purchases,
        supplier_credit: snapshot.available_credit,

        current: aging.current,
        days30: aging.days30,
        days60: aging.days60,
        days90: aging.days90,
      } satisfies SupplierSummaryRow;
    })
  );

  return rows.sort((a, b) => {
    const aNet = roundMoney(a.balance_due - a.supplier_credit);
    const bNet = roundMoney(b.balance_due - b.supplier_credit);
    return bNet - aNet;
  });
}