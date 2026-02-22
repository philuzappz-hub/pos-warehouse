import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Branch = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  role: string;
  branch_id: string | null;
  company_id: string;
  is_attendance_manager: boolean;
  is_returns_handler: boolean;
  is_expense_approver: boolean;
  deleted_at: string | null;
};

const ROLE_OPTIONS = ["admin", "cashier", "warehouse", "staff"] as const;

export default function StaffSettings() {
  const { toast } = useToast();
  const { profile, user } = useAuth();

  const companyId = profile?.company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<ProfileRow[]>([]);

  useEffect(() => {
    if (!companyId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadBranches(), loadStaff()]);
    setLoading(false);
  };

  const loadBranches = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("branches")
      .select("id,name,code,is_active")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

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

  const loadStaff = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id,user_id,full_name,phone,role,branch_id,company_id,is_attendance_manager,is_returns_handler,is_expense_approver,deleted_at"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Failed to load staff",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setStaff((data as ProfileRow[]) ?? []);
  };

  const branchName = useMemo(() => {
    const map = new Map(branches.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? map.get(id) ?? "Unknown" : "—");
  }, [branches]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return staff;
    return staff.filter((p) => {
      return (
        p.full_name?.toLowerCase().includes(s) ||
        (p.phone ?? "").toLowerCase().includes(s) ||
        (p.role ?? "").toLowerCase().includes(s) ||
        branchName(p.branch_id).toLowerCase().includes(s)
      );
    });
  }, [q, staff, branchName]);

  const updateStaff = async (id: string, patch: Partial<ProfileRow>) => {
    if (!companyId) return;

    setSavingId(id);
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId);

    setSavingId(null);

    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setStaff((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    toast({ title: "Saved" });
  };

  const deactivateStaff = async (p: ProfileRow) => {
    if (!user?.id) return;

    await updateStaff(p.id, {
      deleted_at: new Date().toISOString(),
      // NOTE: your table has deleted_by + deleted_reason columns too,
      // but they're not in ProfileRow type above.
      // If you want them stored, tell me and I'll include them properly.
    } as any);
  };

  const reactivateStaff = async (p: ProfileRow) => {
    await updateStaff(p.id, { deleted_at: null } as any);
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6 text-slate-300">Loading staff...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Staff & Roles</CardTitle>
        <p className="text-sm text-slate-400">
          Assign staff to branches, set roles and permissions.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-slate-200">Search</Label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Search name, phone, role, branch..."
          />
        </div>

        <div className="space-y-3">
          {filtered.map((p) => {
            const saving = savingId === p.id;
            const inactive = !!p.deleted_at;

            return (
              <div
                key={p.id}
                className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold truncate">{p.full_name}</p>
                      {inactive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-200">
                          Deactivated
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {p.phone ?? "No phone"} • Branch: {branchName(p.branch_id)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {!inactive ? (
                      <Button
                        variant="outline"
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => deactivateStaff(p)}
                        disabled={saving}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => reactivateStaff(p)}
                        disabled={saving}
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-slate-200">Role</Label>
                    <Select
                      value={p.role}
                      onValueChange={(v) => updateStaff(p.id, { role: v } as any)}
                      disabled={saving}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800">
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Branch</Label>
                    <Select
                      value={p.branch_id ?? "none"}
                      onValueChange={(v) =>
                        updateStaff(p.id, { branch_id: v === "none" ? null : v } as any)
                      }
                      disabled={saving}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800">
                        <SelectItem value="none">— No branch —</SelectItem>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id} disabled={!b.is_active}>
                            {b.name} ({b.code}) {!b.is_active ? "• inactive" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
                    <div>
                      <p className="text-sm text-white">Attendance</p>
                      <p className="text-xs text-slate-400">Manager</p>
                    </div>
                    <Switch
                      checked={p.is_attendance_manager}
                      onCheckedChange={(v) =>
                        updateStaff(p.id, { is_attendance_manager: v } as any)
                      }
                      disabled={saving}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
                    <div>
                      <p className="text-sm text-white">Returns</p>
                      <p className="text-xs text-slate-400">Handler</p>
                    </div>
                    <Switch
                      checked={p.is_returns_handler}
                      onCheckedChange={(v) =>
                        updateStaff(p.id, { is_returns_handler: v } as any)
                      }
                      disabled={saving}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
                    <div>
                      <p className="text-sm text-white">Expenses</p>
                      <p className="text-xs text-slate-400">Approver</p>
                    </div>
                    <Switch
                      checked={p.is_expense_approver}
                      onCheckedChange={(v) =>
                        updateStaff(p.id, { is_expense_approver: v } as any)
                      }
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-slate-300">No staff found.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}