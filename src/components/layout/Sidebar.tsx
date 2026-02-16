import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BranchSwitcher } from "./BranchSwitcher";

import {
  BarChart3,
  Building2,
  ClipboardList,
  Clock,
  FileCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  PackagePlus,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Users,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

type NavItem = {
  name: string;
  href: string;
  icon: any;
  roles: Array<"admin" | "cashier" | "warehouse">;
  allowAttendanceManager?: boolean;
  allowReturnsHandler?: boolean;
};

/**
 * ✅ IMPORTANT FIX:
 * - Admin should NOT see Cashier/Warehouse links unless you explicitly give them those roles.
 * - Also: Admin "Dashboard" should go to /dashboard (not /).
 */
const navigation: NavItem[] = [
  // ✅ Dashboard
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["cashier", "warehouse"], // <-- Admin removed
  },
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin"], // <-- Admin dashboard route
  },

  // ✅ POS (Cashier)
  {
    name: "Point of Sale",
    href: "/pos",
    icon: ShoppingCart,
    roles: ["cashier"],
  },
  {
    name: "POS Coupons",
    href: "/pos/coupons",
    icon: FileText,
    roles: ["cashier"],
  },

  // ✅ Warehouse (Warehouse Staff)
  {
    name: "Warehouse",
    href: "/warehouse",
    icon: WarehouseIcon,
    roles: ["warehouse"],
  },
  {
    name: "Receive Stock",
    href: "/warehouse/receive",
    icon: PackagePlus,
    roles: ["warehouse"],
  },
  {
    name: "My Receipts",
    href: "/warehouse/my-receipts",
    icon: ClipboardList,
    roles: ["warehouse"],
  },

  // ✅ Admin
  {
    name: "Stock Approvals",
    href: "/stock-approvals",
    icon: ShieldCheck,
    roles: ["admin"],
  },
  {
    name: "Attendance",
    href: "/attendance",
    icon: Clock,
    roles: ["admin"],
    allowAttendanceManager: true,
  },
  {
    name: "Inventory",
    href: "/inventory",
    icon: Package,
    roles: ["admin"],
  },

  // ✅ Returns
  {
    name: "Returns",
    href: "/returns",
    icon: RotateCcw,
    roles: ["cashier"],
    allowReturnsHandler: true,
  },
  {
    name: "Returned Items",
    href: "/returned-items",
    icon: FileCheck,
    roles: ["cashier", "warehouse"],
  },

  // ✅ Admin users & reports
  { name: "Employees", href: "/users", icon: Users, roles: ["admin"] },
  { name: "Reports", href: "/reports", icon: BarChart3, roles: ["admin"] },
];

export default function Sidebar() {
  const location = useLocation();

  const {
    profile,
    roles,
    signOut,
    isAdmin,
    isAttendanceManager,
    isReturnsHandler,
    branchName,
    activeBranchId,
  } = useAuth();

  /* ------------------ ✅ Dynamic Company Name ------------------ */

  const companyId = useMemo(() => (profile as any)?.company_id ?? null, [profile]);

  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadCompany = async () => {
      if (!companyId) {
        if (mounted) setCompanyName(null);
        return;
      }

      setLoadingCompany(true);
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("name")
          .eq("id", companyId)
          .maybeSingle();

        if (error) throw error;

        if (!mounted) return;
        setCompanyName((data as any)?.name ?? null);
      } catch (e) {
        if (mounted) setCompanyName(null);
      } finally {
        if (mounted) setLoadingCompany(false);
      }
    };

    loadCompany();

    return () => {
      mounted = false;
    };
  }, [companyId]);

  const brandTitle = loadingCompany ? "Loading..." : companyName ?? "BuildMat Pro";

  /* ------------------------------------------------------------ */

  const filteredNav = navigation.filter((item) => {
    // ✅ Attendance manager can access attendance
    if (item.allowAttendanceManager && isAttendanceManager) return true;

    // ✅ Returns handler can access returns
    if (item.allowReturnsHandler && isReturnsHandler) return true;

    // ✅ Normal role-based access ONLY (Admin is just another role here)
    return item.roles.some((role) => roles.includes(role as any));
  });

  const isActivePath = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900 border-r border-slate-800">
      {/* ✅ Brand Header */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-800">
        <Building2 className="h-8 w-8 text-primary" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="font-bold text-lg text-white truncate">{brandTitle}</span>
          </div>

          <p className="text-[11px] text-slate-400 leading-tight">
            POS • Warehouse • Reports
          </p>
        </div>
      </div>

      {/* ✅ Admin-only branch switcher (controls what admin is viewing) */}
      {isAdmin && (
        <div className="border-b border-slate-800">
          <BranchSwitcher />
          <div className="px-3 pb-3">
            <p className="text-[11px] text-slate-400">
              Viewing:{" "}
              <span className="text-slate-200">
                {activeBranchId ? "Selected branch" : "All branches"}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* ✅ Staff branch info (show NAME instead of UUID) */}
      {!isAdmin && (
        <div className="border-b border-slate-800 px-3 py-3">
          <p className="text-[11px] text-slate-400">Your Branch</p>
          <p className="text-sm text-slate-200 truncate">{branchName ?? "Not assigned"}</p>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNav.map((item) => {
          const active = isActivePath(item.href);
          return (
            <Link
              key={item.name + item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 px-3">
          <p className="text-sm font-medium text-white truncate">
            {profile?.full_name ?? "User"}
          </p>
          <p className="text-xs text-slate-400 capitalize">
            {roles.join(", ") || "No role assigned"}
          </p>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800"
          onClick={signOut}
        >
          <LogOut className="h-5 w-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
