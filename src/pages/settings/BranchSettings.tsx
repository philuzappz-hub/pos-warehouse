import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Branch = {
  id: string;
  name: string;
  code: string;
  company_id: string;
  is_active: boolean;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type BranchForm = {
  id?: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
};

function normalizeCode(v: string) {
  return v.replace(/\s+/g, "").toUpperCase();
}

export default function BranchSettings() {
  const { toast } = useToast();
  const { profile } = useAuth();

  const companyId = profile?.company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchForm>({
    name: "",
    code: "",
    address: "",
    phone: "",
    email: "",
    is_active: true,
  });

  useEffect(() => {
    if (!companyId) return;
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const fetchBranches = async () => {
    if (!companyId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    setLoading(false);

    if (error) {
      toast({
        title: "Failed to load branches",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setBranches((data as Branch[]) ?? []);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      code: "",
      address: "",
      phone: "",
      email: "",
      is_active: true,
    });
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditingId(b.id);
    setForm({
      id: b.id,
      name: b.name ?? "",
      code: b.code ?? "",
      address: b.address ?? "",
      phone: b.phone ?? "",
      email: b.email ?? "",
      is_active: !!b.is_active,
    });
    setOpen(true);
  };

  const existingCodes = useMemo(() => {
    const set = new Set<string>();
    for (const b of branches) {
      if (b.code) set.add(normalizeCode(b.code));
    }
    return set;
  }, [branches]);

  const validate = () => {
    if (!companyId) {
      toast({ title: "No company detected", variant: "destructive" });
      return false;
    }

    const name = form.name.trim();
    const code = normalizeCode(form.code.trim());

    if (!name) {
      toast({ title: "Branch name is required", variant: "destructive" });
      return false;
    }
    if (!code) {
      toast({ title: "Branch code is required", variant: "destructive" });
      return false;
    }

    // If creating new OR changing code on edit, ensure unique within company
    const editingBranch = editingId ? branches.find((b) => b.id === editingId) : null;
    const oldCode = editingBranch?.code ? normalizeCode(editingBranch.code) : null;

    const isCodeChanged = !editingId || (oldCode && oldCode !== code) || (!oldCode && !!code);

    if (isCodeChanged && existingCodes.has(code)) {
      toast({
        title: "Branch code already exists",
        description: "Use a different branch code (must be unique per company).",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const saveBranch = async () => {
    if (!validate()) return;

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      code: normalizeCode(form.code.trim()),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      is_active: form.is_active,
      company_id: companyId!,
    };

    try {
      if (!editingId) {
        // CREATE
        const { error } = await supabase.from("branches").insert(payload);

        if (error) {
          toast({
            title: "Failed to add branch",
            description: error.message,
            variant: "destructive",
          });
          return;
        }

        toast({ title: "Branch created" });
      } else {
        // UPDATE
        const { error } = await supabase
          .from("branches")
          .update(payload)
          .eq("id", editingId)
          .eq("company_id", companyId!);

        if (error) {
          toast({
            title: "Failed to update branch",
            description: error.message,
            variant: "destructive",
          });
          return;
        }

        toast({ title: "Branch updated" });
      }

      setOpen(false);
      resetForm();
      await fetchBranches();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: Branch) => {
    if (!companyId) return;

    const next = !b.is_active;

    // optimistic UI
    setBranches((prev) =>
      prev.map((x) => (x.id === b.id ? { ...x, is_active: next } : x))
    );

    const { error } = await supabase
      .from("branches")
      .update({ is_active: next })
      .eq("id", b.id)
      .eq("company_id", companyId);

    if (error) {
      // rollback
      setBranches((prev) =>
        prev.map((x) => (x.id === b.id ? { ...x, is_active: !next } : x))
      );
      toast({
        title: "Failed to update branch status",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: next ? "Branch activated" : "Branch deactivated",
      description: b.name,
    });
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6 text-slate-300">Loading branches...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-white">Branches</CardTitle>
          <p className="text-sm text-slate-400">
            Add, edit, and activate/deactivate branches for this company.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>Add Branch</Button>
          </DialogTrigger>

          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Branch" : "Add Branch"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Branch Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="e.g. Tamale Branch"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Branch Code *</Label>
                <Input
                  value={form.code}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, code: normalizeCode(e.target.value) }))
                  }
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="e.g. TAM-1002"
                />
                <p className="text-xs text-slate-400">
                  Code must be unique within your company.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-200">Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="e.g. 024..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">Email</Label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="e.g. tamale@company.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="e.g. Stadium Road, Tamale"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-slate-400">
                    Deactivated branches won’t be selectable.
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="w-full border-slate-700 text-slate-200 hover:bg-slate-800"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button className="w-full" onClick={saveBranch} disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Branch"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {branches.length === 0 ? (
          <div className="text-slate-300">No branches yet.</div>
        ) : (
          <div className="space-y-3">
            {branches.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4",
                  "border-slate-700 bg-slate-900/40"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold truncate">{b.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-200">
                      {b.code}
                    </span>
                    {!b.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-200">
                        Inactive
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-xs text-slate-400 space-y-1">
                    {(b.phone || b.email) && (
                      <p className="truncate">
                        {b.phone ?? ""}{b.phone && b.email ? " • " : ""}{b.email ?? ""}
                      </p>
                    )}
                    {b.address && <p className="truncate">{b.address}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <Button
                    variant="outline"
                    className="border-slate-700 text-slate-200 hover:bg-slate-800"
                    onClick={() => openEdit(b)}
                  >
                    Edit
                  </Button>

                  <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
                    <span className="text-xs text-slate-300">Active</span>
                    <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}