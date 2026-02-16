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

  // ✅ Load branches (SCOPED to company)
  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    const loadBranches = async () => {
      if (!companyId) {
        setBranches([]);
        return;
      }

      setLoading(true);

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

      setLoading(false);
    };

    void loadBranches();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, companyId]);

  // ✅ Keep selected branch name in localStorage (so Sidebar can show it instantly)
  useEffect(() => {
    if (!isAdmin) return;

    try {
      if (!activeBranchId) {
        localStorage.removeItem(ADMIN_ACTIVE_BRANCH_NAME_KEY);
        return;
      }

      const name = branches.find((b) => b.id === activeBranchId)?.name;
      if (name) localStorage.setItem(ADMIN_ACTIVE_BRANCH_NAME_KEY, name);
    } catch {
      // ignore
    }
  }, [isAdmin, activeBranchId, branches]);

  const selectedLabel = useMemo(() => {
    if (!activeBranchId) return "All branches";
    return branches.find((b) => b.id === activeBranchId)?.name ?? "Selected branch";
  }, [activeBranchId, branches]);

  if (!isAdmin) return null;

  return (
    <div className="px-4 py-3">
      <label className="mb-1 block text-[11px] font-medium text-slate-400">
        Active Branch
      </label>

      <Select
        value={activeBranchId ?? "all"}
        onValueChange={(value) => setActiveBranchId(value === "all" ? null : value)}
        disabled={loading}
      >
        <SelectTrigger className="h-9 bg-slate-900 border-slate-700 text-slate-100">
          <SelectValue placeholder={selectedLabel} />
        </SelectTrigger>

        <SelectContent className="bg-slate-900 border-slate-700">
          <SelectItem value="all">All branches</SelectItem>

          {branches.length === 0 ? (
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
