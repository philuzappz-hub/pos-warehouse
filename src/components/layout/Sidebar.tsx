// src/components/layout/Sidebar.tsx
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
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

// must match BranchSwitcher
const ADMIN_ACTIVE_BRANCH_NAME_KEY = "admin_active_branch_name_v1";

type NavItem = {
  name: string;
  href: string;
  icon: any;
  roles: Array<"admin" | "cashier" | "warehouse">;
  allowAttendanceManager?: boolean;
  allowReturnsHandler?: boolean;
};

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["cashier", "warehouse"] },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin"] },

  { name: "Point of Sale", href: "/pos", icon: ShoppingCart, roles: ["cashier"] },
  { name: "POS Coupons", href: "/pos/coupons", icon: FileText, roles: ["cashier"] },

  { name: "Warehouse", href: "/warehouse", icon: WarehouseIcon, roles: ["warehouse"] },
  { name: "Receive Stock", href: "/warehouse/receive", icon: PackagePlus, roles: ["warehouse"] },
  { name: "My Receipts", href: "/warehouse/my-receipts", icon: ClipboardList, roles: ["warehouse"] },

  { name: "Stock Approvals", href: "/stock-approvals", icon: ShieldCheck, roles: ["admin"] },
  { name: "Attendance", href: "/attendance", icon: Clock, roles: ["admin"], allowAttendanceManager: true },
  { name: "Inventory", href: "/inventory", icon: Package, roles: ["admin"] },

  { name: "Returns", href: "/returns", icon: RotateCcw, roles: ["cashier"], allowReturnsHandler: true },
  { name: "Returned Items", href: "/returned-items", icon: FileCheck, roles: ["cashier", "warehouse"] },

  { name: "Employees", href: "/users", icon: Users, roles: ["admin"] },
  { name: "Reports", href: "/reports", icon: BarChart3, roles: ["admin"] },
];

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "CO";
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

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
    companyName,
  } = useAuth();

  // ✅ read admin branch name saved by BranchSwitcher
  const [adminBranchNameCached, setAdminBranchNameCached] = useState<string>("");

  useEffect(() => {
    if (!isAdmin) {
      setAdminBranchNameCached("");
      return;
    }

    try {
      if (!activeBranchId) {
        setAdminBranchNameCached("");
        return;
      }
      const v = localStorage.getItem(ADMIN_ACTIVE_BRANCH_NAME_KEY) ?? "";
      setAdminBranchNameCached(v);
    } catch {
      setAdminBranchNameCached("");
    }
  }, [isAdmin, activeBranchId]);

  const filteredNav = navigation.filter((item) => {
    if (item.allowAttendanceManager && isAttendanceManager) return true;
    if (item.allowReturnsHandler && isReturnsHandler) return true;
    return item.roles.some((role) => roles.includes(role as any));
  });

  const isActivePath = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  // ✅ Title (avoid flashing "Company" — show skeleton until resolved)
  const companyDisplay = (companyName ?? "").trim();
  const showCompanySkeleton = !companyDisplay;

  // ✅ Branch label under title
  const headerBranchLabel = useMemo(() => {
    if (isAdmin) {
      if (!activeBranchId) return "All branches";
      return adminBranchNameCached?.trim() || "Selected branch";
    }
    return branchName ?? "Not assigned";
  }, [isAdmin, activeBranchId, adminBranchNameCached, branchName]);

  const showBranchSkeleton = isAdmin
    ? !!activeBranchId && !adminBranchNameCached?.trim()
    : branchName == null;

  // ✅ Admin “Viewing:” line label
  const adminViewingLabel = useMemo(() => {
    if (!activeBranchId) return "All branches";
    return adminBranchNameCached?.trim() || "Selected branch";
  }, [activeBranchId, adminBranchNameCached]);

  const initials = getInitials(companyDisplay || "Company");

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900 border-r border-slate-800">
      {/* ✅ Brand/Header */}
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {/* icon / initials */}
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center">
            {companyDisplay ? (
              <span className="text-[12px] font-extrabold tracking-wide text-emerald-200">
                {initials}
              </span>
            ) : (
              <Building2 className="h-6 w-6 text-emerald-400" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {/* company name */}
            {showCompanySkeleton ? (
              <div className="h-5 w-40 rounded bg-slate-800 animate-pulse" />
            ) : (
              <div
                title={companyDisplay}
                className="truncate text-[16px] md:text-lg font-extrabold tracking-tight bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent"
              >
                {companyDisplay}
              </div>
            )}

            {/* branch line */}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                Branch
              </span>

              {showBranchSkeleton ? (
                <div className="h-4 w-28 rounded bg-slate-800 animate-pulse" />
              ) : (
                <span
                  title={headerBranchLabel}
                  className="text-[12px] font-medium text-slate-300 truncate"
                >
                  {headerBranchLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Admin-only branch switcher */}
      {isAdmin && (
        <div className="border-b border-slate-800">
          <BranchSwitcher />
          <div className="px-4 pb-3">
            <p className="text-[11px] text-slate-400">
              Viewing: <span className="text-slate-200">{adminViewingLabel}</span>
            </p>
          </div>
        </div>
      )}

      {/* ✅ Staff branch info (extra clarity) */}
      {!isAdmin && (
        <div className="border-b border-slate-800 px-4 py-3">
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
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary/90 text-primary-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.25)]"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              {/* left border indicator */}
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-emerald-400" />
              )}

              <item.icon className={cn("h-5 w-5", active ? "opacity-100" : "opacity-80")} />
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
