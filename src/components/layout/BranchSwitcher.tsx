import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';

type Branch = {
  id: string;
  name: string;
};

export function BranchSwitcher() {
  const { isAdmin, activeBranchId, setActiveBranchId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;

    const loadBranches = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error loading branches:', error);
        setBranches([]);
      } else {
        setBranches((data ?? []) as Branch[]);
      }

      setLoading(false);
    };

    loadBranches();
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <div className="px-3 py-2">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        Active Branch
      </label>

      <Select
        value={activeBranchId ?? 'all'}
        onValueChange={(value) => setActiveBranchId(value === 'all' ? null : value)}
        disabled={loading}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="All branches" />
        </SelectTrigger>

        <SelectContent>
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
