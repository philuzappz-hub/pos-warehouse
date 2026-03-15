// src/pages/Dashboard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BadgeDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Package,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface DashboardStats {
  todaySales: number;
  totalProducts: number;
  lowStock: number;

  pendingOrders: number;

  todayAttendance: number;

  pendingStockReceipts: number; // admin
  myPendingReceipts: number; // warehouse user

  // ✅ debt / payment visibility
  outstandingDebt: number;
  customersOwing: number;
  unpaidCreditSales: number;
  cashCollectedToday: number;
  creditSoldToday: number;
}

type BranchRow = {
  id: string;
  name: string;
  code: string;
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
};

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

  const [loading, setLoading] = useState(true);

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [branchBreakdown, setBranchBreakdown] = useState<BranchBreakdownRow[]>([]);

  const isCashier = useMemo(() => roles.includes("cashier" as any), [roles]);
  const isWarehouse = useMemo(() => roles.includes("warehouse" as any), [roles]);

  const canSeeDailySales = isCashier;
  const canSeeStockBalance = isWarehouse;
  const canSeeStockApprovals = isAdmin;
  const canSeeDebtWidgets = isAdmin || isCashier;

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isWarehouse, isCashier, user?.id, activeBranchId, profile?.company_id]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!profile?.company_id) return;
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, profile?.company_id]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!profile?.company_id) return;

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

      const rows = (data ?? []) as BranchRow[];
      setBranches(rows);
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

    const companyId = profile?.company_id;
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
        description: e?.message || "This is usually an RLS policy issue on the branches table.",
        variant: "destructive",
      });
    } finally {
      setCreatingBranch(false);
    }
  };

  const fetchBranchBreakdown = async () => {
    if (!isAdmin) return;
    if (!branches.length) return;
    if (!profile?.company_id) return;

    setBreakdownLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      const rows = await Promise.all(
        branches.map(async (b) => {
          const [
            productsRes,
            lowStockRes,
            receiptsRes,
            attendanceRes,
            debtSalesRes,
          ] = await Promise.all([
            sb.from("products").select("id", { count: "exact", head: true }).eq("branch_id", b.id),

            sb
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("branch_id", b.id)
              .lt("quantity_in_stock", 10),

            sb
              .from("warehouse_receipts")
              .select("id", { count: "exact", head: true })
              .eq("branch_id", b.id)
              .eq("status", "pending"),

            sb
              .from("attendance")
              .select("id", { count: "exact", head: true })
              .eq("branch_id", b.id)
              .eq("date", today),

            sb
              .from("sales")
              .select("customer_id,balance_due")
              .eq("company_id", profile.company_id)
              .eq("branch_id", b.id)
              .gt("balance_due", 0),
          ]);

          const debtRows = (debtSalesRes?.data ?? []) as any[];
          const outstandingDebt = debtRows.reduce(
            (sum: number, r: any) => sum + Number(r?.balance_due || 0),
            0
          );
          const owingCustomers = new Set(
            debtRows.map((r: any) => String(r?.customer_id || "")).filter(Boolean)
          );

          return {
            branchId: b.id,
            branchName: b.name,
            totalProducts: Number(productsRes?.count ?? 0),
            lowStock: Number(lowStockRes?.count ?? 0),
            pendingStockReceipts: Number(receiptsRes?.count ?? 0),
            todayAttendance: Number(attendanceRes?.count ?? 0),
            outstandingDebt,
            customersOwing: owingCustomers.size,
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
      const today = new Date().toISOString().split("T")[0];
      const companyId = profile?.company_id ?? null;

      const salesPromise = isCashier
        ? applyBranchScope(
            sb.from("sales").select("total_amount").gte("created_at", `${today}T00:00:00`),
            activeBranchId
          )
        : Promise.resolve({ data: [] as any[] } as any);

      const totalProductsPromise = isAdmin
        ? applyBranchScope(sb.from("products").select("id", { count: "exact", head: true }), activeBranchId)
        : Promise.resolve({ count: 0 } as any);

      const lowStockPromise = isAdmin
        ? applyBranchScope(
            sb
              .from("products")
              .select("id", { count: "exact", head: true })
              .lt("quantity_in_stock", 10),
            activeBranchId
          )
        : Promise.resolve({ count: 0 } as any);

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
            sb.from("attendance").select("id", { count: "exact", head: true }).eq("date", today),
            activeBranchId
          )
        : Promise.resolve({ count: 0 } as any);

      const pendingStockReceiptsPromise = isAdmin
        ? applyBranchScope(
            sb.from("warehouse_receipts").select("id", { count: "exact", head: true }).eq("status", "pending"),
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
                .select("customer_id,balance_due,payment_status,amount_paid,created_at")
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
        (salesRes as any)?.data?.reduce(
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

      setStats({
        todaySales,
        totalProducts: Number(productsRes?.count ?? 0),
        lowStock: Number(lowStockRes?.count ?? 0),
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
      value: `GHS ${money(stats.todaySales)}`,
      icon: TrendingUp,
      color: "text-green-500",
      roles: ["cashier"],
      onClick: () => navigate("/pos"),
    },
    {
      title: "Cash Collected Today",
      value: `GHS ${money(stats.cashCollectedToday)}`,
      icon: BadgeDollarSign,
      color: "text-emerald-400",
      roles: ["admin", "cashier"],
      onClick: () => navigate("/customer-payments"),
    },
    {
      title: "Credit Sold Today",
      value: `GHS ${money(stats.creditSoldToday)}`,
      icon: Wallet,
      color: "text-amber-400",
      roles: ["admin", "cashier"],
      onClick: () => navigate("/customer-payments"),
    },
    {
      title: "Outstanding Debt",
      value: `GHS ${money(stats.outstandingDebt)}`,
      icon: Wallet,
      color: "text-yellow-500",
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
      color: "text-blue-500",
      roles: ["admin"],
      onClick: () => navigate("/inventory"),
    },
    {
      title: "Low Stock Items",
      value: stats.lowStock,
      icon: Package,
      color: "text-red-500",
      roles: ["admin"],
      onClick: () => navigate("/inventory"),
    },
    {
      title: "Pending Orders",
      value: stats.pendingOrders,
      icon: Warehouse,
      color: "text-orange-500",
      roles: ["warehouse"],
      onClick: () => navigate("/warehouse"),
    },
    {
      title: "Pending Stock Receipts",
      value: stats.pendingStockReceipts,
      icon: ClipboardCheck,
      color: "text-yellow-500",
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
      color: "text-purple-500",
      roles: ["admin"],
      onClick: () => navigate("/attendance"),
    },
  ];

  const visibleCards = statCards.filter((card) => {
    if (isAdmin) return card.roles.includes("admin");
    return card.roles.some((role) => roles.includes(role as any));
  });

  const showReportsSection = canSeeDailySales || canSeeStockBalance || canSeeStockApprovals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome, {profile?.full_name || "User"}!
        </h1>
        <p className="text-slate-400 mt-1">Here's what's happening today</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {visibleCards.map((stat) => (
          <Card
            key={stat.title}
            className={`bg-slate-800/50 border-slate-700 ${
              stat.onClick ? "cursor-pointer hover:bg-slate-800 transition" : ""
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
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-amber-400" />
              Receivables Overview
            </CardTitle>
            <p className="text-slate-400 text-sm">
              Outstanding customer balances and collection status.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-400">Outstanding Debt</p>
              <p className="mt-1 text-xl font-bold text-amber-300">
                GHS {money(stats.outstandingDebt)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-400">Customers Owing</p>
              <p className="mt-1 text-xl font-bold text-white">
                {stats.customersOwing}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-400">Cash Collected Today</p>
              <p className="mt-1 text-xl font-bold text-emerald-300">
                GHS {money(stats.cashCollectedToday)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-400">Credit Sold Today</p>
              <p className="mt-1 text-xl font-bold text-orange-300">
                GHS {money(stats.creditSoldToday)}
              </p>
            </div>

            <div className="md:col-span-2 xl:col-span-4 flex flex-wrap gap-2 pt-1">
              <Button onClick={() => navigate("/customer-payments")}>
                Open Customer Payments
              </Button>
              {canSeeDailySales && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/reports/daily-sales")}
                >
                  Open Daily Sales Report
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && !activeBranchId && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">All Branches Breakdown</CardTitle>
            <p className="text-slate-400 text-sm">
              This appears only when you selected <b>All branches</b>.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Products / Low stock / Pending receipts / Attendance / Debt
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
              <p className="text-slate-400 text-sm">Loading breakdown…</p>
            ) : branchBreakdown.length === 0 ? (
              <p className="text-slate-400 text-sm">No breakdown data yet.</p>
            ) : (
              <div className="space-y-2">
                {branchBreakdown.map((r) => (
                  <div
                    key={r.branchId}
                    className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-white font-medium">{r.branchName}</p>
                      <p className="text-xs text-slate-400">{r.branchId}</p>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-6">
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Products:</span>{" "}
                        {r.totalProducts}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Low stock:</span>{" "}
                        {r.lowStock}
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
                        <span className="text-slate-500">Debt:</span> GHS{" "}
                        {money(r.outstandingDebt)}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Owing customers:</span>{" "}
                        {r.customersOwing}
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
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Reports
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            {canSeeDailySales && (
              <Card
                className="cursor-pointer bg-slate-900/60 border-slate-700 hover:bg-slate-800 transition"
                onClick={() => navigate("/reports/daily-sales")}
              >
                <CardContent className="p-4">
                  <h3 className="text-white font-semibold">Daily Sales Report</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Quantity sold per item per day
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2">Access: Cashier only</p>
                </CardContent>
              </Card>
            )}

            {canSeeStockBalance && (
              <Card
                className="cursor-pointer bg-slate-900/60 border-slate-700 hover:bg-slate-800 transition"
                onClick={() => navigate("/reports/stock-balance")}
              >
                <CardContent className="p-4">
                  <h3 className="text-white font-semibold">Stock Balance Report</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Remaining stock after sales day
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2">Access: Warehouse only</p>
                </CardContent>
              </Card>
            )}

            {canSeeStockApprovals && (
              <Card
                className="cursor-pointer bg-slate-900/60 border-slate-700 hover:bg-slate-800 transition"
                onClick={() => navigate("/stock-approvals")}
              >
                <CardContent className="p-4">
                  <h3 className="text-white font-semibold">Stock Approvals</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Review warehouse receiving before stock increases
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2">Access: Admin only</p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Branch Management</CardTitle>
            <p className="text-slate-400 text-sm">
              Create branches for your company. Staff can be assigned per branch.
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3 items-end">
              <div className="sm:col-span-2 space-y-2">
                <Label className="text-slate-200">New Branch Name</Label>
                <Input
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="e.g. Tamale Branch"
                  className="bg-slate-900/60 border-slate-700 text-white"
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold">Your Branches</h3>
                <Button variant="secondary" onClick={fetchBranches} disabled={branchesLoading}>
                  {branchesLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              <div className="space-y-2">
                {branchesLoading ? (
                  <p className="text-slate-400 text-sm">Loading branches…</p>
                ) : branches.length === 0 ? (
                  <p className="text-slate-400 text-sm">
                    No branches found. Create your first branch above.
                  </p>
                ) : (
                  branches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2"
                    >
                      <div>
                        <p className="text-white font-medium">{b.name}</p>
                        <p className="text-xs text-slate-400">
                          {b.code} • {b.id}
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
        <Card className="bg-yellow-500/10 border-yellow-500/50">
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