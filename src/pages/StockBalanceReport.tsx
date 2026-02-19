import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Download, FileText, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type ProductRow = {
  product_id: string;
  name: string;
  sku: string;
  unit?: string | null;
  current_stock: number;

  // calculated
  balance_as_at: number;

  // for transparency (export + audit)
  sales_after: number; // qty sold after date (reduces stock going forward, so added back)
  receipts_after: number; // qty received after date (increases stock going forward, so subtracted)
  returns_after: number; // qty returned/approved after date (increases stock going forward, so subtracted)
};

type CompanyMini = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  receipt_footer: string | null;
  logo_url: string | null;
};

type BranchMini = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

function clean(s?: string | null) {
  const v = (s ?? '').trim();
  return v ? v : '';
}

function buildContactLine(parts: Array<string | null | undefined>) {
  return parts
    .map((p) => clean(p))
    .filter(Boolean)
    .join(' • ');
}

export default function StockBalanceReport() {
  const { toast } = useToast();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);

  // ✅ single day "as at" filter (yyyy-mm-dd)
  const [asAtDate, setAsAtDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProductRow[]>([]);

  // ✅ Company + Branch (for PDF header)
  const [company, setCompany] = useState<CompanyMini | null>(null);
  const [branch, setBranch] = useState<BranchMini | null>(null);

  const endOfDayISO = (d: string) => `${d}T23:59:59.999Z`;

  // Load company
  useEffect(() => {
    const companyId = (profile as any)?.company_id ?? null;
    if (!companyId) {
      setCompany(null);
      return;
    }

    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('companies')
          .select('id,name,address,phone,email,tax_id,receipt_footer,logo_url')
          .eq('id', companyId)
          .maybeSingle();

        if (error) throw error;
        setCompany((data as CompanyMini) || null);
      } catch {
        setCompany(null);
      }
    })();
  }, [(profile as any)?.company_id]);

  // Load branch (staff branch)
  useEffect(() => {
    const branchId = (profile as any)?.branch_id ?? null;
    if (!branchId) {
      setBranch(null);
      return;
    }

    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('branches')
          .select('id,name,address,phone,email')
          .eq('id', branchId)
          .maybeSingle();

        if (error) throw error;
        setBranch((data as BranchMini) || null);
      } catch {
        setBranch(null);
      }
    })();
  }, [(profile as any)?.branch_id]);

  const fetchReport = async () => {
    setLoading(true);

    try {
      // 1) Load products (current stock is the live quantity)
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name, sku, unit, quantity_in_stock')
        .order('name');

      if (productsError) throw productsError;

      const productList = (products || []) as any[];

      // Build base map
      const base = new Map<string, ProductRow>();
      productList.forEach((p) => {
        base.set(p.id, {
          product_id: p.id,
          name: p.name || 'Unknown',
          sku: p.sku || '',
          unit: p.unit ?? null,
          current_stock: Number(p.quantity_in_stock || 0),
          balance_as_at: Number(p.quantity_in_stock || 0),
          sales_after: 0,
          receipts_after: 0,
          returns_after: 0,
        });
      });

      const cutoff = endOfDayISO(asAtDate);

      // 2) Sales AFTER date (sale_items joined to sales)
      // We exclude sales with status='returned'
      const { data: soldAfter, error: soldAfterError } = await supabase
        .from('sale_items')
        .select(
          `
          product_id,
          quantity,
          sale:sales!inner(created_at, status)
        `
        )
        .gt('sale.created_at', cutoff);

      if (soldAfterError) throw soldAfterError;

      (soldAfter || []).forEach((r: any) => {
        if (r?.sale?.status === 'returned') return;
        const pid = r.product_id;
        const qty = Number(r.quantity || 0);
        const row = base.get(pid);
        if (row) row.sales_after += qty;
      });

      // 3) Stock receipts AFTER date
      const { data: receiptsAfter, error: receiptsAfterError } = await supabase
        .from('stock_receipts')
        .select('product_id, quantity, created_at')
        .gt('created_at', cutoff);

      if (receiptsAfterError) {
        toast({
          title: 'Warning',
          description:
            'Could not load stock receipts history. Stock balance will ignore receipts after date.',
          variant: 'destructive',
        });
      } else {
        (receiptsAfter || []).forEach((r: any) => {
          const pid = r.product_id;
          const qty = Number(r.quantity || 0);
          const row = base.get(pid);
          if (row) row.receipts_after += qty;
        });
      }

      // 4) Approved returns AFTER date
      const { data: returnsAfter, error: returnsAfterError } = await supabase
        .from('returns')
        .select(
          `
          id,
          quantity,
          approved_at,
          status,
          sale_item:sale_items(product_id)
        `
        )
        .eq('status', 'approved')
        .not('approved_at', 'is', null)
        .gt('approved_at', cutoff);

      if (returnsAfterError) throw returnsAfterError;

      (returnsAfter || []).forEach((r: any) => {
        const pid = r?.sale_item?.product_id;
        const qty = Number(r?.quantity || 0);
        if (!pid) return;
        const row = base.get(pid);
        if (row) row.returns_after += qty;
      });

      // 5) Compute balance_as_at
      const computed = Array.from(base.values()).map((r) => {
        // balance_as_at = current_stock + sales_after - receipts_after - approved_returns_after
        const balance =
          Number(r.current_stock || 0) +
          Number(r.sales_after || 0) -
          Number(r.receipts_after || 0) -
          Number(r.returns_after || 0);

        return {
          ...r,
          balance_as_at: balance < 0 ? 0 : balance,
        };
      });

      setRows(computed);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to load stock balance report',
        variant: 'destructive',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asAtDate]);

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      return r.name.toLowerCase().includes(s) || (r.sku || '').toLowerCase().includes(s);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const totalBalance = filteredRows.reduce((sum, r) => sum + Number(r.balance_as_at || 0), 0);
    return { totalBalance };
  }, [filteredRows]);

  // ----------------------------
  // Export CSV
  // ----------------------------
  const exportCSV = () => {
    if (!filteredRows.length) {
      toast({ title: 'Nothing to export', description: 'No rows match your filters.' });
      return;
    }

    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'as_at_date',
      'product_name',
      'sku',
      'unit',
      'balance_as_at',
      'current_stock',
      'sales_after_date',
      'receipts_after_date',
      'approved_returns_after_date',
    ];

    const csv = [
      headers.join(','),
      ...filteredRows.map((r) =>
        headers
          .map((h) => {
            const val =
              h === 'as_at_date'
                ? asAtDate
                : (r as any)[h
                    .replace('product_name', 'name')
                    .replace('balance_as_at', 'balance_as_at')
                    .replace('current_stock', 'current_stock')
                    .replace('sales_after_date', 'sales_after')
                    .replace('receipts_after_date', 'receipts_after')
                    .replace('approved_returns_after_date', 'returns_after')] ?? '';
            return esc(val);
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-balance-as-at-${asAtDate}-${stamp}.csv`;
    a.click();

    URL.revokeObjectURL(url);

    toast({ title: 'Export complete', description: 'Stock balance CSV downloaded.' });
  };

  // ----------------------------
  // ✅ Export PDF (BRANDED + Company/Branch header)
  // Print window → Save as PDF
  // ----------------------------
  const exportPDF = () => {
    if (!filteredRows.length) {
      toast({ title: 'Nothing to export', description: 'No rows match your filters.' });
      return;
    }

    const reportTitle = 'Stock Balance Report';
    const rangeLine = `As at ${asAtDate} (end of day)`;
    const now = new Date().toLocaleString();

    const companyName = company?.name?.trim() || 'Company';
    const branchName = branch?.name?.trim() || '';
    const branchLine = branchName ? `Branch: ${branchName}` : '';

    // ✅ contact line: staff sees branch contact first (fallback to company)
    const address =
      clean(branch?.address) || clean(company?.address) || '';
    const phone =
      clean(branch?.phone) || clean(company?.phone) || '';
    const email =
      clean(branch?.email) || clean(company?.email) || '';
    const taxId = clean(company?.tax_id) || '';

    const contactLine = buildContactLine([
      address || null,
      phone ? `Tel: ${phone}` : null,
      email || null,
      taxId ? `Tax ID: ${taxId}` : null,
    ]);

    const tableRows = filteredRows
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.sku || '-')}</td>
          <td>${escapeHtml(r.unit || '-')}</td>
          <td style="text-align:right;">${Number(r.balance_as_at || 0).toLocaleString()}</td>
          <td style="text-align:right;">${Number(r.current_stock || 0).toLocaleString()}</td>
          <td style="text-align:right;">${Number(r.sales_after || 0).toLocaleString()}</td>
          <td style="text-align:right;">${Number(r.receipts_after || 0).toLocaleString()}</td>
          <td style="text-align:right;">${Number(r.returns_after || 0).toLocaleString()}</td>
        </tr>
      `
      )
      .join('');

    const html = `
      <html>
        <head>
          <title>${escapeHtml(reportTitle)} - ${escapeHtml(rangeLine)}</title>
          <style>
            :root { --border:#e5e7eb; --muted:#6b7280; --text:#111827; }
            body { font-family: Arial, sans-serif; padding: 18px; color: var(--text); }
            .paper { max-width: 980px; margin: 0 auto; }
            .printBtn { margin-bottom: 12px; }

            .header {
              display:flex; justify-content:space-between; align-items:flex-start; gap:14px;
              border-bottom: 1px solid var(--border); padding-bottom: 10px;
            }
            .brand { font-weight: 900; font-size: 16px; }
            .company { font-weight: 800; font-size: 14px; margin-top: 2px; }
            .sub { font-size: 12px; color: var(--muted); margin-top: 3px; line-height: 1.35; }
            .meta { text-align:right; font-size: 12px; }
            .meta div { margin-bottom: 3px; }

            .totals {
              margin: 14px 0; padding: 10px; border: 1px solid var(--border);
              border-radius: 10px; display:flex; gap:12px; flex-wrap:wrap;
              font-size: 13px;
            }

            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid var(--border); padding: 8px; vertical-align: top; }
            th { background: #f9fafb; text-align: left; }

            .footer {
              margin-top: 18px; border-top: 1px solid var(--border); padding-top: 14px;
              display:flex; gap: 18px;
            }
            .sig { flex: 1; }
            .sigLine { border-top: 1px solid #111; margin-top: 32px; padding-top: 6px; font-size: 12px; }

            .note { margin-top: 10px; font-size: 12px; color: var(--muted); }

            @media print {
              .printBtn { display: none; }
              body { padding: 0; }
              .paper { max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="paper">
            <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

            <div class="header">
              <div>
                
                <div class="company">${escapeHtml(companyName)}</div>
                <div class="sub">${escapeHtml(reportTitle)} • ${escapeHtml(rangeLine)}</div>
                ${contactLine ? `<div class="sub">${escapeHtml(contactLine)}</div>` : ``}
                ${branchLine ? `<div class="sub">${escapeHtml(branchLine)}</div>` : ``}
              </div>
              <div class="meta">
                <div><b>Generated:</b> ${escapeHtml(now)}</div>
                <div><b>Items (filtered):</b> ${Number(filteredRows.length).toLocaleString()}</div>
              </div>
            </div>

            <div class="totals">
              <div><b>Total Balance (filtered view):</b> ${Number(totals.totalBalance).toLocaleString()}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Unit</th>
                  <th style="text-align:right;">Balance As At</th>
                  <th style="text-align:right;">Current Stock</th>
                  <th style="text-align:right;">Sales After</th>
                  <th style="text-align:right;">Receipts After</th>
                  <th style="text-align:right;">Returns After</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div class="footer">
              <div class="sig">
                <div class="sigLine">Prepared By (Name & Signature)</div>
              </div>
              <div class="sig">
                <div class="sigLine">Approved By (Name & Signature)</div>
              </div>
            </div>

            <div class="note">
              Balance As At is calculated from current stock by reversing movements after the selected date:
              <b>balance_as_at = current_stock + sales_after - receipts_after - approved_returns_after</b>.
            </div>
          </div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (!win) {
      toast({
        title: 'Popup blocked',
        description: 'Please allow popups to export PDF.',
        variant: 'destructive',
      });
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Balance Report</h1>
          <p className="text-slate-400">Total quantity remaining per item after a selected sales day</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchReport} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={!filteredRows.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={exportPDF} disabled={!filteredRows.length}>
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col lg:flex-row gap-4 lg:items-end">
          <div className="w-full sm:w-60">
            <Label className="text-slate-300">As at (end of day)</Label>
            <Input
              type="date"
              value={asAtDate}
              onChange={(e) => setAsAtDate(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search product or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAsAtDate(new Date().toISOString().slice(0, 10))}>
              Today
            </Button>
            <Button variant="outline" onClick={() => setSearch('')}>
              Clear Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            <span>Results</span>
            <span className="text-sm text-slate-400">
              Items: {filteredRows.length} • Total Balance: {Number(totals.totalBalance).toLocaleString()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Product</TableHead>
                <TableHead className="text-slate-400">SKU</TableHead>
                <TableHead className="text-slate-400">Unit</TableHead>
                <TableHead className="text-slate-400 text-right">Balance As At</TableHead>
                <TableHead className="text-slate-400 text-right">Current</TableHead>
                <TableHead className="text-slate-400 text-right">Sales After</TableHead>
                <TableHead className="text-slate-400 text-right">Receipts After</TableHead>
                <TableHead className="text-slate-400 text-right">Returns After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((r) => (
                  <TableRow key={r.product_id} className="border-slate-700">
                    <TableCell className="text-white font-medium">{r.name}</TableCell>
                    <TableCell className="text-slate-300">{r.sku || '-'}</TableCell>
                    <TableCell className="text-slate-300">{r.unit || '-'}</TableCell>
                    <TableCell className="text-slate-300 text-right">
                      {Number(r.balance_as_at || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      {Number(r.current_stock || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      {Number(r.sales_after || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      {Number(r.receipts_after || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-slate-300 text-right">
                      {Number(r.returns_after || 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}

              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-10">
                    {loading ? 'Loading...' : 'No products found for the selected filters.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <p className="text-xs text-slate-500 mt-3">
            Tip: This report is strongest when you have complete movement history (sales, receipts, and approved returns).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function escapeHtml(str: string) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
