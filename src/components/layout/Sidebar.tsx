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
 * - Admin "Dashboard" should go to /dashboard (not /).
 */
const navigation: NavItem[] = [
  // ✅ Dashboard
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["cashier", "warehouse"],
  },
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin"],
  },

  // ✅ POS (Cashier)
  { name: "Point of Sale", href: "/pos", icon: ShoppingCart, roles: ["cashier"] },
  { name: "POS Coupons", href: "/pos/coupons", icon: FileText, roles: ["cashier"] },

  // ✅ Warehouse
  { name: "Warehouse", href: "/warehouse", icon: WarehouseIcon, roles: ["warehouse"] },
  { name: "Receive Stock", href: "/warehouse/receive", icon: PackagePlus, roles: ["warehouse"] },
  { name: "My Receipts", href: "/warehouse/my-receipts", icon: ClipboardList, roles: ["warehouse"] },

  // ✅ Admin
  { name: "Stock Approvals", href: "/stock-approvals", icon: ShieldCheck, roles: ["admin"] },
  {
    name: "Attendance",
    href: "/attendance",
    icon: Clock,
    roles: ["admin"],
    allowAttendanceManager: true,
  },
  { name: "Inventory", href: "/inventory", icon: Package, roles: ["admin"] },

  // ✅ Returns
  {
    name: "Returns",
    href: "/returns",
    icon: RotateCcw,
    roles: ["cashier"],
    allowReturnsHandler: true,
  },
  { name: "Returned Items", href: "/returned-items", icon: FileCheck, roles: ["cashier", "warehouse"] },

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

  const companyName =
    (profile as any)?.company_name ||
    (profile as any)?.company?.name || // if you ever join company relation later
    (profile as any)?.company?.title ||
    "Company";

  // ✅ For staff: show their branch name
  // ✅ For admin: if they selected a branch, show “Selected branch”, else “All branches”
  const headerBranchText = isAdmin
    ? activeBranchId
      ? "Selected Branch"
      : branchName ?? "All Branches"
    : branchName ?? "Not assigned";

  const filteredNav = navigation.filter((item) => {
    if (item.allowAttendanceManager && isAttendanceManager) return true;
    if (item.allowReturnsHandler && isReturnsHandler) return true;
    return item.roles.some((role) => roles.includes(role as any));
  });

  const isActivePath = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900 border-r border-slate-800">
      {/* ✅ Premium Header */}
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2 bg-slate-800/60 border border-slate-700">
            <Building2 className="h-6 w-6 text-emerald-400" />
          </div>

          <div className="min-w-0">
            {/* Company name (stylish) */}
            <div
              className={cn(
                "truncate text-lg font-extrabold tracking-tight",
                "bg-gradient-to-r from-emerald-300 via-sky-300 to-violet-300 bg-clip-text text-transparent"
              )}
              title={companyName}
            >
              {companyName}
            </div>

            {/* ✅ Replace “POS • Warehouse • Reports” with Branch */}
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-800/70 border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                {isAdmin ? "Viewing" : "Branch"}
              </span>
              <span
                className="truncate text-[12px] font-medium text-slate-300"
                title={headerBranchText}
              >
                {headerBranchText}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Admin-only branch switcher */}
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

      {/* ✅ Staff branch info (kept, but now looks cleaner) */}
      {!isAdmin && (
        <div className="border-b border-slate-800 px-4 py-3">
          <p className="text-[11px] text-slate-400">Your Branch</p>
          <p className="text-sm font-semibold text-slate-200 truncate">
            {branchName ?? "Not assigned"}
          </p>
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
                  ? "bg-gradient-to-r from-primary/90 to-violet-500/60 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className={cn("h-5 w-5", active ? "text-white" : "text-slate-400")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 px-3">
          <p className="text-sm font-semibold text-white truncate">
            {profile?.full_name ?? "User"}
          </p>
          <p className="text-xs text-slate-400 capitalize">
            {roles.join(", ") || "No role assigned"}
          </p>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={signOut}
        >
          <LogOut className="h-5 w-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
