import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Building2, LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { navigation } from "@/components/layout/navConfig";
import { filterNavigation } from "@/components/layout/navFilter";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const { profile, roles, signOut, isAttendanceManager, isReturnsHandler } = useAuth();

  const filteredNav = filterNavigation(navigation, {
    roles: roles as any,
    isAttendanceManager: !!isAttendanceManager,
    isReturnsHandler: !!isReturnsHandler,
  });

  const isActivePath = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

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

          <SheetContent side="right" className="w-72 bg-slate-900 border-slate-800 p-0">
            <div className="flex h-14 items-center justify-between px-4 border-b border-slate-800">
              <span className="font-bold text-white">Menu</span>
            </div>

            {/* ✅ Make it scroll so long menus don't get cut off */}
            <nav className="max-h-[calc(100vh-56px-120px)] overflow-y-auto flex-1 space-y-1 px-3 py-4">
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

            <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-4">
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