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
import {
    emptySupplierCreditNoteForm,
    type SupplierCreditNoteFormValues,
} from "@/features/suppliers/services_credit_notes";
import type { SupplierRow } from "@/features/suppliers/types";
import { useEffect, useState } from "react";

type BranchRow = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierRow[];
  branches: BranchRow[];
  defaultBranchId?: string;
  onSubmit: (values: SupplierCreditNoteFormValues) => Promise<void>;
};

export default function SupplierCreditNoteDialog({
  open,
  onOpenChange,
  suppliers,
  branches,
  defaultBranchId = "",
  onSubmit,
}: Props) {
  const [values, setValues] = useState<SupplierCreditNoteFormValues>({
    ...emptySupplierCreditNoteForm,
    branch_id: defaultBranchId,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues({
      ...emptySupplierCreditNoteForm,
      branch_id: defaultBranchId,
    });
  }, [open, defaultBranchId]);

  const setField = <K extends keyof SupplierCreditNoteFormValues>(
    key: K,
    value: SupplierCreditNoteFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
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
      <DialogContent className="border-slate-700 bg-slate-900 text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Supplier Credit Note</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-slate-200">Supplier</Label>
            <Select
              value={values.supplier_id}
              onValueChange={(value) => setField("supplier_id", value)}
            >
              <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Branch</Label>
            <Select
              value={values.branch_id || "none"}
              onValueChange={(value) => setField("branch_id", value === "none" ? "" : value)}
            >
              <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Company-wide</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Credit Date</Label>
            <Input
              type="date"
              value={values.credit_date}
              onChange={(e) => setField("credit_date", e.target.value)}
              className="border-slate-600 bg-slate-800 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={values.amount}
              onChange={(e) => setField("amount", e.target.value)}
              className="border-slate-600 bg-slate-800 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Reference Number</Label>
            <Input
              value={values.reference_number}
              onChange={(e) => setField("reference_number", e.target.value)}
              className="border-slate-600 bg-slate-800 text-white"
              placeholder="Optional reference"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Reason</Label>
            <Input
              value={values.reason}
              onChange={(e) => setField("reason", e.target.value)}
              className="border-slate-600 bg-slate-800 text-white"
              placeholder="e.g. returned goods / price adjustment"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-slate-200">Notes</Label>
            <Input
              value={values.notes}
              onChange={(e) => setField("notes", e.target.value)}
              className="border-slate-600 bg-slate-800 text-white"
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Credit Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}