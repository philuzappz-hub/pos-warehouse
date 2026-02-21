import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Building2, LogOut, Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { BranchSwitcher } from "@/components/layout/BranchSwitcher";
import { navigation } from "@/components/layout/navConfig";
import { filterNavigation } from "@/components/layout/navFilter";

// must match BranchSwitcher + Sidebar
const ADMIN_ACTIVE_BRANCH_NAME_KEY = "admin_active_branch_name_v1";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const {
    profile,
    roles,
    signOut,
    isAdmin,
    activeBranchId,
    isAttendanceManager,
    isReturnsHandler,
  } = useAuth();

  const filteredNav = filterNavigation(navigation, {
    roles: roles as any,
    isAttendanceManager: !!isAttendanceManager,
    isReturnsHandler: !!isReturnsHandler,
  });

  const isActivePath = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  // ✅ keep admin branch name synced from localStorage (same behavior as Sidebar)
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
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    setAdminBranchNameCached(readCachedBranchName());
  }, [isAdmin, activeBranchId]);

  const adminViewingLabel = useMemo(() => {
    if (!activeBranchId) return "All branches";
    return adminBranchNameCached?.trim() || "Loading…";
  }, [activeBranchId, adminBranchNameCached]);

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-800">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="font-bold text-white">BuildMat Pro</span>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>

          {/* ✅ flex-col so nav scroll works nicely with footer */}
          <SheetContent
            side="right"
            className="w-72 bg-slate-900 border-slate-800 p-0 flex flex-col"
          >
            <div className="flex h-14 items-center justify-between px-4 border-b border-slate-800">
              <span className="font-bold text-white">Menu</span>
            </div>

            {/* ✅ Admin branch switcher on mobile */}
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

            {/* ✅ Nav scroll area */}
            <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4">
              {filteredNav.map((item) => {
                const active = isActivePath(item.href);
                return (
                  <Link
                    key={item.name + item.href}
                    to={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
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

            {/* ✅ Footer */}
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
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}