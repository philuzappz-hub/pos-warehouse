import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
import SupplierStockStatementTable from "@/features/suppliers/components/SupplierStockStatementTable";
import { money } from "@/features/suppliers/helpers";
import {
    buildSummaryCardHtml,
    buildTableHtml,
    openPrintFriendlyPdf,
    shareReportViaWhatsApp,
} from "@/features/suppliers/reportExport";
import { fetchSuppliers } from "@/features/suppliers/services";
import {
    fetchSupplierStockStatement,
    type SupplierStockStatementRow,
    type SupplierStockStatementSummary,
} from "@/features/suppliers/services_stock_statement";
import type { SupplierRow } from "@/features/suppliers/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

type ProductOption = {
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function SupplierStockStatement() {
  const { profile, activeBranchId } = useAuth() as any;
  const { toast } = useToast();

  const companyId = profile?.company_id ?? null;
  const today = todayString();

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [companyMeta, setCompanyMeta] = useState<CompanyMeta>({
    name:
      profile?.company_name ||
      profile?.company?.name ||
      profile?.companyName ||
      "Company",
    address:
      profile?.company_address ||
      profile?.company?.address ||
      profile?.address ||
      "",
    phone:
      profile?.company_phone ||
      profile?.company?.phone ||
      profile?.phone ||
      "",
    email:
      profile?.company_email ||
      profile?.company?.email ||
      profile?.email ||
      "",
    logo_url:
      profile?.company_logo_url ||
      profile?.company?.logo_url ||
      profile?.logo_url ||
      "",
  });

  const [rows, setRows] = useState<SupplierStockStatementRow[]>([]);
  const [summary, setSummary] = useState<SupplierStockStatementSummary>({
    totalLines: 0,
    totalQuantity: 0,
    totalValue: 0,
    avgUnitCost: 0,
  });

  const [supplierId, setSupplierId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [loading, setLoading] = useState(false);

  const supplierLabel = useMemo(() => {
    if (supplierId === "all") return "All Suppliers";
    return suppliers.find((s) => s.id === supplierId)?.name || "Selected Supplier";
  }, [supplierId, suppliers]);

  const branchLabel = useMemo(() => {
    if (branchId === "all") return "All Branches";
    return branches.find((b) => b.id === branchId)?.name || "Selected Branch";
  }, [branchId, branches]);

  const loadSetup = async () => {
    if (!companyId) return;

    const suppliersData = await fetchSuppliers({
      companyId,
      branchId: activeBranchId || null,
      includeAllBranches: true,
    });

    const { data: branchesData, error: branchesError } = await (supabase as any)
      .from("branches")
      .select("id,name,address,phone,email,company_id,is_active")
      .eq("company_id", companyId)
      .order("name");

    if (branchesError) throw branchesError;

    const { data: productsData, error: productsError } = await (supabase as any)
      .from("products")
      .select("id,name")
      .eq("company_id", companyId)
      .order("name");

    if (productsError) throw productsError;

    const { data: companyRow, error: companyError } = await (supabase as any)
      .from("companies")
      .select("name,address,phone,email,logo_url")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw companyError;

    setSuppliers(suppliersData);
    setBranches((branchesData ?? []) as BranchRow[]);
    setProducts((productsData ?? []) as ProductOption[]);

    if (companyRow) {
      let resolvedLogoUrl = "";
      const rawLogo = String(companyRow.logo_url || "").trim();

      if (rawLogo) {
        if (/^https?:\/\//i.test(rawLogo)) {
          resolvedLogoUrl = rawLogo;
        } else {
          const cleanedPath = rawLogo
            .replace(/^company-logos\//, "")
            .replace(/^\/+/, "");

          const { data: signedLogo } = await supabase.storage
            .from("company-logos")
            .createSignedUrl(cleanedPath, 60 * 60);

          resolvedLogoUrl = signedLogo?.signedUrl || "";
        }
      }

      setCompanyMeta({
        name: companyRow.name || companyMeta.name || "Company",
        address: companyRow.address || "",
        phone: companyRow.phone || "",
        email: companyRow.email || "",
        logo_url: resolvedLogoUrl,
      });
    }
  };

  const loadStatement = async () => {
    if (!companyId) return;

    setLoading(true);
    try {
      const result = await fetchSupplierStockStatement({
        companyId,
        supplierId: supplierId === "all" ? null : supplierId,
        branchId: branchId === "all" ? null : branchId,
        productId: productId === "all" ? null : productId,
        startDate: startDate || null,
        endDate: endDate || null,
      });

      setRows(result.rows);
      setSummary(result.summary);
    } catch (e: any) {
      toast({
        title: "Load failed",
        description: e?.message || "Could not load stock statement.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await loadSetup();
      } catch (e: any) {
        toast({
          title: "Setup failed",
          description: e?.message || "Could not load stock statement setup.",
          variant: "destructive",
        });
      }
    })();
  }, [companyId, activeBranchId]);

  useEffect(() => {
    void loadStatement();
  }, [companyId, supplierId, branchId, productId, startDate, endDate]);

  const handleExportPdf = () => {
    const generatedBy = profile?.full_name || profile?.email || "System";
    const watermarkText = (
      companyMeta?.name ||
      profile?.company_name ||
      "WEMAH SYSTEM"
    ).toUpperCase();

    const summaryCardsHtml = [
      buildSummaryCardHtml("Receipt Lines", `${summary.totalLines}`),
      buildSummaryCardHtml("Total Quantity", `${summary.totalQuantity}`),
      buildSummaryCardHtml("Total Stock Value", `GHS ${money(summary.totalValue)}`),
      buildSummaryCardHtml("Average Unit Cost", `GHS ${money(summary.avgUnitCost)}`),
    ].join("");

    const baseTableHtml = buildTableHtml({
      headers: [
        { label: "Date" },
        { label: "Supplier" },
        { label: "Branch" },
        { label: "Invoice / Ref" },
        { label: "Product" },
        { label: "Quantity", right: true },
        { label: "Unit Cost", right: true },
        { label: "Discount", right: true },
        { label: "Line Total", right: true },
        { label: "Stock Status" },
      ],
      rows: rows.map((row) => [
        formatDisplayDate(row.purchase_date),
        row.supplier_name,
        row.branch_name || "Company-wide",
        row.invoice_number || row.reference_number || "-",
        row.product_name,
        `${row.quantity}`,
        `GHS ${money(row.unit_cost)}`,
        `GHS ${money(row.line_discount)}`,
        `GHS ${money(row.line_total)}`,
        row.stock_status || "-",
      ]),
    });

    const tableHtml = `
      <div style="position: relative;">
        <div
          style="
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            font-size: 56px;
            font-weight: 800;
            letter-spacing: 4px;
            color: rgba(15, 23, 42, 0.06);
            transform: rotate(-24deg);
            text-transform: uppercase;
            white-space: nowrap;
            z-index: 0;
          "
        >
          ${escapeHtml(watermarkText)}
        </div>

        <div style="position: relative; z-index: 1;">
          <div
            style="
              display: flex;
              justify-content: space-between;
              gap: 16px;
              margin: 0 0 14px 0;
              padding: 10px 12px;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              background: #f8fafc;
              font-size: 12px;
              color: #0f172a;
            "
          >
            <div><strong>Generated by:</strong> ${escapeHtml(generatedBy)}</div>
            <div><strong>Generated on:</strong> ${escapeHtml(
              formatDisplayDate(new Date().toISOString())
            )}</div>
          </div>

          <style>
            table { width: 100%; border-collapse: collapse; }
            thead th {
              background: #f8fafc !important;
            }
            tr {
              page-break-inside: avoid;
            }
          </style>

          ${baseTableHtml}

          <div
            style="
              margin-top: 12px;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              overflow: hidden;
            "
          >
            <table style="width: 100%; border-collapse: collapse;">
              <tbody>
                <tr>
                  <td style="padding: 10px 12px; font-weight: 700; background: #f8fafc;">Totals</td>
                  <td style="padding: 10px 12px; text-align: right; background: #f8fafc;">
                    <strong>Total Quantity:</strong> ${summary.totalQuantity}
                  </td>
                  <td style="padding: 10px 12px; text-align: right; background: #f8fafc;">
                    <strong>Total Value:</strong> GHS ${money(summary.totalValue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const ok = openPrintFriendlyPdf({
      meta: {
        title: "Supplier Stock Statement",
        supplierLabel,
        branchLabel,
        startDate,
        endDate,
        company: companyMeta,
      },
      summaryCardsHtml,
      tableHtml,
    });

    if (!ok) {
      toast({
        title: "Export blocked",
        description: "Allow popups for this site to open the PDF export window.",
        variant: "destructive",
      });
    }
  };

  const handleShareWhatsApp = () => {
    shareReportViaWhatsApp({
      meta: {
        title: "Supplier Stock Statement",
        supplierLabel,
        branchLabel,
        startDate,
        endDate,
        company: companyMeta,
      },
      summaryLines: [
        `Receipt Lines: ${summary.totalLines}`,
        `Total Quantity: ${summary.totalQuantity}`,
        `Total Stock Value: GHS ${money(summary.totalValue)}`,
        `Average Unit Cost: GHS ${money(summary.avgUnitCost)}`,
        `Generated By: ${profile?.full_name || "System"}`,
      ],
    });
  };

  const handleToday = () => {
    const t = todayString();
    setStartDate(t);
    setEndDate(t);
    setSupplierId("all");
    setBranchId("all");
    setProductId("all");
  };

  return (
    <div className="space-y-6 bg-slate-950 p-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Supplier Stock Statement
          </h1>
          <p className="text-slate-300">
            Review stock received from suppliers for the selected period.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleToday}
            className="border-slate-500 bg-slate-900 text-white hover:bg-slate-800"
          >
            Today
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="font-semibold">Export</Button>
            </DialogTrigger>
            <DialogContent className="border-slate-700 bg-slate-900 text-white">
              <DialogHeader>
                <DialogTitle>Export Stock Statement</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <Button onClick={handleExportPdf} className="w-full font-semibold">
                  Download / Save as PDF
                </Button>
                <Button
                  onClick={handleShareWhatsApp}
                  variant="outline"
                  className="w-full border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                >
                  Share via WhatsApp
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-slate-600 bg-slate-900 shadow-lg shadow-black/20">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label className="text-slate-200">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-white">
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
                <SelectContent className="border-slate-700 bg-slate-900 text-white">
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
              <Label className="text-slate-200">Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="border-slate-500 bg-slate-950 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-white">
                  <SelectItem value="all">All Products</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => void loadStatement()}
              variant="outline"
              className="border-slate-500 bg-slate-950 text-white hover:bg-slate-800"
            >
              Refresh Statement
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-600 bg-slate-900 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Receipt Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{summary.totalLines}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-600 bg-slate-900 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Total Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-cyan-300">{summary.totalQuantity}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-600 bg-slate-900 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Total Stock Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-300">
              GHS {money(summary.totalValue)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-600 bg-slate-900 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Average Unit Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-300">
              GHS {money(summary.avgUnitCost)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-600 bg-slate-900 shadow-lg shadow-black/20">
        <CardHeader>
          <CardTitle className="text-xl text-white">
            Stock Receipt Transactions {loading ? "• Loading..." : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/70">
            <SupplierStockStatementTable
              rows={rows}
              totalQuantity={summary.totalQuantity}
              totalValue={summary.totalValue}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}