import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SupplierStatementTable from "@/features/suppliers/components/SupplierStatementTable";
import { money } from "@/features/suppliers/helpers";
import {
  buildSummaryCardHtml,
  buildTableHtml,
  openPrintFriendlyPdf,
  shareReportViaWhatsApp,
} from "@/features/suppliers/reportExport";
import {
  fetchSupplierStatement,
  fetchSuppliers,
  type SupplierAccountSnapshot,
} from "@/features/suppliers/services";
import {
  fetchSupplierPaymentStatement,
  type SupplierPaymentStatementRow,
} from "@/features/suppliers/services_payment_statement";
import type { SupplierRow, SupplierStatementEntry } from "@/features/suppliers/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

type CompanyExportDetails = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildWhatsAppPhone(phone?: string | null) {
  const raw = String(phone || "").replace(/\D/g, "");
  if (!raw) return "";
  if (raw.startsWith("233")) return raw;
  if (raw.startsWith("0") && raw.length === 10) return `233${raw.slice(1)}`;
  return raw;
}

function getSummary(snapshot?: SupplierAccountSnapshot | null) {
  const purchases = roundMoney(safeNumber(snapshot?.totalPurchases));
  const cashPaidToPurchases = roundMoney(safeNumber(snapshot?.totalPayments));
  const creditApplied = roundMoney(safeNumber(snapshot?.totalCreditsApplied));
  const settledAgainstPurchases = roundMoney(cashPaidToPurchases + creditApplied);
  const grossOutstanding = roundMoney(Math.max(purchases - settledAgainstPurchases, 0));
  const availableCredit = roundMoney(safeNumber(snapshot?.availableCredit));
  const netPayable = roundMoney(Math.max(grossOutstanding - availableCredit, 0));

  return {
    purchases,
    cashPaidToPurchases,
    creditApplied,
    settledAgainstPurchases,
    grossOutstanding,
    availableCredit,
    netPayable,
  };
}

export default function SupplierStatement() {
  const { profile, activeBranchId } = useAuth() as any;
  const { toast } = useToast();

  const companyId = profile?.company_id ?? null;
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierId, setSupplierId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [entries, setEntries] = useState<SupplierStatementEntry[]>([]);
  const [snapshot, setSnapshot] = useState<SupplierAccountSnapshot | null>(null);
  const [paymentRows, setPaymentRows] = useState<SupplierPaymentStatementRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [companyMeta, setCompanyMeta] = useState<CompanyExportDetails>({
    name: profile?.company_name || profile?.company?.name || "Company",
    address: profile?.company_address || profile?.company?.address || "",
    phone: profile?.company_phone || profile?.company?.phone || "",
    email: profile?.company_email || profile?.company?.email || "",
    logo_url: profile?.company_logo_url || profile?.company?.logo_url || "",
  });

  const summary = useMemo(() => getSummary(snapshot), [snapshot]);

  async function loadSetup() {
    if (!companyId) return;

    const rows = await fetchSuppliers({
      companyId,
      branchId: activeBranchId || null,
      includeAllBranches: true,
    });

    const { data: companyRow } = await (supabase as any)
      .from("companies")
      .select("name,address,phone,email,logo_url")
      .eq("id", companyId)
      .maybeSingle();

    setSuppliers(rows);
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
    if (!companyId || supplierId === "all") {
      setSupplier(null);
      setEntries([]);
      setSnapshot(null);
      setPaymentRows([]);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchSupplierStatement({
        companyId,
        supplierId,
        startDate: startDate || null,
        endDate: endDate || null,
      });

      const paymentStatement = await fetchSupplierPaymentStatement({
        companyId,
        supplierId,
        startDate: startDate || null,
        endDate: endDate || null,
      });

      setSupplier(result.supplier);
      setEntries(result.entries);
      setSnapshot(result.snapshot);
      setPaymentRows(paymentStatement.rows);
    } catch (e: any) {
      toast({
        title: "Load failed",
        description: e?.message || "Could not load supplier statement.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    if (!supplier) return;

    const summaryCardsHtml = [
      buildSummaryCardHtml("Total Purchases", `GHS ${money(summary.purchases)}`),
      buildSummaryCardHtml("Cash Applied", `GHS ${money(summary.cashPaidToPurchases)}`),
      buildSummaryCardHtml("Credit Applied", `GHS ${money(summary.creditApplied)}`),
      buildSummaryCardHtml("Total Settled", `GHS ${money(summary.settledAgainstPurchases)}`),
      buildSummaryCardHtml("Gross Outstanding", `GHS ${money(summary.grossOutstanding)}`),
      buildSummaryCardHtml("Available Credit", `GHS ${money(summary.availableCredit)}`),
      buildSummaryCardHtml("Net Payable", `GHS ${money(summary.netPayable)}`),
    ].join("");

    const tableHtml = buildTableHtml({
      headers: [
        { label: "Date" },
        { label: "Type" },
        { label: "Reference" },
        { label: "Description" },
        { label: "Debit", right: true },
        { label: "Credit", right: true },
        { label: "Running Balance", right: true },
      ],
      rows: entries.map((entry) => [
        (entry as any).entry_date,
        (entry as any).entry_type,
        (entry as any).reference,
        (entry as any).description,
        (entry as any).debit ? `GHS ${money((entry as any).debit)}` : "—",
        (entry as any).credit ? `GHS ${money((entry as any).credit)}` : "—",
        `GHS ${money((entry as any).running_balance)}`,
      ]),
    });

    openPrintFriendlyPdf({
      meta: {
        title: "Supplier Statement",
        supplierLabel: supplier.name,
        branchLabel: "All Branches",
        startDate,
        endDate,
        company: companyMeta,
      },
      summaryCardsHtml,
      tableHtml,
    });
  }

  function handleShare() {
    if (!supplier) return;
    const phone = buildWhatsAppPhone((supplier as any).phone);
    if (!phone) {
      toast({
        title: "Missing phone number",
        description: "This supplier does not have a valid phone number for WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    const dateLabel =
      startDate || endDate
        ? `${startDate || "Beginning"} to ${endDate || "Today"}`
        : "All Time";

    const lines = [
      `Period: ${dateLabel}`,
      `Total Purchases: GHS ${money(summary.purchases)}`,
      `Cash Applied: GHS ${money(summary.cashPaidToPurchases)}`,
      `Credit Applied: GHS ${money(summary.creditApplied)}`,
      `Total Settled: GHS ${money(summary.settledAgainstPurchases)}`,
      `Gross Outstanding: GHS ${money(summary.grossOutstanding)}`,
      `Available Credit: GHS ${money(summary.availableCredit)}`,
      `Net Payable: GHS ${money(summary.netPayable)}`,
    ];

    shareReportViaWhatsApp({
      meta: {
        title: "Supplier Statement",
        supplierLabel: supplier.name,
        branchLabel: "All Branches",
        startDate,
        endDate,
        company: companyMeta,
      },
      summaryLines: lines,
    });
  }

  useEffect(() => {
    void loadSetup();
  }, [companyId, activeBranchId]);

  useEffect(() => {
    void loadStatement();
  }, [companyId, supplierId, startDate, endDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Supplier Statement</h1>
          <p className="text-slate-300">
            Ledger view only. Running balance is prepared by the service and rendered directly.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleShare} disabled={!supplier}>Share</Button>
          <Button onClick={handleExport} disabled={!supplier}>Export</Button>
        </div>
      </div>

      <Card className="border-slate-600 bg-slate-900">
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Select supplier</SelectItem>
                  {suppliers.map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border-slate-500 bg-slate-950 text-white" />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border-slate-500 bg-slate-950 text-white" />
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 text-white">
              {loading ? "Loading..." : supplier ? supplier.name : "Choose a supplier"}
            </div>
          </div>
        </CardContent>
      </Card>

      {supplier ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Card className="border-slate-600 bg-slate-900"><CardContent className="pt-6 text-white">Total Purchases<br />GHS {money(summary.purchases)}</CardContent></Card>
            <Card className="border-slate-600 bg-slate-900"><CardContent className="pt-6 text-emerald-300">Cash Applied<br />GHS {money(summary.cashPaidToPurchases)}</CardContent></Card>
            <Card className="border-slate-600 bg-slate-900"><CardContent className="pt-6 text-cyan-300">Credit Applied<br />GHS {money(summary.creditApplied)}</CardContent></Card>
            <Card className="border-slate-600 bg-slate-900"><CardContent className="pt-6 text-white">Total Settled<br />GHS {money(summary.settledAgainstPurchases)}</CardContent></Card>
            <Card className="border-slate-600 bg-slate-900"><CardContent className="pt-6 text-amber-300">Gross Outstanding<br />GHS {money(summary.grossOutstanding)}</CardContent></Card>
            <Card className="border-slate-600 bg-slate-900"><CardContent className="pt-6 text-cyan-300">Available Credit<br />GHS {money(summary.availableCredit)}</CardContent></Card>
            <Card className="border-slate-600 bg-slate-900"><CardContent className="pt-6 text-amber-300">Net Payable<br />GHS {money(summary.netPayable)}</CardContent></Card>
          </div>

          <Card className="border-slate-600 bg-slate-900">
            <CardHeader><CardTitle className="text-white">Statement Ledger</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <SupplierStatementTable entries={entries} />
            </CardContent>
          </Card>

          <Card className="border-slate-600 bg-slate-900">
            <CardHeader><CardTitle className="text-white">Recorded Supplier Payments</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/90 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Method</th>
                    <th className="px-4 py-3 text-left font-medium">Reference</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 text-right font-medium">Allocated</th>
                    <th className="px-4 py-3 text-right font-medium">Unallocated</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.length === 0 ? (
                    <tr><td className="px-4 py-6 text-slate-400" colSpan={7}>No payment rows found.</td></tr>
                  ) : (
                    paymentRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-800 last:border-b-0">
                        <td className="px-4 py-3 text-slate-200">{formatDisplayDate(row.payment_date)}</td>
                        <td className="px-4 py-3 text-slate-200">{row.payment_method || "-"}</td>
                        <td className="px-4 py-3 text-slate-200">{row.reference_number || "-"}</td>
                        <td className="px-4 py-3 text-right text-white">GHS {money(row.amount)}</td>
                        <td className="px-4 py-3 text-right text-emerald-300">GHS {money(row.allocated_amount)}</td>
                        <td className="px-4 py-3 text-right text-amber-300">GHS {money(row.unallocated_amount)}</td>
                        <td className="px-4 py-3 text-slate-200">{row.allocation_status || "unallocated"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
