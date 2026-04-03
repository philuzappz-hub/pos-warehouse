import Layout from "@/components/layout/Layout";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Attendance from "./pages/Attendance";
import Auth from "./pages/Auth";
import CustomerPayments from "./pages/CustomerPayments";
import Customers from "./pages/Customers";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";
import POS from "./pages/POS";
import ReconciliationHistory from "./pages/ReconciliationHistory";
import Reports from "./pages/Reports";
import ReturnedItems from "./pages/ReturnedItems";
import Returns from "./pages/Returns";
import Users from "./pages/Users";
import Warehouse from "./pages/Warehouse";

// ✅ Expenses pages (split UI to avoid crowding)
import ExpenseNew from "./pages/ExpenseNew";
import Expenses from "./pages/Expenses";
import PendingExpenses from "./pages/PendingExpenses";

// ✅ Report pages
import DailySalesReport from "./pages/DailySalesReport";
import StockBalanceReport from "./pages/StockBalanceReport";

// ✅ Warehouse receiving page
import ReceiveStock from "./pages/warehouse/ReceivedStock";

// ✅ Warehouse "My Receipts" page
import MyReceipts from "./pages/warehouse/MyReceipts";

// ✅ Admin stock approvals page
import StockApprovals from "./pages/StockApprovals";

// ✅ Cashier coupons page
import POSCoupons from "./pages/POSCoupons";

// ✅ Multi-company onboarding
import SetupCompany from "./pages/SetupCompany";

// ✅ Gatekeeper
import Index from "./pages/Index";

// ✅ Employee pending page
import PendingAccess from "./pages/PendingAccess";

// ✅ Admin Settings Control Panel
import BranchSettings from "./pages/settings/BranchSettings";
import CompanySettings from "./pages/settings/CompanySettings";
import SettingsLayout from "./pages/settings/SettingsLayout";
import StaffSettings from "./pages/settings/StaffSettings";

// ✅ System settings
import SystemSettings from "./pages/settings/SystemSettings";

// ✅ Change Password
import ChangePassword from "./pages/ChangePassword";
import PurchaseDetails from "./pages/PurchaseDetails";
import PurchaseNew from "./pages/PurchaseNew";
import Purchases from "./pages/Purchases";
import SupplierPayments from "./pages/SupplierPayments";
import SupplierPaymentStatement from "./pages/SupplierPaymentStatement";
import Suppliers from "./pages/Suppliers";
import SupplierStatement from "./pages/SupplierStatement";
import SupplierStockStatement from "./pages/SupplierStockStatement";
import SupplierSummary from "./pages/SupplierSummary";
const queryClient = new QueryClient();

function FullScreenLoading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-white">{label}</div>
    </div>
  );
}

/**
 * ✅ AuthOnlyRoute
 * - Only requires logged-in user (session)
 * - DOES NOT require company/branch/role
 */
function AuthOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/auth" replace />;

  return <Layout>{children}</Layout>;
}

/**
 * ✅ ProtectedRoute
 * - Requires logged-in user
 * - waits for hydrated profile
 */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, profile } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile) return <FullScreenLoading label="Syncing account..." />;

  return <Layout>{children}</Layout>;
}

/**
 * ✅ PendingAccessRoute
 * - Assigned employee but still waiting for role/activation
 */
function PendingAccessRoute({ children }: { children: ReactNode }) {
  const { user, loading, profile, isAdmin } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile) return <FullScreenLoading label="Syncing account..." />;

  const isAssigned = !!profile.company_id || !!profile.branch_id;
  const hasRole = !!profile.role || isAdmin;

  if (!isAssigned) return <Navigate to="/setup-company" replace />;
  if (isAssigned && hasRole) return <Navigate to="/" replace />;

  return <Layout>{children}</Layout>;
}

/**
 * ✅ SetupCompanyRoute
 */
function SetupCompanyRoute({ children }: { children: ReactNode }) {
  const { user, loading, profile, isAdmin } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile) return <FullScreenLoading label="Syncing account..." />;

  const isAssigned = !!profile.company_id || !!profile.branch_id;

  if (profile.company_id) return <Navigate to="/" replace />;

  if (isAssigned && !isAdmin && profile.role !== "admin") {
    return <Navigate to="/pending-access" replace />;
  }

  return <Layout>{children}</Layout>;
}

/**
 * ✅ RoleProtectedRoute
 */
function RoleProtectedRoute({
  children,
  allowedRoles,
  allowAttendanceManager = false,
  allowReturnsHandler = false,
}: {
  children: ReactNode;
  allowedRoles: string[];
  allowAttendanceManager?: boolean;
  allowReturnsHandler?: boolean;
}) {
  const {
    user,
    loading,
    profile,
    roles,
    isAdmin,
    isAttendanceManager,
    isReturnsHandler,
  } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile) return <FullScreenLoading label="Syncing account..." />;

  const isAssigned = !!profile.company_id || !!profile.branch_id;

  if (!isAssigned) {
    return <Navigate to="/setup-company" replace />;
  }

  if (!profile.role && !isAdmin) {
    return <Navigate to="/pending-access" replace />;
  }

  const roleMatch = allowedRoles.some((role) => roles.includes(role as any));
  const adminAllowed = allowedRoles.includes("admin");
  const adminMatch = adminAllowed && isAdmin;

  const hasRoleAccess = roleMatch || adminMatch;
  const hasManagerAccess = allowAttendanceManager && isAttendanceManager;
  const hasHandlerAccess = allowReturnsHandler && isReturnsHandler;

  if (!hasRoleAccess && !hasManagerAccess && !hasHandlerAccess) {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
}

/**
 * ✅ AuthRoute
 */
function AuthRoute({ children }: { children: ReactNode }) {
  const { user, loading, profile } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <>{children}</>;
  if (!profile) return <FullScreenLoading label="Syncing account..." />;

  return <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/auth"
        element={
          <AuthRoute>
            <Auth />
          </AuthRoute>
        }
      />

      <Route path="/change-password" element={<ChangePassword />} />

      <Route
        path="/pending-access"
        element={
          <PendingAccessRoute>
            <PendingAccess />
          </PendingAccessRoute>
        }
      />

      <Route
        path="/setup-company"
        element={
          <SetupCompanyRoute>
            <SetupCompany />
          </SetupCompanyRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Index />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <Dashboard />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <SettingsLayout />
          </RoleProtectedRoute>
        }
      >
        <Route index element={<Navigate to="company" replace />} />
        <Route path="company" element={<CompanySettings />} />
        <Route path="branches" element={<BranchSettings />} />
        <Route path="staff" element={<StaffSettings />} />
        <Route path="system" element={<SystemSettings />} />
      </Route>

      <Route
        path="/pos"
        element={
          <RoleProtectedRoute allowedRoles={["cashier"]}>
            <POS />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/pos/coupons"
        element={
          <RoleProtectedRoute allowedRoles={["cashier"]}>
            <POSCoupons />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/customers"
        element={
          <RoleProtectedRoute allowedRoles={["admin", "cashier"]}>
            <Customers />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/customer-payments"
        element={
          <RoleProtectedRoute allowedRoles={["admin", "cashier"]}>
            <CustomerPayments />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/warehouse"
        element={
          <RoleProtectedRoute allowedRoles={["warehouse"]}>
            <Warehouse />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/warehouse/receive"
        element={
          <RoleProtectedRoute allowedRoles={["warehouse"]}>
            <ReceiveStock />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/warehouse/my-receipts"
        element={
          <RoleProtectedRoute allowedRoles={["warehouse"]}>
            <MyReceipts />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]} allowAttendanceManager>
            <Attendance />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/inventory"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <Inventory />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/stock-approvals"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <StockApprovals />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/returns"
        element={
          <RoleProtectedRoute allowedRoles={["cashier"]} allowReturnsHandler>
            <Returns />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/returned-items"
        element={
          <RoleProtectedRoute allowedRoles={["cashier", "warehouse"]}>
            <ReturnedItems />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <Users />
          </RoleProtectedRoute>
        }
      />

     <Route
  path="/reports"
  element={
    <RoleProtectedRoute allowedRoles={["admin"]}>
      <Reports />
    </RoleProtectedRoute>
  }
/>

<Route
  path="/reconciliation-history"
  element={
    <RoleProtectedRoute allowedRoles={["admin"]}>
      <ReconciliationHistory />
    </RoleProtectedRoute>
  }
/>

      <Route
        path="/expenses"
        element={
          <RoleProtectedRoute allowedRoles={["cashier", "admin"]} allowReturnsHandler>
            <Expenses />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/expenses/new"
        element={
          <RoleProtectedRoute allowedRoles={["cashier", "admin"]}>
            <ExpenseNew />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/expenses/pending"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]} allowReturnsHandler>
            <PendingExpenses />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/reports/daily-sales"
        element={
          <RoleProtectedRoute allowedRoles={["cashier"]}>
            <DailySalesReport />
          </RoleProtectedRoute>
        }
      />

      <Route
        path="/reports/stock-balance"
        element={
          <RoleProtectedRoute allowedRoles={["warehouse"]}>
            <StockBalanceReport />
          </RoleProtectedRoute>
        }
      />
<Route path="/suppliers" element={<Suppliers />} />
<Route path="/purchases" element={<Purchases />} />
<Route path="/purchases/new" element={<PurchaseNew />} />
<Route path="/purchases/:purchaseId" element={<PurchaseDetails />} />
<Route path="/suppliers/statement" element={<SupplierStatement />} />
<Route path="/suppliers/payments" element={<SupplierPayments />} />
<Route path="/suppliers/summary" element={<SupplierSummary />} />
<Route path="/suppliers/payment-statement" element={<SupplierPaymentStatement />} />
<Route path="/suppliers/stock-statement" element={<SupplierStockStatement />} />
<Route path="*" element={<NotFound />} />
      
    </Routes>
    
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;