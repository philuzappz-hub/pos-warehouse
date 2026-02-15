import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Building2,
  ClipboardList,
  Clock,
  FileCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackagePlus,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Users,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

type NavItem = {
  name: string;
  href: string;
  icon: any;
  roles: string[];
  allowAttendanceManager?: boolean;
  allowReturnsHandler?: boolean;
};

const navigation: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
    roles: ['admin', 'cashier', 'warehouse', 'staff'],
  },
  { name: 'Point of Sale', href: '/pos', icon: ShoppingCart, roles: ['cashier'] },

  // ✅ Warehouse hub + new pages
  { name: 'Warehouse', href: '/warehouse', icon: WarehouseIcon, roles: ['warehouse'] },
  { name: 'Receive Stock', href: '/warehouse/receive', icon: PackagePlus, roles: ['warehouse'] },
  { name: 'My Receipts', href: '/warehouse/my-receipts', icon: ClipboardList, roles: ['warehouse'] },

  // ✅ Admin-only approvals
  { name: 'Stock Approvals', href: '/stock-approvals', icon: ShieldCheck, roles: ['admin'] },

  // ✅ Attendance: admin or attendance manager
  {
    name: 'Attendance',
    href: '/attendance',
    icon: Clock,
    roles: ['admin'],
    allowAttendanceManager: true,
  },

  { name: 'Inventory', href: '/inventory', icon: Package, roles: ['admin'] },

  // ✅ Returns: cashier or returns handler
  {
    name: 'Returns',
    href: '/returns',
    icon: RotateCcw,
    roles: ['cashier'],
    allowReturnsHandler: true,
  },

  // ✅ Returned items: cashier + warehouse
  {
    name: 'Returned Items',
    href: '/returned-items',
    icon: FileCheck,
    roles: ['cashier', 'warehouse'],
  },

  { name: 'Employees', href: '/users', icon: Users, roles: ['admin'] },
  { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin'] },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const {
    profile,
    roles,
    signOut,
    isAdmin,
    isAttendanceManager,
    isReturnsHandler,
  } = useAuth();

  const filteredNav = navigation.filter((item) => {
    // ✅ Admin sees everything EXCEPT strictly cashier-only OR strictly warehouse-only items
    // (same behavior as Sidebar)
    if (isAdmin) {
      const isStrictSingleRole =
        item.roles.length === 1 && (item.roles[0] === 'cashier' || item.roles[0] === 'warehouse');

      const isAdminOnly = item.roles.length === 1 && item.roles[0] === 'admin';

      return isAdminOnly ? true : !isStrictSingleRole;
    }

    // Attendance manager can access attendance
    if (item.allowAttendanceManager && isAttendanceManager) return true;

    // Returns handler can access returns
    if (item.allowReturnsHandler && isReturnsHandler) return true;

    // Normal role-based
    return item.roles.some((role) => roles.includes(role as any));
  });

  const isActivePath = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname === href || location.pathname.startsWith(href + '/');
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

            <nav className="flex-1 space-y-1 px-3 py-4">
              {filteredNav.map((item) => {
                const active = isActivePath(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
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
                <p className="text-sm font-medium text-white truncate">{profile?.full_name}</p>
                <p className="text-xs text-slate-400 capitalize">
                  {roles.join(', ') || 'No role assigned'}
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
