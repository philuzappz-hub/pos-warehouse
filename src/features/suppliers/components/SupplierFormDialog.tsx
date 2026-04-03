import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BranchRow } from "@/features/reports/types";
import { validateSupplierForm } from "@/features/suppliers/helpers";
import type { SupplierFormValues, SupplierRow } from "@/features/suppliers/types";
import { emptySupplierForm } from "@/features/suppliers/types";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchRow[];
  initialValues?: SupplierRow | null;
  onSubmit: (values: SupplierFormValues) => Promise<void>;
};

const inputClassName =
  "border-slate-600 bg-slate-800 text-white placeholder:text-slate-400";

type SetFormValue = <K extends keyof SupplierFormValues>(
  key: K,
  value: SupplierFormValues[K]
) => void;

export default function SupplierFormDialog({
  open,
  onOpenChange,
  branches,
  initialValues,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<SupplierFormValues>(emptySupplierForm);
  const [saving, setSaving] = useState(false);

  const setFormValue: SetFormValue = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!initialValues) {
      setValues(emptySupplierForm);
      return;
    }

    setValues({
      supplier_code: initialValues.supplier_code || "",
      name: initialValues.name || "",
      contact_person: initialValues.contact_person || "",
      phone: initialValues.phone || "",
      alt_phone: initialValues.alt_phone || "",
      email: initialValues.email || "",
      address: initialValues.address || "",
      notes: initialValues.notes || "",
      opening_balance: String(initialValues.opening_balance ?? 0),
      branch_id: initialValues.branch_id || "all",
      is_active: Boolean(initialValues.is_active),
    });
  }, [initialValues, open]);

  const handleSubmit = async () => {
    const error = validateSupplierForm(values);
    if (error) {
      throw new Error(error);
    }

    setSaving(true);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-700 bg-slate-900 text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initialValues ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pr-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-slate-200">Supplier Code</Label>
            <Input
              className={inputClassName}
              value={values.supplier_code}
              onChange={(e) => setFormValue("supplier_code", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Supplier Name *</Label>
            <Input
              className={inputClassName}
              value={values.name}
              onChange={(e) => setFormValue("name", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Contact Person</Label>
            <Input
              className={inputClassName}
              value={values.contact_person}
              onChange={(e) => setFormValue("contact_person", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Phone</Label>
            <Input
              className={inputClassName}
              value={values.phone}
              onChange={(e) => setFormValue("phone", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Alternative Phone</Label>
            <Input
              className={inputClassName}
              value={values.alt_phone}
              onChange={(e) => setFormValue("alt_phone", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Email</Label>
            <Input
              type="email"
              className={inputClassName}
              value={values.email}
              onChange={(e) => setFormValue("email", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Branch</Label>
            <Select
              value={values.branch_id}
              onValueChange={(value) => setFormValue("branch_id", value)}
            >
              <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-800 text-white">
                <SelectItem value="all">All / Company-wide</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Opening Balance</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              className={inputClassName}
              value={values.opening_balance}
              onChange={(e) => setFormValue("opening_balance", e.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-slate-200">Address</Label>
            <Input
              className={inputClassName}
              value={values.address}
              onChange={(e) => setFormValue("address", e.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-slate-200">Notes</Label>
            <Input
              className={inputClassName}
              value={values.notes}
              onChange={(e) => setFormValue("notes", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Status</Label>
            <Select
              value={values.is_active ? "active" : "inactive"}
              onValueChange={(value) => setFormValue("is_active", value === "active")}
            >
              <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-800 text-white">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : initialValues ? "Update Supplier" : "Save Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}