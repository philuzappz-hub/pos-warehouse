import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { History, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BranchRow = {
  id: string;
  name: string;
  company_id: string | null;
  is_active?: boolean | null;
};

type ReconciliationRow = {
  id: string;
  company_id: string;
  branch_id: string;
  reconciliation_date: string;
  opening_float: number;
  cash_sales_received: number;
  cash_returns_paid: number;
  cash_expenses_paid: number;
  expected_cash: number;
  actual_cash_counted: number;
  difference_amount: number;
  notes: string | null;
  closed_by: string;
  closed_at: string;
  created_at: string;
  updated_at: string;
};

type ReconciliationDisplayRow = ReconciliationRow & {
  branch_name: string;
  status_label: "Balanced" | "Short" | "Excess";
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getStatusLabel(diff: number): "Balanced" | "Short" | "Excess" {
  if (Math.abs(Number(diff || 0)) < 0.005) return "Balanced";
  if (Number(diff || 0) < 0) return "Short";
  return "Excess";
}

function getStatusClasses(status: "Balanced" | "Short" | "Excess") {
  if (status === "Balanced") {
    return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  }
  if (status === "Short") {
    return "text-red-300 border-red-500/30 bg-red-500/10";
  }
  return "text-amber-300 border-amber-500/30 bg-amber-500/10";
}

export default function ReconciliationHistory() {
  const { toast } = useToast();
  const { profile, activeBranchId } = useAuth() as any;

  const companyId = (profile as any)?.company_id ?? null;

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  });
  const [endDate, setEndDate] = useState(isoDate(new Date()));

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(activeBranchId || "all");

  const [rows, setRows] = useState<ReconciliationDisplayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [openDetails, setOpenDetails] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ReconciliationDisplayRow | null>(null);

  const scopeLabel = useMemo(() => {
    if (selectedBranchId === "all") return "All branches";
    return branches.find((b) => b.id === selectedBranchId)?.name || "Selected branch";
  }, [selectedBranchId, branches]);

  const totalShort = useMemo(() => {
    return rows
      .filter((r) => r.status_label === "Short")
      .reduce((sum, r) => sum + Math.abs(Number(r.difference_amount || 0)), 0);
  }, [rows]);

  const totalExcess = useMemo(() => {
    return rows
      .filter((r) => r.status_label === "Excess")
      .reduce((sum, r) => sum + Number(r.difference_amount || 0), 0);
  }, [rows]);

  const loadBranches = async () => {
    if (!companyId) {
      setBranches([]);
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from("branches")
        .select("id,name,company_id,is_active")
        .eq("company_id", companyId)
        .order("name");

      if (error) throw error;

      setBranches((data || []) as BranchRow[]);
    } catch (e: any) {
      console.error(e);
      setBranches([]);
    }
  };

  const loadHistory = async () => {
    if (!companyId) {
      setRows([]);
      return;
    }

    setLoading(true);

    try {
      let q = (supabase as any)
        .from("cash_reconciliations")
        .select("*")
        .eq("company_id", companyId)
        .gte("reconciliation_date", startDate)
        .lte("reconciliation_date", endDate)
        .order("reconciliation_date", { ascending: false })
        .order("closed_at", { ascending: false });

      if (selectedBranchId !== "all") {
        q = q.eq("branch_id", selectedBranchId);
      }

      const { data, error } = await q;
      if (error) throw error;

      const branchMap = new Map<string, string>();
      branches.forEach((b) => branchMap.set(b.id, b.name));

      const mapped: ReconciliationDisplayRow[] = ((data || []) as ReconciliationRow[]).map(
        (row) => ({
          ...row,
          branch_name: branchMap.get(row.branch_id) || "Unknown branch",
          status_label: getStatusLabel(Number(row.difference_amount || 0)),
        })
      );

      setRows(mapped);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Load failed",
        description: e?.message || "Could not load reconciliation history.",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (activeBranchId) {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId]);

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, startDate, endDate, selectedBranchId, branches.length]);

  const openRowDetails = (row: ReconciliationDisplayRow) => {
    setSelectedRow(row);
    setOpenDetails(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reconciliation History</h1>
          <p className="text-slate-400">
            Review saved daily cash closings{" "}
            <span className="text-slate-500">• {scopeLabel}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadHistory()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-end">
            <div>
              <Label className="text-slate-200">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-200">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-200">Branch</Label>
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Button onClick={() => void loadHistory()} disabled={loading} className="w-full">
                {loading ? "Loading..." : "Apply Filters"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <History className="h-4 w-4" />
              Total Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{rows.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Total Short
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-300">GHS {money(totalShort)}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Total Excess
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-300">GHS {money(totalExcess)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Saved Closings</CardTitle>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Date</TableHead>
                <TableHead className="text-slate-400">Branch</TableHead>
                <TableHead className="text-slate-400 text-right">Opening Float</TableHead>
                <TableHead className="text-slate-400 text-right">Expected Cash</TableHead>
                <TableHead className="text-slate-400 text-right">Actual Cash</TableHead>
                <TableHead className="text-slate-400 text-right">Difference</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400">Closed At</TableHead>
                <TableHead className="text-slate-400">Notes</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-slate-700 cursor-pointer hover:bg-slate-700/40 transition-colors"
                  onClick={() => openRowDetails(row)}
                  title="Click to view full closing details"
                >
                  <TableCell className="text-white">
                    {new Date(row.reconciliation_date).toLocaleDateString()}
                  </TableCell>

                  <TableCell className="text-slate-300">{row.branch_name}</TableCell>

                  <TableCell className="text-slate-300 text-right">
                    GHS {money(row.opening_float)}
                  </TableCell>

                  <TableCell className="text-cyan-200 text-right">
                    GHS {money(row.expected_cash)}
                  </TableCell>

                  <TableCell className="text-white text-right">
                    GHS {money(row.actual_cash_counted)}
                  </TableCell>

                  <TableCell
                    className={`text-right font-medium ${
                      row.status_label === "Balanced"
                        ? "text-emerald-300"
                        : row.status_label === "Short"
                        ? "text-red-300"
                        : "text-amber-300"
                    }`}
                  >
                    GHS {money(row.difference_amount)}
                  </TableCell>

                  <TableCell>
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${getStatusClasses(
                        row.status_label
                      )}`}
                    >
                      {row.status_label}
                    </span>
                  </TableCell>

                  <TableCell className="text-slate-300">
                    {row.closed_at ? new Date(row.closed_at).toLocaleString() : "-"}
                  </TableCell>

                  <TableCell className="text-slate-400 max-w-[240px] truncate" title={row.notes || ""}>
                    {row.notes || "-"}
                  </TableCell>
                </TableRow>
              ))}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-400 py-8">
                    No reconciliation records found for the selected filters.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-400 py-8">
                    Loading reconciliation history...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={openDetails}
        onOpenChange={(next) => {
          setOpenDetails(next);
          if (!next) setSelectedRow(null);
        }}
      >
        <DialogContent className="bg-slate-800 border-slate-700 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedRow
                ? `${selectedRow.branch_name} • Closing Details`
                : "Closing Details"}
            </DialogTitle>
          </DialogHeader>

          {selectedRow && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Date</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {new Date(selectedRow.reconciliation_date).toLocaleDateString()}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Branch</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {selectedRow.branch_name}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Closed At</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {selectedRow.closed_at
                      ? new Date(selectedRow.closed_at).toLocaleString()
                      : "-"}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Status</p>
                  <div
                    className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getStatusClasses(
                      selectedRow.status_label
                    )}`}
                  >
                    {selectedRow.status_label}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Opening Float</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    GHS {money(selectedRow.opening_float)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Cash Sales Received</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    GHS {money(selectedRow.cash_sales_received)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Cash Returns Paid</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    GHS {money(selectedRow.cash_returns_paid)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Cash Expenses Paid</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    GHS {money(selectedRow.cash_expenses_paid)}
                  </p>
                </div>

                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                  <p className="text-[11px] text-cyan-200">Expected Cash</p>
                  <p className="mt-2 text-2xl font-bold text-cyan-100">
                    GHS {money(selectedRow.expected_cash)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Actual Cash Counted</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    GHS {money(selectedRow.actual_cash_counted)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] text-slate-400">Difference</p>
                  <p
                    className={`mt-2 text-2xl font-bold ${
                      selectedRow.status_label === "Balanced"
                        ? "text-emerald-300"
                        : selectedRow.status_label === "Short"
                        ? "text-red-300"
                        : "text-amber-300"
                    }`}
                  >
                    GHS {money(selectedRow.difference_amount)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
                <p className="text-sm font-medium text-white mb-2">Notes</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">
                  {selectedRow.notes || "No notes added."}
                </p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-300">
                <p className="font-medium text-white mb-2">Formula Used</p>
                <p>
                  Expected Cash = Opening Float + Cash Sales Received − Cash Returns Paid − Cash
                  Expenses Paid
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDetails(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}