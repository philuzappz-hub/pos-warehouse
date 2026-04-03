import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BranchRow } from "@/features/reports/types";
import { money } from "@/features/suppliers/helpers";
import type { SupplierRow } from "@/features/suppliers/types";

type Props = {
  suppliers: SupplierRow[];
  branches: BranchRow[];
  onEdit: (supplier: SupplierRow) => void;
};

export default function SupplierTable({ suppliers, branches, onEdit }: Props) {
  const getBranchName = (branchId: string | null) => {
    if (!branchId) return "All / Company-wide";
    return branches.find((b) => b.id === branchId)?.name || "Unknown branch";
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-600 bg-slate-900 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700 bg-slate-800 hover:bg-slate-800">
            <TableHead className="font-semibold text-slate-200">Name</TableHead>
            <TableHead className="font-semibold text-slate-200">Code</TableHead>
            <TableHead className="font-semibold text-slate-200">Contact</TableHead>
            <TableHead className="font-semibold text-slate-200">Phone</TableHead>
            <TableHead className="font-semibold text-slate-200">Branch</TableHead>
            <TableHead className="text-right font-semibold text-slate-200">
              Opening Balance
            </TableHead>
            <TableHead className="font-semibold text-slate-200">Status</TableHead>
            <TableHead className="text-right font-semibold text-slate-200">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {suppliers.map((supplier) => (
            <TableRow
              key={supplier.id}
              className="border-slate-700 hover:bg-slate-800/70"
            >
              <TableCell className="text-white">
                <div className="font-semibold text-white">{supplier.name}</div>
                {supplier.address ? (
                  <div className="text-xs text-slate-400">{supplier.address}</div>
                ) : null}
              </TableCell>

              <TableCell className="text-slate-200">
                {supplier.supplier_code || "-"}
              </TableCell>
              <TableCell className="text-slate-200">
                {supplier.contact_person || "-"}
              </TableCell>
              <TableCell className="text-slate-200">{supplier.phone || "-"}</TableCell>
              <TableCell className="text-slate-200">
                {getBranchName(supplier.branch_id)}
              </TableCell>
              <TableCell className="text-right font-medium text-cyan-300">
                GHS {money(supplier.opening_balance)}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    supplier.is_active
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                      : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                  }`}
                >
                  {supplier.is_active ? "Active" : "Inactive"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => onEdit(supplier)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}

          {suppliers.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-slate-300">
                No suppliers found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}