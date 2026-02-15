// src/pages/index.tsx
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile, isAdmin } = useAuth();

  // Prevent infinite refresh loops
  const triedRefreshRef = useRef(false);

  // Detect in-memory fallback profile
  const looksLikeFallbackProfile =
    !!user &&
    !!profile &&
    !profile.company_id &&
    !profile.branch_id &&
    !profile.role &&
    (profile as any)?.created_at == null &&
    (profile as any)?.updated_at == null;

  // Try ONE refresh if fallback detected
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!profile) return;

    if (looksLikeFallbackProfile && !triedRefreshRef.current) {
      triedRefreshRef.current = true;
      refreshProfile().catch(() => {});
    }
  }, [loading, user, profile, looksLikeFallbackProfile, refreshProfile]);

  useEffect(() => {
    if (loading) return;

    // Not logged in
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    // Profile not ready
    if (!profile) return;

    // Still fallback → wait
    if (looksLikeFallbackProfile) return;

    /**
     * ✅ Consider a user "assigned" if they have EITHER:
     * - company_id (admin / company owner style)
     * - branch_id (staff assignment style)
     */
    const isAssigned = !!profile.company_id || !!profile.branch_id;

    // Not assigned at all:
    // - Admin candidate → setup company
    // - Staff → pending access
    if (!isAssigned) {
      if (isAdmin || profile.role === "admin") {
        navigate("/setup-company", { replace: true });
      } else {
        navigate("/pending-access", { replace: true });
      }
      return;
    }

    // Admin → dashboard
    if (isAdmin || profile.role === "admin") {
      navigate("/dashboard", { replace: true });
      return;
    }

    // ✅ Returns handler → returns page (fixes stuck "Redirecting…")
    if ((profile as any)?.is_returns_handler === true) {
      navigate("/returns", { replace: true });
      return;
    }

    // Assigned but role not assigned → pending access
    if (!profile.role) {
      navigate("/pending-access", { replace: true });
      return;
    }

    // Role-based routing
    switch (profile.role) {
      case "cashier":
        navigate("/pos", { replace: true });
        break;

      case "warehouse":
        navigate("/warehouse", { replace: true });
        break;

      default:
        navigate("/pending-access", { replace: true });
        break;
    }
  }, [user, profile, loading, navigate, looksLikeFallbackProfile, isAdmin]);

  /* ---------------- UI STATES ---------------- */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  if (!profile || looksLikeFallbackProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <h1 className="mb-4 text-2xl font-bold text-white">
            Finalizing your account…
          </h1>
          <p className="text-muted-foreground">
            Please wait while we finish setting things up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">Redirecting…</p>
    </div>
  );
};

export default Index;
