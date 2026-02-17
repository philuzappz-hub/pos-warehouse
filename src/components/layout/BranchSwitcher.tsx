import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

type Branch = {
  id: string;
  name: string;
};

const ADMIN_ACTIVE_BRANCH_NAME_KEY = "admin_active_branch_name_v1";

export function BranchSwitcher() {
  const { isAdmin, activeBranchId, setActiveBranchId, profile } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  const companyId = (profile as any)?.company_id ?? null;

  // ✅ Load branches (scoped to company)
  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    const loadBranches = async () => {
      setLoading(true);

      try {
        if (!companyId) {
          if (!cancelled) setBranches([]);
          return;
        }

        const { data, error } = await supabase
          .from("branches")
          .select("id, name")
          .eq("company_id", companyId as any)
          .eq("is_active", true)
          .order("name");

        if (cancelled) return;

        if (error) {
          console.error("[BranchSwitcher] Error loading branches:", error.message);
          setBranches([]);
        } else {
          setBranches((data ?? []) as Branch[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadBranches();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, companyId]);

  // ✅ If activeBranchId is already set (from useAuth localStorage),
  // ensure we cache its *name* after branches load (so Sidebar can show it instantly).
  useEffect(() => {
    if (!isAdmin) return;
    if (!activeBranchId) return;
    if (branches.length === 0) return;

    try {
      const existing = localStorage.getItem(ADMIN_ACTIVE_BRANCH_NAME_KEY);
      if (existing?.trim()) return;

      const name = branches.find((b) => b.id === activeBranchId)?.name;
      if (name) localStorage.setItem(ADMIN_ACTIVE_BRANCH_NAME_KEY, name);
    } catch {
      // ignore
    }
  }, [isAdmin, activeBranchId, branches]);

  // ✅ Selected label shown in the dropdown trigger
  const selectedLabel = useMemo(() => {
    if (!activeBranchId) return "All branches";
    return branches.find((b) => b.id === activeBranchId)?.name ?? "Selected branch";
  }, [activeBranchId, branches]);

  if (!isAdmin) return null;

  const handleChange = (value: string) => {
    const nextId = value === "all" ? null : value;

    // update state
    setActiveBranchId(nextId);

    // persist name for Sidebar
    try {
      if (!nextId) {
        localStorage.removeItem(ADMIN_ACTIVE_BRANCH_NAME_KEY);
      } else {
        const name = branches.find((b) => b.id === nextId)?.name;
        if (name) localStorage.setItem(ADMIN_ACTIVE_BRANCH_NAME_KEY, name);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="px-4 py-3">
      <label className="mb-1 block text-[11px] font-medium text-slate-400">
        Active Branch
      </label>

      <Select value={activeBranchId ?? "all"} onValueChange={handleChange} disabled={loading}>
        <SelectTrigger className="h-9 bg-slate-900 border-slate-700 text-slate-100">
          <SelectValue placeholder={selectedLabel} />
        </SelectTrigger>

        <SelectContent className="bg-slate-900 border-slate-700">
          <SelectItem value="all">All branches</SelectItem>

          {loading ? (
            <SelectItem value="__loading" disabled>
              Loading branches...
            </SelectItem>
          ) : branches.length === 0 ? (
            <SelectItem value="__none" disabled>
              No branches found
            </SelectItem>
          ) : (
            branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
