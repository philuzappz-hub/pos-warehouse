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
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";
import POS from "./pages/POS";
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

const queryClient = new QueryClient();

function FullScreenLoading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-white">{label}</div>
    </div>
  );
}

/**
 * ✅ ProtectedRoute
 * - Requires user
 * - IMPORTANT: if user exists but profile is still null, do NOT redirect anywhere.
 *   Just keep loading until profile is hydrated.
 */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, profile } = useAuth();

  if (loading) return <FullScreenLoading />;

  if (!user) return <Navigate to="/auth" replace />;

  // ✅ avoid bad redirects when profile hasn't hydrated yet
  if (!profile) return <FullScreenLoading label="Syncing account..." />;

  return <Layout>{children}</Layout>;
}

/**
 * ✅ PendingAccessRoute
 * - If user is already assigned (company OR branch) AND has a role (or admin),
 *   they should NOT be stuck on /pending-access.
 */
function PendingAccessRoute({ children }: { children: ReactNode }) {
  const { user, loading, profile, isAdmin } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile) return <FullScreenLoading label="Syncing account..." />;

  const isAssigned = !!profile.company_id || !!profile.branch_id;
  const hasRole = !!profile.role || isAdmin;

  // ✅ assigned users should never stay on pending page
  if (isAssigned && hasRole) return <Navigate to="/" replace />;

  return <Layout>{children}</Layout>;
}

/**
 * ✅ SetupCompanyRoute
 * - Only true admin candidates should be here
 * - If company exists already → leave setup
 * - If employee already assigned to a branch (even if company_id is null) → leave setup
 * - If NOT admin → go pending access (they can't create company)
 */
function SetupCompanyRoute({ children }: { children: ReactNode }) {
  const { user, loading, profile, isAdmin } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile) return <FullScreenLoading label="Syncing account..." />;

  const isAssigned = !!profile.company_id || !!profile.branch_id;

  // ✅ company already created → leave setup page immediately
  if (profile.company_id) return <Navigate to="/" replace />;

  // ✅ employees with a branch assignment should NOT be in setup-company
  if (isAssigned && !isAdmin) return <Navigate to="/" replace />;

  // ✅ only admins can create company
  if (!isAdmin && profile.role !== "admin") {
    return <Navigate to="/pending-access" replace />;
  }

  return <Layout>{children}</Layout>;
}

/**
 * ✅ RoleProtectedRoute (FIXED)
 * - wait for profile before role checks / redirects
 * - Admin should NOT automatically pass cashier/warehouse routes.
 *   Admin only passes if "admin" is explicitly in allowedRoles.
 * - "Assigned" means company OR branch (because employees may only have branch_id)
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

  // ✅ If user is not assigned at all:
  // - admin candidate can go setup
  // - employees go pending
  if (!isAssigned) {
    if (isAdmin || profile.role === "admin") {
      return <Navigate to="/setup-company" replace />;
    }
    return <Navigate to="/pending-access" replace />;
  }

  // ✅ If assigned but role not set (and not admin) → pending access
  if (!profile.role && !isAdmin) {
    return <Navigate to="/pending-access" replace />;
  }

  // ✅ Role access (NO admin override unless admin explicitly allowed)
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
 * - If not logged in → show auth page
 * - If logged in → ALWAYS go to "/" and let Index.tsx decide
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

      {/* ✅ Employee "waiting for admin assignment" */}
      <Route
        path="/pending-access"
        element={
          <PendingAccessRoute>
            <PendingAccess />
          </PendingAccessRoute>
        }
      />

      {/* ✅ Multi-company onboarding */}
      <Route
        path="/setup-company"
        element={
          <SetupCompanyRoute>
            <SetupCompany />
          </SetupCompanyRoute>
        }
      />

      {/* ✅ Gatekeeper route */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Index />
          </ProtectedRoute>
        }
      />

      {/* ✅ Explicit dashboard route (admin only) */}
      <Route
        path="/dashboard"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <Dashboard />
          </RoleProtectedRoute>
        }
      />

      {/* Cashier only */}
      <Route
        path="/pos"
        element={
          <RoleProtectedRoute allowedRoles={["cashier"]}>
            <POS />
          </RoleProtectedRoute>
        }
      />

      {/* POS Coupons (Cashier only) */}
      <Route
        path="/pos/coupons"
        element={
          <RoleProtectedRoute allowedRoles={["cashier"]}>
            <POSCoupons />
          </RoleProtectedRoute>
        }
      />

      {/* Warehouse only */}
      <Route
        path="/warehouse"
        element={
          <RoleProtectedRoute allowedRoles={["warehouse"]}>
            <Warehouse />
          </RoleProtectedRoute>
        }
      />

      {/* Warehouse: Receive Stock */}
      <Route
        path="/warehouse/receive"
        element={
          <RoleProtectedRoute allowedRoles={["warehouse"]}>
            <ReceiveStock />
          </RoleProtectedRoute>
        }
      />

      {/* Warehouse: My Receipts */}
      <Route
        path="/warehouse/my-receipts"
        element={
          <RoleProtectedRoute allowedRoles={["warehouse"]}>
            <MyReceipts />
          </RoleProtectedRoute>
        }
      />

      {/* Admin or Attendance Manager */}
      <Route
        path="/attendance"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]} allowAttendanceManager>
            <Attendance />
          </RoleProtectedRoute>
        }
      />

      {/* Admin only */}
      <Route
        path="/inventory"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <Inventory />
          </RoleProtectedRoute>
        }
      />

      {/* Admin: Stock Approvals */}
      <Route
        path="/stock-approvals"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <StockApprovals />
          </RoleProtectedRoute>
        }
      />

      {/* Cashier or Returns Handler */}
      <Route
        path="/returns"
        element={
          <RoleProtectedRoute allowedRoles={["cashier"]} allowReturnsHandler>
            <Returns />
          </RoleProtectedRoute>
        }
      />

      {/* Cashier and Warehouse can view returned items */}
      <Route
        path="/returned-items"
        element={
          <RoleProtectedRoute allowedRoles={["cashier", "warehouse"]}>
            <ReturnedItems />
          </RoleProtectedRoute>
        }
      />

      {/* Admin only */}
      <Route
        path="/users"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <Users />
          </RoleProtectedRoute>
        }
      />

      {/* Admin only */}
      <Route
        path="/reports"
        element={
          <RoleProtectedRoute allowedRoles={["admin"]}>
            <Reports />
          </RoleProtectedRoute>
        }
      />

    {/* Expenses Overview: everyone who can access expenses */}
<Route
  path="/expenses"
  element={
    <RoleProtectedRoute
      allowedRoles={["cashier", "admin"]}
      allowReturnsHandler
    >
      <Expenses />
    </RoleProtectedRoute>
  }
/>

{/* New Expense: ONLY Admin + Cashier (NOT returns handler) */}
<Route
  path="/expenses/new"
  element={
    <RoleProtectedRoute allowedRoles={["cashier", "admin"]}>
      <ExpenseNew />
    </RoleProtectedRoute>
  }
/>

{/* Pending Queue: ONLY Admin + Returns Handler (cashier shouldn’t approve) */}
<Route
  path="/expenses/pending"
  element={
    <RoleProtectedRoute allowedRoles={["admin"]} allowReturnsHandler>
      <PendingExpenses />
    </RoleProtectedRoute>
  }
/>

      {/* Daily Sales Report (Cashier only) */}
      <Route
        path="/reports/daily-sales"
        element={
          <RoleProtectedRoute allowedRoles={["cashier"]}>
            <DailySalesReport />
          </RoleProtectedRoute>
        }
      />

      {/* Stock Balance Report (Warehouse only) */}
      <Route
        path="/reports/stock-balance"
        element={
          <RoleProtectedRoute allowedRoles={["warehouse"]}>
            <StockBalanceReport />
          </RoleProtectedRoute>
        }
      />

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