import {
  BarChart3,
  ClipboardList,
  Clock,
  FileCheck,
  FileText,
  LayoutDashboard,
  Package,
  PackagePlus,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Warehouse as WarehouseIcon,
} from "lucide-react";

export type AppRole = "admin" | "cashier" | "warehouse" | "staff";

export type NavItem = {
  name: string;
  href: string;
  icon: any;
  roles: AppRole[];
  allowAttendanceManager?: boolean;
  allowReturnsHandler?: boolean;
};

export const navigation: NavItem[] = [
  // ✅ Make "/" available to admin too (prevents nav gaps if app uses "/" as main landing)
  { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["admin", "cashier", "warehouse", "staff"] },
  

  { name: "Point of Sale", href: "/pos", icon: ShoppingCart, roles: ["cashier"] },
  { name: "POS Coupons", href: "/pos/coupons", icon: FileText, roles: ["cashier"] },

  { name: "Warehouse", href: "/warehouse", icon: WarehouseIcon, roles: ["warehouse"] },
  { name: "Receive Stock", href: "/warehouse/receive", icon: PackagePlus, roles: ["warehouse"] },
  { name: "My Receipts", href: "/warehouse/my-receipts", icon: ClipboardList, roles: ["warehouse"] },

  { name: "Stock Approvals", href: "/stock-approvals", icon: ShieldCheck, roles: ["admin"] },

  // ✅ Admin sees Attendance + Attendance Manager sees Attendance
  { name: "Attendance", href: "/attendance", icon: Clock, roles: ["admin"], allowAttendanceManager: true },

  { name: "Inventory", href: "/inventory", icon: Package, roles: ["admin"] },

  { name: "Returns", href: "/returns", icon: RotateCcw, roles: ["cashier"], allowReturnsHandler: true },
  { name: "Returned Items", href: "/returned-items", icon: FileCheck, roles: ["cashier", "warehouse"] },

  { name: "Employees", href: "/users", icon: Users, roles: ["admin"] },

  // ✅ Intentional: returns handler can see Expenses
  { name: "Expenses", href: "/expenses", icon: FileText, roles: ["admin", "cashier"], allowReturnsHandler: true },

  { name: "Reports", href: "/reports", icon: BarChart3, roles: ["admin"] },
  { name: "Settings", href: "/settings", icon: Settings, roles: ["admin"] },
];