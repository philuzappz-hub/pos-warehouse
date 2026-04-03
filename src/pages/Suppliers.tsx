import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BranchRow } from "@/features/reports/types";
import SupplierFormDialog from "@/features/suppliers/components/SupplierFormDialog";
import SupplierStatsCards from "@/features/suppliers/components/SupplierStatsCards";
import SupplierTable from "@/features/suppliers/components/SupplierTable";
import { getSupplierStats } from "@/features/suppliers/helpers";
import { createSupplier, fetchSuppliers, updateSupplier } from "@/features/suppliers/services";
import type { SupplierFormValues, SupplierRow } from "@/features/suppliers/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";

export default function Suppliers() {
  const { toast } = useToast();
  const { profile, user, activeBranchId } = useAuth() as any;

  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null);

  const loadBranches = async () => {
    if (!companyId) return;

    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await (supabase as any)
      .from("branches")
      .select("id,name,address,phone,email,company_id,is_active")
      .eq("company_id", companyId)
      .order("name");

    if (error) throw error;
    setBranches((data ?? []) as BranchRow[]);
  };

  const loadSuppliers = async () => {
    if (!companyId) {
      setSuppliers([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await fetchSuppliers({
        companyId,
        branchId: activeBranchId || null,
        includeAllBranches: true,
      });
      setSuppliers(rows);
    } catch (e: any) {
      toast({
        title: "Load failed",
        description: e?.message || "Could not load suppliers.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
    void loadSuppliers();
  }, [companyId, activeBranchId]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;

    return suppliers.filter((supplier) => {
      const hay = [
        supplier.name,
        supplier.supplier_code,
        supplier.contact_person,
        supplier.phone,
        supplier.email,
        supplier.address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [suppliers, search]);

  const stats = useMemo(() => getSupplierStats(filteredSuppliers), [filteredSuppliers]);

  const handleCreate = async (values: SupplierFormValues) => {
    if (!companyId) {
      throw new Error("Missing company.");
    }

    await createSupplier({
      companyId,
      userId,
      values,
    });

    toast({
      title: "Supplier added",
      description: "Supplier saved successfully.",
    });

    await loadSuppliers();
  };

  const handleUpdate = async (values: SupplierFormValues) => {
    if (!editingSupplier) {
      throw new Error("No supplier selected.");
    }

    await updateSupplier({
      supplierId: editingSupplier.id,
      values,
    });

    toast({
      title: "Supplier updated",
      description: "Supplier updated successfully.",
    });

    setEditingSupplier(null);
    await loadSuppliers();
  };

  return (
    <div className="space-y-6 bg-slate-950 p-1">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Suppliers</h1>
          <p className="text-slate-300">
            Manage suppliers, contacts, branch ownership, and opening balances.
          </p>
        </div>

        <Button
          className="font-semibold"
          onClick={() => {
            setEditingSupplier(null);
            setDialogOpen(true);
          }}
        >
          Add Supplier
        </Button>
      </div>

      <SupplierStatsCards stats={stats} />

      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 xl:col-span-2">
              <Label className="font-medium text-slate-200">Search Suppliers</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, code, contact, phone, email..."
                className="border-slate-600 bg-slate-800 text-white placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => void loadSuppliers()}
                disabled={loading}
                className="font-medium"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <SupplierTable
        suppliers={filteredSuppliers}
        branches={branches}
        onEdit={(supplier) => {
          setEditingSupplier(supplier);
          setDialogOpen(true);
        }}
      />

      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingSupplier(null);
        }}
        branches={branches}
        initialValues={editingSupplier}
        onSubmit={async (values) => {
          try {
            if (editingSupplier) {
              await handleUpdate(values);
            } else {
              await handleCreate(values);
            }
          } catch (e: any) {
            toast({
              title: editingSupplier ? "Update failed" : "Create failed",
              description: e?.message || "Could not save supplier.",
              variant: "destructive",
            });
            throw e;
          }
        }}
      />
    </div>
  );
}