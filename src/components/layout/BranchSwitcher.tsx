import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from "react";

export function BranchSwitcher() {
  const {
    isAdmin,
    activeBranchId,
    setActiveBranchId,
    activeBranchName,
    branches,
    refreshBranches,
    company, // ✅ make sure useAuth exposes this (it does in your file)
  } = useAuth();

  const companyId = company?.id ?? null;

  const [loading, setLoading] = useState(false);
  const didRequestRef = useRef(false);

  useEffect(() => {
    if (!isAdmin) {
      didRequestRef.current = false;
      return;
    }

    // ✅ wait until companyId exists, otherwise refreshBranches will fetch nothing
    if (!companyId) return;

    if (branches.length > 0) {
      didRequestRef.current = false;
      return;
    }

    if (didRequestRef.current) return;
    didRequestRef.current = true;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        await refreshBranches();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, companyId, branches.length, refreshBranches]);

  const selectedLabel = useMemo(() => {
    if (!activeBranchId) return "All branches";
    return (
      activeBranchName ??
      branches.find((b) => b.id === activeBranchId)?.name ??
      "Selected branch"
    );
  }, [activeBranchId, activeBranchName, branches]);

  if (!isAdmin) return null;

  const handleChange = (value: string) => {
    const nextId = value === "all" ? null : value;
    setActiveBranchId(nextId);
  };

  return (
    <div className="px-4 py-3">
      <label className="mb-1 block text-[11px] font-medium text-slate-400">
        Active Branch
      </label>

      <Select
        value={activeBranchId ?? "all"}
        onValueChange={handleChange}
        disabled={loading || !companyId}
      >
        <SelectTrigger className="h-9 bg-slate-900 border-slate-700 text-slate-100">
          <SelectValue placeholder={selectedLabel} />
        </SelectTrigger>

        <SelectContent className="bg-slate-900 border-slate-700">
          <SelectItem value="all">All branches</SelectItem>

          {!companyId ? (
            <SelectItem value="__waiting" disabled>
              Loading company...
            </SelectItem>
          ) : loading ? (
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