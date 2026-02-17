// src/pages/Dashboard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Package,
  TrendingUp,
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
};

function makeBranchCode(name: string) {
  // e.g. "Walewale Branch" -> "WALE" + random 3 digits => "WALE-472"
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

export default function Dashboard() {
  const { user, profile, roles, isAdmin, activeBranchId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // ✅ fixes TS “Type instantiation is excessively deep”
  const sb = supabase as any;

  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    totalProducts: 0,
    lowStock: 0,
    pendingOrders: 0,
    todayAttendance: 0,
    pendingStockReceipts: 0,
    myPendingReceipts: 0,
  });

  const [loading, setLoading] = useState(true);

  // Branch UI state (Admin only)
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  // ✅ Admin-only: branch breakdown when All branches selected
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [branchBreakdown, setBranchBreakdown] = useState<BranchBreakdownRow[]>([]);

  const isCashier = useMemo(() => roles.includes("cashier" as any), [roles]);
  const isWarehouse = useMemo(() => roles.includes("warehouse" as any), [roles]);

  /**
   * ✅ IMPORTANT:
   * Admin should NOT automatically see Cashier/Warehouse features.
   * Admin sees only Admin features.
   * (If you ever want admin to also do cashier/warehouse work, assign BOTH roles.)
   */
  const canSeeDailySales = isCashier;
  const canSeeStockBalance = isWarehouse;
  const canSeeStockApprovals = isAdmin;

  // ✅ refresh stats when branch changes (for admin)
  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isWarehouse, isCashier, user?.id, activeBranchId]);

  // ✅ Load branches (Admin only)
  useEffect(() => {
    if (!isAdmin) return;
    if (!profile?.company_id) return;
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, profile?.company_id]);

  // ✅ If Admin is viewing ALL branches, load per-branch breakdown
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

    setBreakdownLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      const rows = await Promise.all(
        branches.map(async (b) => {
          const [productsRes, lowStockRes, receiptsRes, attendanceRes] = await Promise.all([
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
          ]);

          return {
            branchId: b.id,
            branchName: b.name,
            totalProducts: Number(productsRes?.count ?? 0),
            lowStock: Number(lowStockRes?.count ?? 0),
            pendingStockReceipts: Number(receiptsRes?.count ?? 0),
            todayAttendance: Number(attendanceRes?.count ?? 0),
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

      // Sales stats should be cashier-only (branch-scoped by RLS / cashier context)
      const salesPromise = isCashier
        ? sb.from("sales").select("total_amount").gte("created_at", today)
        : Promise.resolve({ data: [] as any[] } as any);

      // Admin inventory stats -> branch-aware for selected branch
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

      // Warehouse pending orders (leave as you had it)
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

      // Attendance admin-only -> branch-aware
      const attendancePromise = isAdmin
        ? applyBranchScope(
            sb.from("attendance").select("id", { count: "exact", head: true }).eq("date", today),
            activeBranchId
          )
        : Promise.resolve({ count: 0 } as any);

      // Stock receipts approvals admin-only -> branch-aware
      const pendingStockReceiptsPromise = isAdmin
        ? applyBranchScope(
            sb.from("warehouse_receipts").select("id", { count: "exact", head: true }).eq("status", "pending"),
            activeBranchId
          )
        : Promise.resolve({ count: 0 } as any);

      // My pending receipts warehouse-only
      const myPendingReceiptsPromise =
        isWarehouse && user?.id
          ? sb
              .from("warehouse_receipts")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending")
              .eq("created_by", user.id)
          : Promise.resolve({ count: 0 } as any);

      const [
        salesRes,
        productsRes,
        lowStockRes,
        pendingOrdersRes,
        attendanceRes,
        pendingStockReceiptsRes,
        myPendingReceiptsRes,
      ] = await Promise.all([
        salesPromise,
        totalProductsPromise,
        lowStockPromise,
        pendingOrdersPromise,
        attendancePromise,
        pendingStockReceiptsPromise,
        myPendingReceiptsPromise,
      ]);

      const todaySales =
        (salesRes as any)?.data?.reduce(
          (sum: number, s: any) => sum + Number(s?.total_amount ?? 0),
          0
        ) || 0;

      setStats({
        todaySales,
        totalProducts: Number(productsRes?.count ?? 0),
        lowStock: Number(lowStockRes?.count ?? 0),
        pendingOrders: Number(pendingOrdersRes?.count ?? 0),
        todayAttendance: Number(attendanceRes?.count ?? 0),
        pendingStockReceipts: Number(pendingStockReceiptsRes?.count ?? 0),
        myPendingReceipts: Number(myPendingReceiptsRes?.count ?? 0),
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
      value: `GHS ${stats.todaySales.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-green-500",
      roles: ["cashier"],
      onClick: () => navigate("/pos"),
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

  // Admin sees only admin cards; non-admin sees by role
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

      {/* ✅ ADMIN ONLY: when viewing ALL branches show a breakdown so branches are distinguished */}
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
                Products / Low stock / Pending receipts / Attendance (today)
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
              <p className="text-slate-400 text-sm">
                No breakdown data yet.
              </p>
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

                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
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
            {/* Cashier only */}
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

            {/* Warehouse only */}
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

            {/* Admin only */}
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

      {/* ✅ ADMIN ONLY: Branch Management */}
      {isAdmin && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Branch Management</CardTitle>
            <p className="text-slate-400 text-sm">
              Create branches for your company. Staff can be assigned per branch.
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Create Branch */}
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

            {/* Branch List */}
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
