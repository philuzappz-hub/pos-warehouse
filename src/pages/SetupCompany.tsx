// src/pages/SetupCompany.tsx
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RpcRow = { company_id: string; branch_id: string };

type BranchDraft = {
  name: string;
  code?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active: boolean;
};

function normalizeCode(v: string) {
  return v.trim().toUpperCase().replace(/\s+/g, "-");
}

function makeSuggestedCode(branchName: string) {
  const base = normalizeCode(branchName).replace(/[^A-Z0-9-]/g, "");
  if (!base) return "";
  return base.slice(0, 12);
}

function pickRpcRow(data: any): RpcRow | null {
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as RpcRow) ?? null;
  return data as RpcRow;
}

export default function SetupCompany() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    user,
    profile,
    loading,
    refreshProfile,
    refreshCompany,
    refreshBranches,
    setActiveBranchId,
    repairMissingCompanyId,
  } = useAuth() as any;

  const [submitting, setSubmitting] = useState(false);
  const [repairing, setRepairing] = useState(false);

  // Company required
  const [companyName, setCompanyName] = useState("");

  // Company optional fields
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");

  // Branches (first item is the "Main Branch" that RPC creates)
  const [branches, setBranches] = useState<BranchDraft[]>([
    {
      name: "Main Branch",
      code: "",
      email: "",
      phone: "",
      address: "",
      is_active: true,
    },
  ]);

  const alreadySetup = useMemo(() => !!(profile as any)?.company_id, [profile]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    if (alreadySetup) {
      navigate("/", { replace: true });
      return;
    }

    // Prefill company + main branch email from auth email
    if (!companyEmail && user.email) setCompanyEmail(user.email);

    setBranches((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      if (!next[0].email && user.email) next[0].email = user.email;
      return next;
    });
  }, [loading, user, alreadySetup, navigate, companyEmail]);

  const updateBranch = (index: number, patch: Partial<BranchDraft>) => {
    setBranches((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addBranch = () => {
    setBranches((prev) => [
      ...prev,
      { name: "", code: "", email: "", phone: "", address: "", is_active: true },
    ]);
  };

  const removeBranch = (index: number) => {
    if (index === 0) return; // don't remove main branch
    setBranches((prev) => prev.filter((_, i) => i !== index));
  };

  const tryRepairProfile = async () => {
    setRepairing(true);
    try {
      const res = await repairMissingCompanyId();
      if (res?.error) throw res.error;

      await refreshProfile();
      await refreshCompany();
      await refreshBranches();

      toast({
        title: "Repair completed",
        description: `Repaired: ${res?.repaired ?? 0}`,
      });

      const p = await refreshProfile();
      if ((p as any)?.company_id) navigate("/", { replace: true });
    } catch (e: any) {
      toast({
        title: "Repair failed",
        description: e?.message || "Could not repair profile.",
        variant: "destructive",
      });
    } finally {
      setRepairing(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim()) {
      toast({ title: "Company name required", variant: "destructive" });
      return;
    }

    if (!branches[0]?.name?.trim()) {
      toast({ title: "Main branch name required", variant: "destructive" });
      return;
    }

    // Validate extra branches: if started, must have name
    for (let i = 1; i < branches.length; i++) {
      const b = branches[i];
      const touched =
        !!b.name?.trim() ||
        !!b.code?.trim() ||
        !!b.email?.trim() ||
        !!b.phone?.trim() ||
        !!b.address?.trim();
      if (touched && !b.name.trim()) {
        toast({
          title: `Branch ${i + 1} name required`,
          description: "Either fill the branch name or remove that branch.",
          variant: "destructive",
        });
        return;
      }
    }

    if (!user?.id) {
      toast({ title: "Not logged in", variant: "destructive" });
      navigate("/auth", { replace: true });
      return;
    }

    // Full name for bootstrap function
    const fullName =
      String((profile as any)?.full_name || "").trim() ||
      String((user as any)?.user_metadata?.full_name || "").trim() ||
      String(user.email || "").trim() ||
      "Admin";

    setSubmitting(true);

    try {
      // ✅ IMPORTANT FIX:
      // Always pass _full_name so PostgREST doesn't try to find a 2-arg signature in schema cache.
      const { data, error } = await (supabase as any).rpc("create_company_and_claim_admin", {
        _branch: branches[0].name.trim(),
        _company_name: companyName.trim(),
        _full_name: fullName,
      });

      if (error) {
        toast({ title: "Setup failed", description: error.message, variant: "destructive" });
        return;
      }

      const row = pickRpcRow(data);
      if (!row?.company_id || !row?.branch_id) {
        toast({
          title: "Setup failed",
          description: "RPC returned no company/branch ids.",
          variant: "destructive",
        });
        return;
      }

      // 2) Update company fields (optional)
      const companyUpdate: Record<string, any> = {};
      if (companyAddress.trim()) companyUpdate.address = companyAddress.trim();
      if (companyPhone.trim()) companyUpdate.phone = companyPhone.trim();
      if (companyEmail.trim()) companyUpdate.email = companyEmail.trim();
      if (taxId.trim()) companyUpdate.tax_id = taxId.trim();
      if (logoUrl.trim()) companyUpdate.logo_url = logoUrl.trim();
      if (receiptFooter.trim()) companyUpdate.receipt_footer = receiptFooter.trim();

      if (Object.keys(companyUpdate).length > 0) {
        const { error: updCompanyErr } = await supabase
          .from("companies")
          .update(companyUpdate)
          .eq("id", row.company_id);

        if (updCompanyErr) {
          toast({
            title: "Company created (some details not saved)",
            description: updCompanyErr.message,
            variant: "destructive",
          });
        }
      }

      // 3) Update MAIN branch fields (optional)
      const main = branches[0];
      const mainBranchUpdate: Record<string, any> = {};
      const mainCode = normalizeCode(main.code || "");
      if (mainCode) mainBranchUpdate.code = mainCode;
      if (main.address?.trim()) mainBranchUpdate.address = main.address.trim();
      if (main.phone?.trim()) mainBranchUpdate.phone = main.phone.trim();
      if (main.email?.trim()) mainBranchUpdate.email = main.email.trim();
      if (typeof main.is_active === "boolean") mainBranchUpdate.is_active = main.is_active;

      if (Object.keys(mainBranchUpdate).length > 0) {
        const { error: updBranchErr } = await supabase
          .from("branches")
          .update(mainBranchUpdate)
          .eq("id", row.branch_id);

        if (updBranchErr) {
          toast({
            title: "Main branch created (some details not saved)",
            description: updBranchErr.message,
            variant: "destructive",
          });
        }
      }

      // 4) Insert EXTRA branches
      const extras = branches
        .slice(1)
        .map((b) => ({
          company_id: row.company_id,
          name: b.name.trim(),
          code: normalizeCode(b.code || makeSuggestedCode(b.name)),
          email: b.email?.trim() || null,
          phone: b.phone?.trim() || null,
          address: b.address?.trim() || null,
          is_active: b.is_active ?? true,
        }))
        .filter((b) => !!b.name);

      if (extras.length > 0) {
        const { error: insErr } = await supabase.from("branches").insert(extras);
        if (insErr) {
          toast({
            title: "Company created (some branches not saved)",
            description: insErr.message,
            variant: "destructive",
          });
        }
      }

      // 5) Refresh profile/company/branches
      const refreshed = await refreshProfile();
      await refreshCompany();
      await refreshBranches();

      // Make admin active branch = main branch (for branch switcher context)
      setActiveBranchId(row.branch_id);

      const hasCompany = !!(refreshed as any)?.company_id;
      const isAdmin =
        (refreshed as any)?.role === "admin" || (refreshed as any)?.is_admin === true;

      if (!hasCompany || !isAdmin) {
        toast({
          title: "Company created, but access not activated",
          description:
            "Company exists, but your profile didn’t get company_id/admin role. Click 'Repair Profile' below.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Success", description: "Company created. You are now the Admin." });
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
      <Card className="w-full max-w-3xl bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Set Up Your Company</CardTitle>
          <p className="text-slate-400 text-sm">
            Create your company and one or more branches. Your account becomes the Admin.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-8">
            {/* Company */}
            <div className="space-y-4">
              <p className="text-slate-200 font-semibold">Company Details</p>

              <div className="space-y-2">
                <Label className="text-slate-200">Company Name *</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="e.g. Wemah Company Limited"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-200">Company Phone</Label>
                  <Input
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    placeholder="e.g. +233..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">Company Email</Label>
                  <Input
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    placeholder="e.g. info@company.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Company Address</Label>
                <Input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="e.g. Walewale, Ghana"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-200">Tax ID (optional)</Label>
                  <Input
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    placeholder="TIN / Tax ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">Logo URL (optional)</Label>
                  <Input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Receipt Footer (optional)</Label>
                <Input
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="e.g. Thank you for your business!"
                />
              </div>
            </div>

            {/* Branches */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-slate-200 font-semibold">Branches</p>
                <Button type="button" variant="secondary" onClick={addBranch}>
                  + Add Branch
                </Button>
              </div>

              <div className="space-y-6">
                {branches.map((b, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-700 bg-slate-900/30 p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-slate-200 font-medium">
                        {i === 0 ? "Main Branch" : `Branch ${i + 1}`}
                      </p>

                      {i !== 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-slate-300 hover:text-white"
                          onClick={() => removeBranch(i)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-slate-200">
                          Branch Name {i === 0 ? "*" : ""}
                        </Label>
                        <Input
                          value={b.name}
                          onChange={(e) => updateBranch(i, { name: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white"
                          placeholder="e.g. Tamale Branch"
                          required={i === 0}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-slate-200">Branch Code (optional)</Label>
                        <Input
                          value={b.code ?? ""}
                          onChange={(e) => updateBranch(i, { code: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white"
                          placeholder="e.g. TAM-1002"
                          onBlur={() => {
                            if (!branches[i].code?.trim() && branches[i].name?.trim()) {
                              updateBranch(i, { code: makeSuggestedCode(branches[i].name) });
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-slate-200">Branch Phone</Label>
                        <Input
                          value={b.phone ?? ""}
                          onChange={(e) => updateBranch(i, { phone: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white"
                          placeholder="e.g. +233..."
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-slate-200">Branch Email</Label>
                        <Input
                          value={b.email ?? ""}
                          onChange={(e) => updateBranch(i, { email: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white"
                          placeholder="e.g. tamale@company.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200">Branch Address</Label>
                      <Input
                        value={b.address ?? ""}
                        onChange={(e) => updateBranch(i, { address: e.target.value })}
                        className="bg-slate-700 border-slate-600 text-white"
                        placeholder="e.g. Along main road, opposite..."
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id={`branch-active-${i}`}
                        type="checkbox"
                        checked={!!b.is_active}
                        onChange={(e) => updateBranch(i, { is_active: e.target.checked })}
                      />
                      <Label htmlFor={`branch-active-${i}`} className="text-slate-200">
                        Active
                      </Label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting || repairing}>
              {submitting ? "Creating..." : "Create Company & Become Admin"}
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={tryRepairProfile}
                disabled={repairing || submitting}
              >
                {repairing ? "Repairing..." : "Repair Profile (if stuck)"}
              </Button>
            </div>

            <p className="text-xs text-slate-400">
              After setup, you can still add more branches and staff from the Admin panel.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}