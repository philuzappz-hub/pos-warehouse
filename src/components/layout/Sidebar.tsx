// src/components/layout/Sidebar.tsx
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { BranchSwitcher } from "./BranchSwitcher";

import { Building2, LogOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { navigation } from "./navConfig";
import { filterNavigation } from "./navFilter";

// must match BranchSwitcher
const ADMIN_ACTIVE_BRANCH_NAME_KEY = "admin_active_branch_name_v1";

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

  // ✅ keep admin branch name synced from localStorage
  const [adminBranchNameCached, setAdminBranchNameCached] = useState<string>("");

  const readCachedBranchName = () => {
    try {
      return localStorage.getItem(ADMIN_ACTIVE_BRANCH_NAME_KEY) ?? "";
    } catch {
      return "";
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setAdminBranchNameCached("");
      return;
    }

    setAdminBranchNameCached(readCachedBranchName());

    const onStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_ACTIVE_BRANCH_NAME_KEY) {
        setAdminBranchNameCached(e.newValue ?? "");
      }
    };
    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!activeBranchId) {
      setAdminBranchNameCached("");
      return;
    }
    setAdminBranchNameCached(readCachedBranchName());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeBranchId]);

  const filteredNav = filterNavigation(navigation, {
    roles: roles as any,
    isAttendanceManager: !!isAttendanceManager,
    isReturnsHandler: !!isReturnsHandler,
  });

  const isActivePath = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  const companyDisplay = (companyName ?? "").trim();
  const showCompanySkeleton = !companyDisplay;

  const headerBranchLabel = useMemo(() => {
    if (isAdmin) {
      if (!activeBranchId) return "All branches";
      return adminBranchNameCached?.trim() || "Loading…";
    }
    return branchName ?? "Not assigned";
  }, [isAdmin, activeBranchId, adminBranchNameCached, branchName]);

  const showBranchSkeleton = isAdmin
    ? !!activeBranchId && !adminBranchNameCached?.trim()
    : branchName == null;

  const adminViewingLabel = useMemo(() => {
    if (!activeBranchId) return "All branches";
    return adminBranchNameCached?.trim() || "Loading…";
  }, [activeBranchId, adminBranchNameCached]);

  const initials = getInitials(companyDisplay || "Company");

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900 border-r border-slate-800">
      {/* ✅ Brand/Header */}
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
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

      {/* ✅ Staff branch info */}
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