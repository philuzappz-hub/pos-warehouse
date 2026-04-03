// src/pages/Dashboard.tsx
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface DashboardStats {
  todaySales: number;
  totalProducts: number;
  lowStock: number;
  pendingOrders: number;
  todayAttendance: number;
  pendingStockReceipts: number;
  myPendingReceipts: number;
  outstandingDebt: number;
  customersOwing: number;
  unpaidCreditSales: number;
  cashCollectedToday: number;
  creditSoldToday: number;
}

interface FinancialStats {
  rangeDays: number;
  totalSales: number;
  totalCollections: number;
  totalSupplierPayments: number;
  totalExpenses: number;
  receivables: number;
  payables: number;
  cashPosition: number;
  netPosition: number;
  purchaseValue: number;
  lowStockCount: number;
  pendingWarehouseReceipts: number;
}

type BranchRow = {
  id: string;
  name: string;
  code: string | null;
  company_id: string;
  is_active?: boolean;
  created_at?: string;
};

type BranchBreakdownRow = {
  branchId: string;
  branchName: string;
  totalProducts: number;
  lowStock: number;
  pendingStockReceipts: number;
  todayAttendance: number;
  outstandingDebt: number;
  customersOwing: number;
  todaySales: number;
  payables: number;
};

type DebtorRow = {
  customer_id: string;
  full_name: string;
  phone: string | null;
  current_balance: number;
  total_sales: number;
  total_paid: number;
  last_payment_date: string | null;
  branch_id: string | null;
};

type SupplierPayableRow = {
  supplier_id: string;
  name: string;
  phone: string | null;
  current_balance: number;
  total_purchased: number;
  total_paid: number;
  last_payment_date: string | null;
  branch_id: string | null;
};

type ProductSalesRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity_in_stock: number;
  reorder_level: number | null;
  total_qty_sold: number;
  total_sales_value: number;
  branch_id: string | null;
};

type LowStockRow = {
  id: string;
  name: string;
  sku: string | null;
  quantity_in_stock: number;
  reorder_level: number | null;
};

const RANGE_OPTIONS = [
  { key: 7, label: "7 days" },
  { key: 30, label: "30 days" },
  { key: 90, label: "90 days" },
];

function makeBranchCode(name: string) {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .join(" ")
    .slice(0, 8)
    .replace(/\s+/g, "");
  const short = (base || "BR").slice(0, 4);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${short}-${rand}`;
}

function applyBranchScope(query: any, branchId: string | null) {
  if (!branchId) return query;
  return query.eq("branch_id", branchId);
}

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrency(n: number) {
  return `GHS ${money(n)}`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isLowStock(row: {
  quantity_in_stock?: number | null;
  reorder_level?: number | null;
}) {
  const qty = Number(row?.quantity_in_stock ?? 0);
  const reorder = Number(row?.reorder_level ?? 0);
  return qty <= reorder;
}

function StatMiniCard({
  title,
  value,
  subtitle,
  icon: Icon,
  valueClassName = "text-white",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  valueClassName?: string;
}) {
  return (
    <Card className="border-slate-700 bg-slate-900/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">{title}</p>
            <p className={`mt-1 text-xl font-bold ${valueClassName}`}>{value}</p>
            {subtitle ? (
              <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <Icon className="h-5 w-5 shrink-0 text-slate-300" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, profile, roles, isAdmin, activeBranchId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const sb = supabase as any;

  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    totalProducts: 0,
    lowStock: 0,
    pendingOrders: 0,
    todayAttendance: 0,
    pendingStockReceipts: 0,
    myPendingReceipts: 0,
    outstandingDebt: 0,
    customersOwing: 0,
    unpaidCreditSales: 0,
    cashCollectedToday: 0,
    creditSoldToday: 0,
  });

  const [financialStats, setFinancialStats] = useState<FinancialStats>({
    rangeDays: 30,
    totalSales: 0,
    totalCollections: 0,
    totalSupplierPayments: 0,
    totalExpenses: 0,
    receivables: 0,
    payables: 0,
    cashPosition: 0,
    netPosition: 0,
    purchaseValue: 0,
    lowStockCount: 0,
    pendingWarehouseReceipts: 0,
  });

  const [loading, setLoading] = useState(true);
  const [financialLoading, setFinancialLoading] = useState(true);

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [branchBreakdown, setBranchBreakdown] = useState<BranchBreakdownRow[]>([]);

  const [topDebtors, setTopDebtors] = useState<DebtorRow[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<SupplierPayableRow[]>([]);
  const [topProducts, setTopProducts] = useState<ProductSalesRow[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockRow[]>([]);

  const isCashier = useMemo(() => roles.includes("cashier" as any), [roles]);
  const isWarehouse = useMemo(() => roles.includes("warehouse" as any), [roles]);

  const canSeeDailySales = isCashier;
  const canSeeStockBalance = isWarehouse;
  const canSeeStockApprovals = isAdmin;
  const canSeeDebtWidgets = isAdmin || isCashier;

  const companyId = profile?.company_id ?? null;
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isWarehouse, isCashier, user?.id, activeBranchId, profile?.company_id]);

  useEffect(() => {
    if (!profile?.company_id) return;
    fetchFinancialDashboard(financialStats.rangeDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, activeBranchId, financialStats.rangeDays]);

  useEffect(() => {
    if (!isAdmin || !profile?.company_id) return;
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, profile?.company_id]);

  useEffect(() => {
    if (!isAdmin || !profile?.company_id) return;

    if (activeBranchId) {
      setBranchBreakdown([]);
      return;
    }

    if (branches.length === 0) return;
    fetchBranchBreakdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, profile?.company_id, activeBranchId, branches.length]);

  const fetchBranches = async () => {
    if (!profile?.company_id) return;

    setBranchesLoading(true);
    try {
      const { data, error } = await sb
        .from("branches")
        .select("id,name,code,company_id,is_active,created_at")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setBranches((data ?? []) as BranchRow[]);
    } catch (e: any) {
      console.error("fetchBranches error:", e);
      toast({
        title: "Failed to load branches",
        description: e?.message || "Could not fetch branches",
        variant: "destructive",
      });
    } finally {
      setBranchesLoading(false);
    }
  };

  const createBranch = async () => {
    if (!isAdmin) return;

    if (!companyId) {
      toast({
        title: "No company",
        description: "Your profile has no company_id.",
        variant: "destructive",
      });
      return;
    }

    const name = newBranchName.trim();
    if (!name) {
      toast({
        title: "Branch name required",
        variant: "destructive",
      });
      return;
    }

    const code = makeBranchCode(name);

    setCreatingBranch(true);
    try {
      const { data, error } = await sb
        .from("branches")
        .insert([{ name, code, company_id: companyId, is_active: true }])
        .select("id,name,code,company_id,is_active,created_at")
        .single();

      if (error) throw error;

      toast({
        title: "Branch created",
        description: `"${name}" (${code}) has been added.`,
      });

      setNewBranchName("");
      setBranches((prev) => [...prev, data as BranchRow]);
    } catch (e: any) {
      console.error("createBranch error:", e);
      toast({
        title: "Failed to create branch",
        description:
          e?.message || "This is usually an RLS policy issue on the branches table.",
        variant: "destructive",
      });
    } finally {
      setCreatingBranch(false);
    }
  };

  const fetchFinancialDashboard = async (rangeDays: number) => {
    if (!companyId) return;

    setFinancialLoading(true);
    try {
      const fromDate = startOfDay(new Date());
      fromDate.setDate(fromDate.getDate() - (rangeDays - 1));
      const fromIso = fromDate.toISOString();
      const fromDay = fromIso.slice(0, 10);

      const salesQuery = applyBranchScope(
        sb
          .from("sales")
          .select("id,total_amount,balance_due,created_at,is_returned")
          .eq("company_id", companyId)
          .gte("created_at", fromIso),
        activeBranchId
      );

      const collectionsQuery = applyBranchScope(
        sb
          .from("customer_payments")
          .select("id,amount,payment_date,branch_id")
          .eq("company_id", companyId)
          .gte("payment_date", fromDay),
        activeBranchId
      );

      // IMPORTANT:
      // Use purchases as the source of truth for supplier cash out and payables.
      const purchasesRangeQuery = applyBranchScope(
        sb
          .from("purchases")
          .select("id,total_amount,amount_paid,balance_due,purchase_date,stock_status")
          .eq("company_id", companyId)
          .neq("stock_status", "cancelled")
          .gte("purchase_date", fromDay),
        activeBranchId
      );

      const payablesQuery = applyBranchScope(
        sb
          .from("purchases")
          .select("id,balance_due,stock_status")
          .eq("company_id", companyId)
          .neq("stock_status", "cancelled")
          .gt("balance_due", 0),
        activeBranchId
      );

      const expensesQuery = applyBranchScope(
        sb
          .from("expenses")
          .select("id,amount,status,expense_date,branch_id")
          .eq("company_id", companyId)
          .in("status", ["submitted", "approved"])
          .gte("expense_date", fromDay),
        activeBranchId
      );

      const receivablesQuery = applyBranchScope(
        sb
          .from("customers")
          .select("id,current_balance")
          .eq("company_id", companyId),
        activeBranchId
      );

      const lowStockQuery = applyBranchScope(
        sb
          .from("products")
          .select("id,quantity_in_stock,reorder_level")
          .eq("company_id", companyId),
        activeBranchId
      );

      const pendingWarehouseQuery = applyBranchScope(
        sb
          .from("warehouse_receipts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "pending"),
        activeBranchId
      );

      const topDebtorsQuery = applyBranchScope(
        sb
          .from("v_customer_debtor_summary")
          .select(
            "customer_id,full_name,phone,current_balance,total_sales,total_paid,last_payment_date,branch_id"
          )
          .eq("company_id", companyId)
          .order("current_balance", { ascending: false })
          .limit(5),
        activeBranchId
      );

      const topSuppliersQuery = applyBranchScope(
        sb
          .from("v_supplier_payable_summary")
          .select(
            "supplier_id,name,phone,current_balance,total_purchased,total_paid,last_payment_date,branch_id"
          )
          .eq("company_id", companyId)
          .order("current_balance", { ascending: false })
          .limit(5),
        activeBranchId
      );

      const topProductsQuery = applyBranchScope(
        sb
          .from("v_product_sales_summary")
          .select(
            "product_id,product_name,sku,quantity_in_stock,reorder_level,total_qty_sold,total_sales_value,branch_id"
          )
          .eq("company_id", companyId)
          .order("total_qty_sold", { ascending: false })
          .limit(5),
        activeBranchId
      );

      const lowStockProductsQuery = applyBranchScope(
        sb
          .from("products")
          .select("id,name,sku,quantity_in_stock,reorder_level")
          .eq("company_id", companyId)
          .order("quantity_in_stock", { ascending: true }),
        activeBranchId
      );

      const [
        salesRes,
        collectionsRes,
        purchasesRangeRes,
        payablesRes,
        expensesRes,
        receivablesRes,
        lowStockRes,
        pendingWarehouseRes,
        topDebtorsRes,
        topSuppliersRes,
        topProductsRes,
        lowStockProductsRes,
      ] = await Promise.all([
        salesQuery,
        collectionsQuery,
        purchasesRangeQuery,
        payablesQuery,
        expensesQuery,
        receivablesQuery,
        lowStockQuery,
        pendingWarehouseQuery,
        topDebtorsQuery,
        topSuppliersQuery,
        topProductsQuery,
        lowStockProductsQuery,
      ]);

      if (salesRes.error) throw salesRes.error;
      if (collectionsRes.error) throw collectionsRes.error;
      if (purchasesRangeRes.error) throw purchasesRangeRes.error;
      if (payablesRes.error) throw payablesRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (receivablesRes.error) throw receivablesRes.error;
      if (lowStockRes.error) throw lowStockRes.error;
      if (topDebtorsRes.error) throw topDebtorsRes.error;
      if (topSuppliersRes.error) throw topSuppliersRes.error;
      if (topProductsRes.error) throw topProductsRes.error;
      if (lowStockProductsRes.error) throw lowStockProductsRes.error;

      const salesRows = (salesRes.data ?? []).filter(
        (row: any) => row?.is_returned !== true
      ) as any[];

      const totalSales = salesRows.reduce(
        (sum: number, row: any) => sum + Number(row?.total_amount || 0),
        0
      );

      const totalCollections = (collectionsRes.data ?? []).reduce(
        (sum: number, row: any) => sum + Number(row?.amount || 0),
        0
      );

      const purchaseRows = (purchasesRangeRes.data ?? []) as any[];

      const purchaseValue = purchaseRows.reduce(
        (sum: number, row: any) => sum + Number(row?.total_amount || 0),
        0
      );

      const totalSupplierPayments = purchaseRows.reduce(
        (sum: number, row: any) => sum + Number(row?.amount_paid || 0),
        0
      );

      const totalExpenses = (expensesRes.data ?? []).reduce(
        (sum: number, row: any) => sum + Number(row?.amount || 0),
        0
      );

      const receivables = (receivablesRes.data ?? []).reduce(
        (sum: number, row: any) => sum + Number(row?.current_balance || 0),
        0
      );

      const payables = (payablesRes.data ?? []).reduce(
        (sum: number, row: any) => sum + Number(row?.balance_due || 0),
        0
      );

      const cashPosition =
        totalSales + totalCollections - totalSupplierPayments - totalExpenses;

      const netPosition = receivables - payables;

      const lowStockRows = (lowStockRes.data ?? []) as Array<{
        id: string;
        quantity_in_stock: number;
        reorder_level: number | null;
      }>;

      const lowStockProductsRows = ((lowStockProductsRes.data ?? []) as LowStockRow[])
        .filter(isLowStock)
        .slice(0, 5);

      setFinancialStats({
        rangeDays,
        totalSales,
        totalCollections,
        totalSupplierPayments,
        totalExpenses,
        receivables,
        payables,
        cashPosition,
        netPosition,
        purchaseValue,
        lowStockCount: lowStockRows.filter(isLowStock).length,
        pendingWarehouseReceipts: Number(pendingWarehouseRes.count ?? 0),
      });

      setTopDebtors((topDebtorsRes.data ?? []) as DebtorRow[]);
      setTopSuppliers((topSuppliersRes.data ?? []) as SupplierPayableRow[]);
      setTopProducts((topProductsRes.data ?? []) as ProductSalesRow[]);
      setLowStockProducts(lowStockProductsRows);
    } catch (e: any) {
      console.error("fetchFinancialDashboard error:", e);
      toast({
        title: "Failed to load financial dashboard",
        description: e?.message || "Could not fetch dashboard summary.",
        variant: "destructive",
      });
    } finally {
      setFinancialLoading(false);
    }
  };

  const fetchBranchBreakdown = async () => {
    if (!isAdmin || !branches.length || !companyId) return;

    setBreakdownLoading(true);
    try {
      const rows = await Promise.all(
        branches.map(async (b) => {
          const [
            productsRes,
            lowStockRes,
            receiptsRes,
            attendanceRes,
            debtorsRes,
            todaySalesRes,
            purchasesRes,
          ] = await Promise.all([
            sb
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .eq("branch_id", b.id),

            sb
              .from("products")
              .select("id,quantity_in_stock,reorder_level")
              .eq("company_id", companyId)
              .eq("branch_id", b.id),

            sb
              .from("warehouse_receipts")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .eq("branch_id", b.id)
              .eq("status", "pending"),

            sb
              .from("attendance")
              .select("id", { count: "exact", head: true })
              .eq("branch_id", b.id)
              .eq("date", today),

            sb
              .from("customers")
              .select("id,current_balance")
              .eq("company_id", companyId)
              .eq("branch_id", b.id),

            sb
              .from("sales")
              .select("total_amount,is_returned")
              .eq("company_id", companyId)
              .eq("branch_id", b.id)
              .gte("created_at", `${today}T00:00:00`)
              .lte("created_at", `${today}T23:59:59`),

            sb
              .from("purchases")
              .select("id,balance_due,stock_status")
              .eq("company_id", companyId)
              .eq("branch_id", b.id)
              .neq("stock_status", "cancelled"),
          ]);

          const debtorRows = (debtorsRes.data ?? []) as any[];
          const outstandingDebt = debtorRows.reduce(
            (sum: number, row: any) => sum + Number(row?.current_balance || 0),
            0
          );

          const customersOwing = debtorRows.filter(
            (row: any) => Number(row?.current_balance || 0) > 0
          ).length;

          const todaySales = (todaySalesRes.data ?? [])
            .filter((row: any) => row?.is_returned !== true)
            .reduce(
              (sum: number, row: any) => sum + Number(row?.total_amount || 0),
              0
            );

          const payables = (purchasesRes.data ?? []).reduce(
            (sum: number, row: any) => sum + Number(row?.balance_due || 0),
            0
          );

          const lowStock = ((lowStockRes.data ?? []) as any[]).filter(isLowStock).length;

          return {
            branchId: b.id,
            branchName: b.name,
            totalProducts: Number(productsRes.count ?? 0),
            lowStock,
            pendingStockReceipts: Number(receiptsRes.count ?? 0),
            todayAttendance: Number(attendanceRes.count ?? 0),
            outstandingDebt,
            customersOwing,
            todaySales,
            payables,
          } as BranchBreakdownRow;
        })
      );

      setBranchBreakdown(rows);
    } catch (e) {
      console.warn("[Dashboard] branch breakdown failed:", e);
      setBranchBreakdown([]);
    } finally {
      setBreakdownLoading(false);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const salesPromise = isCashier
        ? applyBranchScope(
            sb
              .from("sales")
              .select("total_amount,is_returned")
              .gte("created_at", `${today}T00:00:00`),
            activeBranchId
          )
        : Promise.resolve({ data: [] as any[] } as any);

      const totalProductsPromise = isAdmin
        ? applyBranchScope(
            sb.from("products").select("id", { count: "exact", head: true }),
            activeBranchId
          )
        : Promise.resolve({ count: 0 } as any);

      const lowStockPromise = isAdmin
        ? applyBranchScope(
            sb
              .from("products")
              .select("id,quantity_in_stock,reorder_level"),
            activeBranchId
          )
        : Promise.resolve({ data: [] as any[] } as any);

      const pendingOrdersPromise = isWarehouse
        ? sb
            .from("sale_coupons")
            .select(
              `
                id,
                sales:sales!inner ( id, status )
              `,
              { count: "exact", head: true }
            )
            .is("revoked_at", null)
            .not("received_at", "is", null)
            .eq("sales.status", "pending")
        : Promise.resolve({ count: 0 } as any);

      const attendancePromise = isAdmin
        ? applyBranchScope(
            sb
              .from("attendance")
              .select("id", { count: "exact", head: true })
              .eq("date", today),
            activeBranchId
          )
        : Promise.resolve({ count: 0 } as any);

      const pendingStockReceiptsPromise = isAdmin
        ? applyBranchScope(
            sb
              .from("warehouse_receipts")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending"),
            activeBranchId
          )
        : Promise.resolve({ count: 0 } as any);

      const myPendingReceiptsPromise =
        isWarehouse && user?.id
          ? sb
              .from("warehouse_receipts")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending")
              .eq("created_by", user.id)
          : Promise.resolve({ count: 0 } as any);

      const outstandingDebtPromise =
        canSeeDebtWidgets && companyId
          ? applyBranchScope(
              sb
                .from("sales")
                .select("customer_id,balance_due")
                .eq("company_id", companyId)
                .gt("balance_due", 0),
              activeBranchId
            )
          : Promise.resolve({ data: [] as any[] } as any);

      const todayPaymentFlowPromise =
        canSeeDebtWidgets && companyId
          ? applyBranchScope(
              sb
                .from("sales")
                .select("total_amount,amount_paid,balance_due,payment_status,created_at")
                .eq("company_id", companyId)
                .gte("created_at", `${today}T00:00:00`)
                .lte("created_at", `${today}T23:59:59`),
              activeBranchId
            )
          : Promise.resolve({ data: [] as any[] } as any);

      const [
        salesRes,
        productsRes,
        lowStockRes,
        pendingOrdersRes,
        attendanceRes,
        pendingStockReceiptsRes,
        myPendingReceiptsRes,
        debtRes,
        todayFlowRes,
      ] = await Promise.all([
        salesPromise,
        totalProductsPromise,
        lowStockPromise,
        pendingOrdersPromise,
        attendancePromise,
        pendingStockReceiptsPromise,
        myPendingReceiptsPromise,
        outstandingDebtPromise,
        todayPaymentFlowPromise,
      ]);

      const todaySales =
        (salesRes?.data ?? [])
          .filter((s: any) => s?.is_returned !== true)
          .reduce(
            (sum: number, s: any) => sum + Number(s?.total_amount ?? 0),
            0
          ) || 0;

      const debtRows = ((debtRes as any)?.data ?? []) as any[];
      const outstandingDebt = debtRows.reduce(
        (sum: number, s: any) => sum + Number(s?.balance_due ?? 0),
        0
      );

      const customersOwing = new Set(
        debtRows.map((s: any) => String(s?.customer_id || "")).filter(Boolean)
      ).size;

      const unpaidCreditSales = debtRows.length;

      const todayFlowRows = ((todayFlowRes as any)?.data ?? []) as any[];
      const cashCollectedToday = todayFlowRows.reduce(
        (sum: number, s: any) => sum + Number(s?.amount_paid ?? 0),
        0
      );
      const creditSoldToday = todayFlowRows.reduce(
        (sum: number, s: any) => sum + Number(s?.balance_due ?? 0),
        0
      );

      const lowStock = ((lowStockRes?.data ?? []) as any[]).filter(isLowStock).length;

      setStats({
        todaySales,
        totalProducts: Number(productsRes?.count ?? 0),
        lowStock,
        pendingOrders: Number(pendingOrdersRes?.count ?? 0),
        todayAttendance: Number(attendanceRes?.count ?? 0),
        pendingStockReceipts: Number(pendingStockReceiptsRes?.count ?? 0),
        myPendingReceipts: Number(myPendingReceiptsRes?.count ?? 0),
        outstandingDebt,
        customersOwing,
        unpaidCreditSales,
        cashCollectedToday,
        creditSoldToday,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Today's Sales",
      value: formatCurrency(stats.todaySales),
      icon: TrendingUp,
      color: "text-green-400",
      roles: ["cashier"],
      onClick: () => navigate("/pos"),
    },
    {
      title: "Cash Collected Today",
      value: formatCurrency(stats.cashCollectedToday),
      icon: BadgeDollarSign,
      color: "text-emerald-400",
      roles: ["admin", "cashier"],
      onClick: () => navigate("/customer-payments"),
    },
    {
      title: "Credit Sold Today",
      value: formatCurrency(stats.creditSoldToday),
      icon: Wallet,
      color: "text-amber-400",
      roles: ["admin", "cashier"],
      onClick: () => navigate("/customer-payments"),
    },
    {
      title: "Outstanding Debt",
      value: formatCurrency(stats.outstandingDebt),
      icon: Wallet,
      color: "text-yellow-400",
      roles: ["admin", "cashier"],
      onClick: () => navigate("/customer-payments"),
    },
    {
      title: "Customers Owing",
      value: stats.customersOwing,
      icon: Users,
      color: "text-orange-400",
      roles: ["admin", "cashier"],
      onClick: () => navigate("/customer-payments"),
    },
    {
      title: "Unpaid Credit Sales",
      value: stats.unpaidCreditSales,
      icon: FileText,
      color: "text-red-400",
      roles: ["admin", "cashier"],
      onClick: () => navigate("/customer-payments"),
    },
    {
      title: "Total Products",
      value: stats.totalProducts,
      icon: Package,
      color: "text-blue-400",
      roles: ["admin"],
      onClick: () => navigate("/inventory"),
    },
    {
      title: "Low Stock Items",
      value: stats.lowStock,
      icon: AlertTriangle,
      color: "text-red-400",
      roles: ["admin"],
      onClick: () => navigate("/inventory"),
    },
    {
      title: "Pending Orders",
      value: stats.pendingOrders,
      icon: Warehouse,
      color: "text-orange-400",
      roles: ["warehouse"],
      onClick: () => navigate("/warehouse"),
    },
    {
      title: "Pending Stock Receipts",
      value: stats.pendingStockReceipts,
      icon: ClipboardCheck,
      color: "text-yellow-400",
      roles: ["admin"],
      onClick: () => navigate("/stock-approvals"),
    },
    {
      title: "My Pending Receipts",
      value: stats.myPendingReceipts,
      icon: ClipboardList,
      color: "text-cyan-400",
      roles: ["warehouse"],
      onClick: () => navigate("/warehouse/my-receipts"),
    },
    {
      title: "Today's Attendance",
      value: stats.todayAttendance,
      icon: Clock,
      color: "text-purple-400",
      roles: ["admin"],
      onClick: () => navigate("/attendance"),
    },
  ];

  const visibleCards = statCards.filter((card) => {
    if (isAdmin) return card.roles.includes("admin");
    return card.roles.some((role) => roles.includes(role as any));
  });

  const showReportsSection =
    canSeeDailySales || canSeeStockBalance || canSeeStockApprovals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome, {profile?.full_name || "User"}!
        </h1>
        <p className="mt-1 text-slate-400">
          Here&apos;s what&apos;s happening in your business today
        </p>
      </div>

      {isAdmin && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                Smart Financial Dashboard
              </CardTitle>
              <p className="mt-1 text-sm text-slate-400">
                Executive summary for cash, receivables, payables and operations
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={
                    financialStats.rangeDays === option.key ? "default" : "outline"
                  }
                  onClick={() =>
                    setFinancialStats((prev) => ({
                      ...prev,
                      rangeDays: option.key,
                    }))
                  }
                  className={
                    financialStats.rangeDays === option.key
                      ? ""
                      : "border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                  }
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {option.label}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatMiniCard
                title="Cash Position"
                value={financialLoading ? "..." : formatCurrency(financialStats.cashPosition)}
                subtitle="sales + collections - supplier cash out - expenses"
                icon={Wallet}
                valueClassName="text-emerald-300"
              />
              <StatMiniCard
                title="Receivables"
                value={financialLoading ? "..." : formatCurrency(financialStats.receivables)}
                subtitle="customers owe you"
                icon={ArrowDownRight}
                valueClassName="text-amber-300"
              />
              <StatMiniCard
                title="Payables"
                value={financialLoading ? "..." : formatCurrency(financialStats.payables)}
                subtitle="open purchase balances"
                icon={ArrowUpRight}
                valueClassName="text-rose-300"
              />
              <StatMiniCard
                title="Net Position"
                value={financialLoading ? "..." : formatCurrency(financialStats.netPosition)}
                subtitle="receivables - payables"
                icon={TrendingUp}
                valueClassName="text-cyan-300"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatMiniCard
                title={`Sales (${financialStats.rangeDays} days)`}
                value={financialLoading ? "..." : formatCurrency(financialStats.totalSales)}
                icon={Receipt}
              />
              <StatMiniCard
                title="Collections"
                value={
                  financialLoading ? "..." : formatCurrency(financialStats.totalCollections)
                }
                icon={BadgeDollarSign}
                valueClassName="text-emerald-300"
              />
              <StatMiniCard
                title="Supplier Cash Out"
                value={
                  financialLoading
                    ? "..."
                    : formatCurrency(financialStats.totalSupplierPayments)
                }
                icon={Building2}
                valueClassName="text-orange-300"
              />
              <StatMiniCard
                title="Expenses"
                value={financialLoading ? "..." : formatCurrency(financialStats.totalExpenses)}
                icon={FileText}
                valueClassName="text-red-300"
              />
              <StatMiniCard
                title="Purchases"
                value={financialLoading ? "..." : formatCurrency(financialStats.purchaseValue)}
                icon={ShoppingCart}
                valueClassName="text-sky-300"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatMiniCard
                title="Low Stock Count"
                value={financialLoading ? "..." : String(financialStats.lowStockCount)}
                icon={AlertTriangle}
                subtitle="items at or below reorder level"
                valueClassName="text-yellow-300"
              />
              <StatMiniCard
                title="Pending Warehouse Receipts"
                value={
                  financialLoading ? "..." : String(financialStats.pendingWarehouseReceipts)
                }
                icon={Warehouse}
                subtitle="awaiting review / approval"
                valueClassName="text-purple-300"
              />
              <StatMiniCard
                title="Today Cash Collected"
                value={formatCurrency(stats.cashCollectedToday)}
                icon={BadgeDollarSign}
                subtitle="from today's sales"
                valueClassName="text-emerald-300"
              />
              <StatMiniCard
                title="Today Credit Sold"
                value={formatCurrency(stats.creditSoldToday)}
                icon={Wallet}
                subtitle="still outstanding from today's sales"
                valueClassName="text-amber-300"
              />
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Accounting note</p>
              <p className="mt-2 text-slate-400">
                Payables now come from <span className="text-white">purchase balances</span>,
                and supplier cash out comes from <span className="text-white">purchases.amount_paid</span>.
                This keeps the dashboard aligned even when standalone supplier payment rows do not fully represent all purchase-time payments.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate("/customer-payments")}>
                Open Customer Payments
              </Button>
              <Button
                variant="outline"
                className="border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                onClick={() => navigate("/supplier-payments")}
              >
                Open Supplier Payments
              </Button>
              <Button
                variant="outline"
                className="border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                onClick={() => navigate("/expenses")}
              >
                Open Expenses
              </Button>
              <Button
                variant="outline"
                className="border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                onClick={() => navigate("/inventory")}
              >
                Open Inventory
              </Button>
              <Button
                variant="outline"
                className="border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                onClick={() => navigate("/stock-approvals")}
              >
                Open Stock Approvals
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {visibleCards.map((stat) => (
          <Card
            key={stat.title}
            className={`border-slate-700 bg-slate-800/50 ${
              stat.onClick ? "cursor-pointer transition hover:bg-slate-800" : ""
            }`}
            onClick={stat.onClick}
            title={stat.onClick ? "Open" : undefined}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {loading ? "..." : (stat.value as any)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {canSeeDebtWidgets && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Wallet className="h-5 w-5 text-amber-400" />
              Receivables Overview
            </CardTitle>
            <p className="text-sm text-slate-400">
              Outstanding customer balances and collection status.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-400">Outstanding Debt</p>
              <p className="mt-1 text-xl font-bold text-amber-300">
                {formatCurrency(stats.outstandingDebt)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-400">Customers Owing</p>
              <p className="mt-1 text-xl font-bold text-white">{stats.customersOwing}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-400">Cash Collected Today</p>
              <p className="mt-1 text-xl font-bold text-emerald-300">
                {formatCurrency(stats.cashCollectedToday)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-400">Credit Sold Today</p>
              <p className="mt-1 text-xl font-bold text-orange-300">
                {formatCurrency(stats.creditSoldToday)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1 md:col-span-2 xl:col-span-4">
              <Button onClick={() => navigate("/customer-payments")}>
                Open Customer Payments
              </Button>
              {canSeeDailySales && (
                <Button
                  variant="outline"
                  className="border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                  onClick={() => navigate("/reports/daily-sales")}
                >
                  Open Daily Sales Report
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Users className="h-5 w-5 text-amber-400" />
                Top Debtors
              </CardTitle>
            </CardHeader>
            <CardContent>
              {financialLoading ? (
                <p className="text-sm text-slate-400">Loading debtors...</p>
              ) : topDebtors.length === 0 ? (
                <p className="text-sm text-slate-400">No outstanding customer balances.</p>
              ) : (
                <div className="space-y-3">
                  {topDebtors.map((row) => (
                    <div
                      key={row.customer_id}
                      className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{row.full_name}</p>
                        <p className="text-xs text-slate-400">
                          {row.phone || "No phone"} • Last payment:{" "}
                          {formatDate(row.last_payment_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-amber-300">
                          {formatCurrency(row.current_balance)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Paid {formatCurrency(row.total_paid)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Building2 className="h-5 w-5 text-rose-400" />
                Top Suppliers to Pay
              </CardTitle>
            </CardHeader>
            <CardContent>
              {financialLoading ? (
                <p className="text-sm text-slate-400">Loading suppliers...</p>
              ) : topSuppliers.length === 0 ? (
                <p className="text-sm text-slate-400">No supplier balances pending.</p>
              ) : (
                <div className="space-y-3">
                  {topSuppliers.map((row) => (
                    <div
                      key={row.supplier_id}
                      className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{row.name}</p>
                        <p className="text-xs text-slate-400">
                          {row.phone || "No phone"} • Last payment:{" "}
                          {formatDate(row.last_payment_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-rose-300">
                          {formatCurrency(row.current_balance)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Paid {formatCurrency(row.total_paid)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                Top Selling Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              {financialLoading ? (
                <p className="text-sm text-slate-400">Loading products...</p>
              ) : topProducts.length === 0 ? (
                <p className="text-sm text-slate-400">No product sales yet.</p>
              ) : (
                <div className="space-y-3">
                  {topProducts.map((row) => (
                    <div
                      key={row.product_id}
                      className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{row.product_name}</p>
                        <p className="text-xs text-slate-400">
                          SKU: {row.sku || "—"} • Stock: {row.quantity_in_stock}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-emerald-300">
                          {row.total_qty_sold} sold
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatCurrency(row.total_sales_value)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                Low Stock Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              {financialLoading ? (
                <p className="text-sm text-slate-400">Loading stock alerts...</p>
              ) : lowStockProducts.length === 0 ? (
                <p className="text-sm text-slate-400">No low stock products found.</p>
              ) : (
                <div className="space-y-3">
                  {lowStockProducts.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{row.name}</p>
                        <p className="text-xs text-slate-400">
                          SKU: {row.sku || "—"} • Reorder level: {row.reorder_level ?? 0}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-yellow-300">
                          {row.quantity_in_stock} left
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {isAdmin && !activeBranchId && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="text-white">All Branches Breakdown</CardTitle>
            <p className="text-sm text-slate-400">
              This appears only when you selected <b>All branches</b>.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Products / Low stock / Pending receipts / Attendance / Debt / Payables
              </p>
              <Button
                variant="secondary"
                onClick={fetchBranchBreakdown}
                disabled={breakdownLoading || branches.length === 0}
              >
                {breakdownLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            {breakdownLoading ? (
              <p className="text-sm text-slate-400">Loading breakdown...</p>
            ) : branchBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400">No breakdown data yet.</p>
            ) : (
              <div className="space-y-2">
                {branchBreakdown.map((r) => (
                  <div
                    key={r.branchId}
                    className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-white">{r.branchName}</p>
                      <p className="text-xs text-slate-400">{r.branchId}</p>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-8">
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Products:</span> {r.totalProducts}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Low stock:</span> {r.lowStock}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Pending receipts:</span>{" "}
                        {r.pendingStockReceipts}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Attendance:</span>{" "}
                        {r.todayAttendance}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Today's sales:</span>{" "}
                        {formatCurrency(r.todaySales)}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Debt:</span>{" "}
                        {formatCurrency(r.outstandingDebt)}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Owing customers:</span>{" "}
                        {r.customersOwing}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Payables:</span>{" "}
                        {formatCurrency(r.payables)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showReportsSection && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5" />
              Reports
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            {canSeeDailySales && (
              <Card
                className="cursor-pointer border-slate-700 bg-slate-900/60 transition hover:bg-slate-800"
                onClick={() => navigate("/reports/daily-sales")}
              >
                <CardContent className="p-4">
                  <h3 className="font-semibold text-white">Daily Sales Report</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Quantity sold per item per day
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">Access: Cashier only</p>
                </CardContent>
              </Card>
            )}

            {canSeeStockBalance && (
              <Card
                className="cursor-pointer border-slate-700 bg-slate-900/60 transition hover:bg-slate-800"
                onClick={() => navigate("/reports/stock-balance")}
              >
                <CardContent className="p-4">
                  <h3 className="font-semibold text-white">Stock Balance Report</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Remaining stock after sales day
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">Access: Warehouse only</p>
                </CardContent>
              </Card>
            )}

            {canSeeStockApprovals && (
              <Card
                className="cursor-pointer border-slate-700 bg-slate-900/60 transition hover:bg-slate-800"
                onClick={() => navigate("/stock-approvals")}
              >
                <CardContent className="p-4">
                  <h3 className="font-semibold text-white">Stock Approvals</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Review warehouse receiving before stock increases
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">Access: Admin only</p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="text-white">Branch Management</CardTitle>
            <p className="text-sm text-slate-400">
              Create branches for your company. Staff can be assigned per branch.
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid items-end gap-3 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-slate-200">New Branch Name</Label>
                <Input
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="e.g. Tamale Branch"
                  className="border-slate-700 bg-slate-900/60 text-white"
                />
              </div>
              <Button
                onClick={createBranch}
                disabled={creatingBranch || !newBranchName.trim()}
                className="w-full"
              >
                {creatingBranch ? "Creating..." : "Create Branch"}
              </Button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-white">Your Branches</h3>
                <Button
                  variant="secondary"
                  onClick={fetchBranches}
                  disabled={branchesLoading}
                >
                  {branchesLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              <div className="space-y-2">
                {branchesLoading ? (
                  <p className="text-sm text-slate-400">Loading branches...</p>
                ) : branches.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No branches found. Create your first branch above.
                  </p>
                ) : (
                  branches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2"
                    >
                      <div>
                        <p className="font-medium text-white">{b.name}</p>
                        <p className="text-xs text-slate-400">
                          {b.code || "—"} • {b.id}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {b.is_active === false ? "Inactive" : "Active"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {roles.length === 0 && !isAdmin && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="pt-6">
            <p className="text-yellow-400">
              ⚠️ No role has been assigned to your account yet. Please contact an
              administrator to get access to system features.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}