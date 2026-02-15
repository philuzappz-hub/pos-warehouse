import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RpcResult =
  | { ok: true; company_id: string; branch_id: string }
  | { ok: false; error?: string };

export default function SetupCompany() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // ✅ Now strongly typed (no `as any`) because useAuth now exposes refreshProfile()
  const { user, profile, loading, refreshProfile } = useAuth();

  const [submitting, setSubmitting] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [branchName, setBranchName] = useState("Main Branch");

  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const alreadySetup = useMemo(
    () => !!profile?.company_id,
    [profile?.company_id]
  );

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    // If already has company, no need to be here
    if (alreadySetup) {
      navigate("/", { replace: true });
      return;
    }

    // Pre-fill email if available
    if (!email && user.email) setEmail(user.email);
  }, [loading, user, alreadySetup, navigate, email]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim()) {
      toast({ title: "Company name required", variant: "destructive" });
      return;
    }
    if (!branchName.trim()) {
      toast({ title: "Branch name required", variant: "destructive" });
      return;
    }
    if (!user?.id) {
      toast({ title: "Not logged in", variant: "destructive" });
      navigate("/auth", { replace: true });
      return;
    }

    setSubmitting(true);

    try {
      // 1) Create company + branch + claim admin
      const { data, error } = await supabase.rpc(
        "create_company_and_claim_admin",
        {
          _company_name: companyName.trim(),
          _branch_name: branchName.trim(),
        }
      );

      if (error) {
        toast({
          title: "Setup failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      const result = (data as unknown as RpcResult) ?? { ok: false };

      if (result.ok === false) {
        toast({
          title: "Setup blocked",
          description:
            "error" in result && result.error
              ? result.error
              : "Could not complete setup.",
          variant: "destructive",
        });
        return;
      }

      // 2) Update company optional fields
      const updatePayload: Record<string, string> = {};
      if (address.trim()) updatePayload.address = address.trim();
      if (phone.trim()) updatePayload.phone = phone.trim();
      if (email.trim()) updatePayload.email = email.trim();

      if (Object.keys(updatePayload).length > 0) {
        const { error: updErr } = await supabase
          .from("companies")
          .update(updatePayload)
          .eq("id", result.company_id);

        if (updErr) {
          toast({
            title: "Company created (details not saved)",
            description: updErr.message,
            variant: "destructive",
          });
        }
      }

      // 3) Refresh profile from DB so Index gatekeeper sees new company_id + admin access
      const refreshed = await refreshProfile();

      const hasCompany = !!refreshed?.company_id;
      const isAdmin =
        refreshed?.role === "admin" || (refreshed as any)?.is_admin === true;

      if (!hasCompany || !isAdmin) {
        toast({
          title: "Company created, but access not activated",
          description:
            "Your company was created, but your profile was not updated with company_id/admin role. This is a database/RPC/RLS issue. Fix the RPC so it updates profiles, then try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Company created. You are now the Admin.",
      });

      // ✅ Go to gatekeeper
      navigate("/", { replace: true });
    } catch (err: any) {
      toast({
        title: "Unexpected error",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-lg bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Set Up Your Company</CardTitle>
          <p className="text-slate-400 text-sm">
            Create your business and main branch. This will make your account
            the Admin.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Company Name *</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="e.g. Philuz Building Materials"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Main Branch Name *</Label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="e.g. Main Branch"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Phone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="e.g. +233..."
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Email</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="e.g. info@company.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="e.g. Accra, Ghana"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating..." : "Create Company & Become Admin"}
            </Button>

            <p className="text-xs text-slate-400">
              After this, you can add staff and assign branch + roles from the
              Admin panel.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
