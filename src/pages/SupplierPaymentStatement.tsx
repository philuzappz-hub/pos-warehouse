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
import SupplierPaymentStatementTable from "@/features/suppliers/components/SupplierPaymentStatementTable";
import { money } from "@/features/suppliers/helpers";
import {
  buildSummaryCardHtml,
  buildTableHtml,
  openPrintFriendlyPdf,
  shareReportViaWhatsApp,
} from "@/features/suppliers/reportExport";
import { fetchSuppliers } from "@/features/suppliers/services";
import {
  autoAllocateSupplierPayment,
  fetchSupplierPaymentAllocations,
  type SupplierPaymentAllocationRow,
} from "@/features/suppliers/services_payment_allocations";
import {
  fetchSupplierPaymentStatement,
  type SupplierPaymentStatementRow,
  type SupplierPaymentStatementSummary,
} from "@/features/suppliers/services_payment_statement";
import type { SupplierRow } from "@/features/suppliers/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

type BranchRow = {
  id: string;
  name: string;
};

type CompanyMeta = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function SupplierPaymentStatement() {
  const { profile, activeBranchId } = useAuth() as any;
  const { toast } = useToast();

  const companyId = profile?.company_id ?? null;
  const today = todayString();

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [companyMeta, setCompanyMeta] = useState<CompanyMeta>({
    name: profile?.company_name || profile?.company?.name || "Company",
    address: profile?.company_address || profile?.company?.address || "",
    phone: profile?.company_phone || profile?.company?.phone || "",
    email: profile?.company_email || profile?.company?.email || "",
    logo_url: profile?.company_logo_url || profile?.company?.logo_url || "",
  });

  const [rows, setRows] = useState<SupplierPaymentStatementRow[]>([]);
  const [summary, setSummary] = useState<SupplierPaymentStatementSummary>({
    totalPayments: 0,
    cashPayments: 0,
    momoPayments: 0,
    bankTransferPayments: 0,
    cardPayments: 0,
    linkedPayments: 0,
    unallocatedPayments: 0,
  });

  const [supplierId, setSupplierId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRow, setHistoryRow] = useState<SupplierPaymentStatementRow | null>(null);
  const [historyRows, setHistoryRows] = useState<SupplierPaymentAllocationRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const supplierLabel = useMemo(() => {
    if (supplierId === "all") return "All Suppliers";
    return suppliers.find((s) => s.id === supplierId)?.name || "Selected Supplier";
  }, [supplierId, suppliers]);

  const branchLabel = useMemo(() => {
    if (branchId === "all") return "All Branches";
    return branches.find((b) => b.id === branchId)?.name || "Selected Branch";
  }, [branchId, branches]);

  async function loadSetup() {
    if (!companyId) return;

    const suppliersData = await fetchSuppliers({
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

    const { data: companyRow, error: companyError } = await (supabase as any)
      .from("companies")
      .select("name,address,phone,email,logo_url")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw companyError;

    setSuppliers(suppliersData);
    setBranches((branchesData ?? []) as BranchRow[]);

    if (companyRow) {
      setCompanyMeta({
        name: companyRow.name || "Company",
        address: companyRow.address || "",
        phone: companyRow.phone || "",
        email: companyRow.email || "",
        logo_url: companyRow.logo_url || "",
      });
    }
  }

  async function loadStatement() {
    if (!companyId) return;

    setLoading(true);
    try {
      const result = await fetchSupplierPaymentStatement({
        companyId,
        supplierId: supplierId === "all" ? null : supplierId,
        branchId: branchId === "all" ? null : branchId,
        startDate: startDate || null,
        endDate: endDate || null,
        paymentMethod,
        referenceSearch,
      });

      setRows(result.rows);
      setSummary(result.summary);
    } catch (e: any) {
      toast({
        title: "Load failed",
        description: e?.message || "Could not load payment statement.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoAllocate(row: SupplierPaymentStatementRow) {
    try {
      const result = await autoAllocateSupplierPayment(row.id);
      toast({
        title: result.success ? "Allocation completed" : "Allocation finished",
        description: result.message,
      });
      await loadStatement();
    } catch (e: any) {
      toast({
        title: "Allocation failed",
        description: e?.message || "Could not auto allocate payment.",
        variant: "destructive",
      });
    }
  }

  async function handleViewHistory(row: SupplierPaymentStatementRow) {
    setHistoryOpen(true);
    setHistoryRow(row);
    setHistoryLoading(true);

    try {
      const allocations = await fetchSupplierPaymentAllocations(row.id);
      setHistoryRows(allocations);
    } catch (e: any) {
      setHistoryRows([]);
      toast({
        title: "History load failed",
        description: e?.message || "Could not load allocation history.",
        variant: "destructive",
      });
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleExport() {
    const summaryCardsHtml = [
      buildSummaryCardHtml("Total Payments", `GHS ${money(summary.totalPayments)}`),
      buildSummaryCardHtml("Cash Payments", `GHS ${money(summary.cashPayments)}`),
      buildSummaryCardHtml("MoMo Payments", `GHS ${money(summary.momoPayments)}`),
      buildSummaryCardHtml("Bank Transfer Payments", `GHS ${money(summary.bankTransferPayments)}`),
      buildSummaryCardHtml("Card Payments", `GHS ${money(summary.cardPayments)}`),
      buildSummaryCardHtml("Allocated to Purchases", `GHS ${money(summary.linkedPayments)}`),
      buildSummaryCardHtml("Unallocated", `GHS ${money(summary.unallocatedPayments)}`),
    ].join("");

    const tableHtml = buildTableHtml({
      headers: [
        { label: "Date" },
        { label: "Supplier" },
        { label: "Branch" },
        { label: "Method" },
        { label: "Reference" },
        { label: "Purchase Link" },
        { label: "Amount", right: true },
        { label: "Allocated", right: true },
        { label: "Unallocated", right: true },
        { label: "Status" },
      ],
      rows: rows.map((row) => [
        row.payment_date,
        row.supplier_name,
        row.branch_name || "Company-wide",
        row.payment_method || "-",
        row.reference_number || "-",
        row.purchase_reference || "General / Unallocated",
        `GHS ${money(row.amount)}`,
        `GHS ${money(row.allocated_amount)}`,
        `GHS ${money(row.unallocated_amount)}`,
        row.allocation_status || "unallocated",
      ]),
    });

    openPrintFriendlyPdf({
      meta: {
        title: "Supplier Payment Statement",
        supplierLabel,
        branchLabel,
        startDate,
        endDate,
        company: companyMeta,
      },
      summaryCardsHtml,
      tableHtml,
    });
  }

  function handleShare() {
    shareReportViaWhatsApp({
      meta: {
        title: "Supplier Payment Statement",
        supplierLabel,
        branchLabel,
        startDate,
        endDate,
        company: companyMeta,
      },
      summaryLines: [
        `Total Payments: GHS ${money(summary.totalPayments)}`,
        `Cash Payments: GHS ${money(summary.cashPayments)}`,
        `MoMo Payments: GHS ${money(summary.momoPayments)}`,
        `Bank Transfer Payments: GHS ${money(summary.bankTransferPayments)}`,
        `Card Payments: GHS ${money(summary.cardPayments)}`,
        `Allocated to Purchases: GHS ${money(summary.linkedPayments)}`,
        `Unallocated: GHS ${money(summary.unallocatedPayments)}`,
      ],
    });
  }

  useEffect(() => {
    void loadSetup();
  }, [companyId, activeBranchId]);

  useEffect(() => {
    void loadStatement();
  }, [companyId, supplierId, branchId, paymentMethod, referenceSearch, startDate, endDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Supplier Payment Statement</h1>
          <p className="text-slate-300">
            Payment-history report only. This page shows payment records and allocation visibility.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleShare}>
            Share
          </Button>
          <Button onClick={handleExport}>Export</Button>
        </div>
      </div>

      <Card className="border-slate-600 bg-slate-900">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2">
            <Label className="text-slate-200">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
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
              <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
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
            <Label className="text-slate-200">Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="momo">MoMo</SelectItem>
                <SelectItem value="bank transfer">Bank Transfer</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Reference Search</Label>
            <Input
              value={referenceSearch}
              onChange={(e) => setReferenceSearch(e.target.value)}
              className="border-slate-500 bg-slate-950 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border-slate-500 bg-slate-950 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border-slate-500 bg-slate-950 text-white"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="pt-4 text-white">
            Total Payments
            <br />
            GHS {money(summary.totalPayments)}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="pt-4 text-emerald-300">
            Allocated to Purchases
            <br />
            GHS {money(summary.linkedPayments)}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="pt-4 text-amber-300">
            Unallocated
            <br />
            GHS {money(summary.unallocatedPayments)}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="pt-4 text-cyan-300">
            Methods Total
            <br />
            GHS {money(summary.cashPayments + summary.momoPayments + summary.bankTransferPayments + summary.cardPayments)}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-600 bg-slate-900">
        <CardContent className="pt-6">
          <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/70">
            <SupplierPaymentStatementTable
              rows={rows}
              totalAmount={summary.totalPayments}
              onAutoAllocate={handleAutoAllocate}
              onViewHistory={handleViewHistory}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-4xl border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>Allocation Log</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {historyRow ? (
              <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-400">Payment Amount</p>
                  <p className="font-semibold text-emerald-300">GHS {money(historyRow.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Allocated</p>
                  <p className="font-semibold text-cyan-300">
                    GHS {money(historyRow.allocated_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Unallocated</p>
                  <p className="font-semibold text-amber-300">
                    GHS {money(historyRow.unallocated_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  <p className="font-semibold text-white">{historyRow.allocation_status}</p>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              {historyLoading ? (
                <p className="text-slate-300">Loading allocation log...</p>
              ) : historyRows.length === 0 ? (
                <p className="text-slate-400">No allocation history found for this payment.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="border-b border-slate-700 text-slate-300">
                      <tr>
                        <th className="px-3 py-2 text-left">Purchase Date</th>
                        <th className="px-3 py-2 text-left">Order ID</th>
                        <th className="px-3 py-2 text-left">Reference</th>
                        <th className="px-3 py-2 text-right">Purchase Total</th>
                        <th className="px-3 py-2 text-right">Allocated</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                        <th className="px-3 py-2 text-left">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row) => (
                        <tr key={row.allocation_id} className="border-b border-slate-800">
                          <td className="px-3 py-2 text-slate-200">{row.purchase_date}</td>
                          <td className="px-3 py-2 text-white">{row.invoice_number || "-"}</td>
                          <td className="px-3 py-2 text-slate-300">{row.reference_number || "-"}</td>
                          <td className="px-3 py-2 text-right text-white">
                            GHS {money(row.purchase_total_amount)}
                          </td>
                          <td className="px-3 py-2 text-right text-cyan-300">
                            GHS {money(row.allocated_amount)}
                          </td>
                          <td className="px-3 py-2 text-slate-300">{row.notes || "-"}</td>
                          <td className="px-3 py-2 text-slate-400">
                            {formatDisplayDate(row.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}