import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
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
import SupplierCreditNoteDialog from "@/features/suppliers/components/SupplierCreditNoteDialog";
import SupplierCreditNoteTable from "@/features/suppliers/components/SupplierCreditNoteTable";
import { money } from "@/features/suppliers/helpers";
import { fetchSuppliers } from "@/features/suppliers/services";
import {
    applySupplierCreditNoteToPurchase,
    createSupplierCreditNote,
    fetchOpenSupplierPurchasesForCredit,
    fetchSupplierCreditNotes,
    type SupplierCreditNoteFormValues,
    type SupplierCreditNoteRow,
} from "@/features/suppliers/services_credit_notes";
import type { SupplierRow } from "@/features/suppliers/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

type BranchRow = {
  id: string;
  name: string;
};

type OpenPurchaseRow = {
  purchase_id: string;
  purchase_date: string;
  invoice_number: string | null;
  reference_number: string | null;
  total_amount: number;
  allocated_amount: number;
  balance_due: number;
};

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function SupplierCreditNotes() {
  const { profile, user, activeBranchId } = useAuth() as any;
  const { toast } = useToast();

  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [rows, setRows] = useState<SupplierCreditNoteRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [supplierId, setSupplierId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<SupplierCreditNoteRow | null>(null);
  const [openPurchases, setOpenPurchases] = useState<OpenPurchaseRow[]>([]);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [applyAmount, setApplyAmount] = useState("");
  const [applyNotes, setApplyNotes] = useState("");
  const [applying, setApplying] = useState(false);

  async function loadSetup() {
    if (!companyId) return;

    const supplierRows = await fetchSuppliers({
      companyId,
      branchId: activeBranchId || null,
      includeAllBranches: true,
    });

    const { data: branchesData, error: branchesError } = await (supabase as any)
      .from("branches")
      .select("id,name")
      .eq("company_id", companyId)
      .order("name");

    if (branchesError) throw branchesError;

    setSuppliers(supplierRows);
    setBranches((branchesData ?? []) as BranchRow[]);
  }

  async function loadRows() {
    if (!companyId) return;

    setLoading(true);
    try {
      const data = await fetchSupplierCreditNotes({
        companyId,
        supplierId: supplierId === "all" ? null : supplierId,
        branchId: branchId === "all" ? null : branchId,
        status,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setRows(data);
    } catch (e: any) {
      toast({
        title: "Load failed",
        description: e?.message || "Could not load supplier credit notes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSetup();
  }, [companyId, activeBranchId]);

  useEffect(() => {
    void loadRows();
  }, [companyId, supplierId, branchId, status, startDate, endDate]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += Number(row.amount || 0);
        acc.used += Number(row.used_amount || 0);
        acc.available += Number(row.available_amount || 0);
        return acc;
      },
      { total: 0, used: 0, available: 0 }
    );
  }, [rows]);

  const selectedPurchase =
    openPurchases.find((row) => row.purchase_id === selectedPurchaseId) || null;

  const maxApplicable = useMemo(() => {
    if (!selectedCredit || !selectedPurchase) return 0;
    return Math.min(
      Number(selectedCredit.available_amount || 0),
      Number(selectedPurchase.balance_due || 0)
    );
  }, [selectedCredit, selectedPurchase]);

  const handleCreate = async (values: SupplierCreditNoteFormValues) => {
    if (!companyId) return;

    await createSupplierCreditNote({
      companyId,
      userId,
      values,
    });

    toast({
      title: "Credit note saved",
      description: "Supplier credit note created successfully.",
    });

    await loadRows();
  };

  const handleOpenApply = async (row: SupplierCreditNoteRow) => {
    if (!companyId) return;

    setSelectedCredit(row);
    setSelectedPurchaseId("");
    setApplyAmount("");
    setApplyNotes("");
    setApplyOpen(true);

    try {
      const data = await fetchOpenSupplierPurchasesForCredit({
        companyId,
        supplierId: row.supplier_id,
      });
      setOpenPurchases(data as OpenPurchaseRow[]);
    } catch (e: any) {
      setOpenPurchases([]);
      toast({
        title: "Load failed",
        description: e?.message || "Could not load open purchases for this supplier.",
        variant: "destructive",
      });
    }
  };

  const handleApply = async () => {
    if (!selectedCredit || !selectedPurchaseId) return;

    const amount = Number(applyAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a valid amount greater than zero.",
        variant: "destructive",
      });
      return;
    }

    if (amount > maxApplicable) {
      toast({
        title: "Amount too high",
        description: `Maximum allowed now is GHS ${money(maxApplicable)}.`,
        variant: "destructive",
      });
      return;
    }

    setApplying(true);
    try {
      await applySupplierCreditNoteToPurchase({
        creditNoteId: selectedCredit.id,
        purchaseId: selectedPurchaseId,
        amount,
        notes: applyNotes.trim() || null,
      });

      toast({
        title: "Credit applied",
        description: "Supplier credit note applied to purchase successfully.",
      });

      setApplyOpen(false);
      setSelectedCredit(null);
      setOpenPurchases([]);
      await loadRows();
    } catch (e: any) {
      toast({
        title: "Apply failed",
        description: e?.message || "Could not apply supplier credit note.",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6 bg-slate-950 p-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Supplier Credit Notes</h1>
          <p className="text-slate-300">
            Manage non-cash supplier credits separately from payments and apply them safely to purchases.
          </p>
        </div>

        <Button onClick={() => setCreateOpen(true)}>New Credit Note</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-600 bg-slate-900">
          <CardContent className="pt-6 text-cyan-300">
            Total Credit
            <br />
            GHS {money(totals.total)}
          </CardContent>
        </Card>

        <Card className="border-slate-600 bg-slate-900">
          <CardContent className="pt-6 text-amber-300">
            Used
            <br />
            GHS {money(totals.used)}
          </CardContent>
        </Card>

        <Card className="border-slate-600 bg-slate-900">
          <CardContent className="pt-6 text-emerald-300">
            Available
            <br />
            GHS {money(totals.available)}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-600 bg-slate-900">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label className="text-slate-200">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
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
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-600 bg-slate-900">
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-10 text-center text-slate-400">Loading...</div>
          ) : (
            <SupplierCreditNoteTable rows={rows} onApply={handleOpenApply} />
          )}
        </CardContent>
      </Card>

      <SupplierCreditNoteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        suppliers={suppliers}
        branches={branches}
        defaultBranchId={activeBranchId || ""}
        onSubmit={handleCreate}
      />

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="border-slate-700 bg-slate-900 text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply Credit Note to Purchase</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {selectedCredit ? (
              <div className="grid gap-4 rounded-lg border border-slate-700 bg-slate-950/70 p-4 md:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-400">Credit Note</p>
                  <p className="font-medium text-white">{selectedCredit.reference_number || selectedCredit.id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Available</p>
                  <p className="font-semibold text-emerald-300">
                    GHS {money(selectedCredit.available_amount || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Supplier</p>
                  <p className="font-medium text-white">{selectedCredit.supplier_name}</p>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-slate-200">Choose Purchase</Label>
              <Select value={selectedPurchaseId} onValueChange={setSelectedPurchaseId}>
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue placeholder="Select purchase" />
                </SelectTrigger>
                <SelectContent>
                  {openPurchases.map((purchase) => (
                    <SelectItem key={purchase.purchase_id} value={purchase.purchase_id}>
                      {`${formatDisplayDate(purchase.purchase_date)} • ${
                        purchase.invoice_number || purchase.reference_number || purchase.purchase_id
                      } • Due: GHS ${money(purchase.balance_due)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPurchase ? (
              <div className="grid gap-4 rounded-lg border border-slate-700 bg-slate-950/70 p-4 md:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-400">Purchase Ref</p>
                  <p className="font-medium text-white">
                    {selectedPurchase.invoice_number || selectedPurchase.reference_number || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Balance Due</p>
                  <p className="font-semibold text-amber-300">
                    GHS {money(selectedPurchase.balance_due)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Max Applicable</p>
                  <p className="font-semibold text-cyan-300">
                    GHS {money(maxApplicable)}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-200">Apply Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={applyAmount}
                  onChange={(e) => setApplyAmount(e.target.value)}
                  className="border-slate-600 bg-slate-800 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Notes</Label>
                <Input
                  value={applyNotes}
                  onChange={(e) => setApplyNotes(e.target.value)}
                  className="border-slate-600 bg-slate-800 text-white"
                  placeholder="Optional allocation note"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setApplyOpen(false)} disabled={applying}>
                Cancel
              </Button>
              <Button onClick={handleApply} disabled={applying || !selectedPurchaseId}>
                {applying ? "Applying..." : "Apply Credit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}