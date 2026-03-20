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
  Wallet,
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
  // Dashboard
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["admin", "cashier", "warehouse", "staff"],
  },

  // POS
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

  // Customers
  {
    name: "Customers",
    href: "/customers",
    icon: Users,
    roles: ["admin", "cashier"],
  },

  // Customer Payments / Debts
  {
    name: "Customer Payments",
    href: "/customer-payments",
    icon: Wallet,
    roles: ["admin", "cashier"],
  },

  // Warehouse
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

  // Admin
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

  {
    name: "Employees",
    href: "/users",
    icon: Users,
    roles: ["admin"],
  },

  // Expenses
  {
    name: "Expenses",
    href: "/expenses",
    icon: FileText,
    roles: ["admin", "cashier"],
    allowReturnsHandler: true,
  },

  // ✅ UPDATED: Financial Report (was "Reports")
  {
    name: "Financial Report",
    href: "/reports", // keep same route
    icon: BarChart3,
    roles: ["admin"],
  },
  {
  name: "Reconciliation History",
  href: "/reconciliation-history",
  icon: Wallet,
  roles: ["admin"],
},

  // Settings
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["admin"],
  },
];