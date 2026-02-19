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
import { Download, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Row = {
  date: string; // YYYY-MM-DD
  product_id: string;
  product_name: string;
  sku: string;
  qty_sold: number;
  revenue: number;
};

type CompanyMini = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
};

type BranchMini = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

function escapeHtml(str: string) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function DailySalesReport() {
  const { toast } = useToast();
  const { profile, activeBranchId } = useAuth() as any;

  const [loading, setLoading] = useState(true);

  // ✅ Date range (yyyy-mm-dd)
  const [dateFrom, setDateFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [rows, setRows] = useState<Row[]>([]);

  // ✅ Branding info
  const [company, setCompany] = useState<CompanyMini | null>(null);
  const [branch, setBranch] = useState<BranchMini | null>(null);

  // ----------------------------
  // Helpers
  // ----------------------------
  const toStartISO = (d: string) => `${d}T00:00:00.000Z`;
  const toEndISO = (d: string) => `${d}T23:59:59.999Z`;

  const formatContactLine = (c?: {
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    tax_id?: string | null;
  }) => {
    const parts = [
      c?.address?.trim() ? c.address.trim() : null,
      c?.phone?.trim() ? `Tel: ${c.phone.trim()}` : null,
      c?.email?.trim() ? c.email.trim() : null,
      c?.tax_id?.trim() ? `Tax ID: ${c.tax_id.trim()}` : null,
    ].filter(Boolean) as string[];
    return parts.length ? parts.join(' • ') : '—';
  };

  const companyId = (profile as any)?.company_id ?? null;
  const branchId = activeBranchId ?? (profile as any)?.branch_id ?? null;

  // ----------------------------
  // Load company + branch
  // ----------------------------
  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      setBranch(null);
      return;
    }

    (async () => {
      try {
        const { data: cData, error: cErr } = await (supabase as any)
          .from('companies')
          .select('id,name,address,phone,email,tax_id')
          .eq('id', companyId)
          .maybeSingle();

        if (cErr) throw cErr;
        setCompany((cData as CompanyMini) || null);
      } catch {
        setCompany(null);
      }

      if (!branchId) {
        setBranch(null);
        return;
      }

      try {
        const { data: bData, error: bErr } = await (supabase as any)
          .from('branches')
          .select('id,name,address,phone,email')
          .eq('id', branchId)
          .maybeSingle();

        if (bErr) throw bErr;
        setBranch((bData as BranchMini) || null);
      } catch {
        setBranch(null);
      }
    })();
  }, [companyId, branchId]);

  // ----------------------------
  // Fetch report data (✅ branch-filtered)
  // ----------------------------
  const fetchReport = async () => {
    // ✅ guard: branch required
    if (!branchId) {
      setRows([]);
      setLoading(false);
      toast({
        title: 'Branch not set',
        description: 'No branch is selected for this user. Please contact admin.',
        variant: 'destructive',
      });
      return;
    }

    // ✅ guard: dates must exist
    if (!dateFrom || !dateTo) {
      setRows([]);
      setLoading(false);
      toast({
        title: 'Pick a date range',
        description: 'Please select both From and To dates.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select(
          `
          id,
          product_id,
          quantity,
          unit_price,
          sale:sales!inner(id, created_at, status, branch_id),
          product:products(id, name, sku)
        `
        )
        .eq('sale.branch_id', branchId) // ✅ FIX: only this branch
        .gte('sale.created_at', toStartISO(dateFrom))
        .lte('sale.created_at', toEndISO(dateTo));

      if (error) throw error;

      const items = (data || []) as any[];

      // don’t count “returned” receipts as sales
      const filtered = items.filter((it) => it?.sale?.status !== 'returned');

      const map = new Map<string, Row>();

      for (const it of filtered) {
        const createdAt = it?.sale?.created_at;
        const date = createdAt ? String(createdAt).slice(0, 10) : 'Unknown';

        const productId = it?.product_id || it?.product?.id || 'unknown';
        const productName = it?.product?.name || 'Unknown';
        const sku = it?.product?.sku || '';

        const qty = Number(it?.quantity || 0);
        const unitPrice = Number(it?.unit_price || 0);
        const revenue = qty * unitPrice;

        const key = `${date}__${productId}`;

        if (!map.has(key)) {
          map.set(key, {
            date,
            product_id: productId,
            product_name: productName,
            sku,
            qty_sold: 0,
            revenue: 0,
          });
        }

        const row = map.get(key)!;
        row.qty_sold += qty;
        row.revenue += revenue;
      }

      const aggregated = Array.from(map.values()).sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.product_name.localeCompare(b.product_name);
      });

      setRows(aggregated);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to load daily sales report',
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
  }, [dateFrom, dateTo, branchId]);

  const totals = useMemo(() => {
    const totalQty = rows.reduce((s, r) => s + (r.qty_sold || 0), 0);
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    return { totalQty, totalRevenue };
  }, [rows]);

  // ----------------------------
  // Export CSV
  // ----------------------------
  const exportCSV = () => {
    if (!rows.length) {
      toast({ title: 'Nothing to export', description: 'No rows match your filters.' });
      return;
    }

    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['date', 'product_name', 'sku', 'qty_sold', 'revenue'];

    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const val = h === 'revenue' ? Number(r.revenue || 0).toFixed(2) : (r as any)[h];
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
    a.download = `daily-sales-${dateFrom}_to_${dateTo}-${stamp}.csv`;
    a.click();

    URL.revokeObjectURL(url);

    toast({ title: 'Export complete', description: 'Daily sales CSV downloaded.' });
  };

  // ----------------------------
  // Export PDF (BRANDED)
  // ----------------------------
  const exportPDF = () => {
    if (!rows.length) {
      toast({ title: 'Nothing to export', description: 'No rows match your filters.' });
      return;
    }

    const title = `Daily Sales Report`;
    const range = `${dateFrom} to ${dateTo}`;
    const now = new Date().toLocaleString();

    const companyName = company?.name?.trim() || 'Company';
    const branchName = branch?.name?.trim() || '';
    const branchLine = branchName ? `Branch: ${branchName}` : '';

    const contactLine =
      branch && (branch.address || branch.phone || branch.email)
        ? formatContactLine({
            address: branch.address,
            phone: branch.phone,
            email: branch.email,
          })
        : formatContactLine(company);

    const tableRows = rows
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.date)}</td>
          <td>${escapeHtml(r.product_name)}</td>
          <td>${escapeHtml(r.sku || '-')}</td>
          <td style="text-align:right;">${Number(r.qty_sold || 0).toLocaleString()}</td>
          <td style="text-align:right;">${money(r.revenue)}</td>
        </tr>
      `
      )
      .join('');

    const html = `
      <html>
        <head>
          <title>${escapeHtml(title)} (${escapeHtml(range)})</title>
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
              display:flex; gap: 18px; justify-content: space-between; align-items: flex-end;
            }
            .sigWrap { display:flex; gap: 18px; flex: 1; }
            .sig { flex: 1; }
            .sigLine { border-top: 1px solid #111; margin-top: 32px; padding-top: 6px; font-size: 12px; }
            .powered { font-size: 11px; color: var(--muted); white-space: nowrap; }

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
                <div class="brand">${escapeHtml(companyName)}</div>
                <div class="sub">
                  ${escapeHtml(title)} • ${escapeHtml(range)}<br/>
                  ${branchLine ? `${escapeHtml(branchLine)}<br/>` : ''}
                  ${escapeHtml(contactLine)}
                </div>
              </div>
              <div class="meta">
                <div><b>Generated:</b> ${escapeHtml(now)}</div>
                <div><b>Currency:</b> GHS</div>
              </div>
            </div>

            <div class="totals">
              <div><b>Total Qty Sold:</b> ${Number(totals.totalQty).toLocaleString()}</div>
              <div><b>Total Revenue:</b> ${money(totals.totalRevenue)}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th style="text-align:right;">Qty Sold</th>
                  <th style="text-align:right;">Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div class="footer">
              <div class="sigWrap">
                <div class="sig">
                  <div class="sigLine">Prepared By (Name & Signature)</div>
                </div>
                <div class="sig">
                  <div class="sigLine">Approved By (Name & Signature)</div>
                </div>
              </div>
              <div class="powered">Powered by Philuz Appz</div>
            </div>

            <div class="note">
              Note: “Returned” receipts are excluded from this report.
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
          <h1 className="text-2xl font-bold text-white">Daily Sales Report</h1>
          <p className="text-slate-400">Total quantity sold per item per day (with revenue)</p>
          <p className="text-slate-500 text-sm">
            Company: <b className="text-slate-200">{company?.name || '—'}</b>
            {branch?.name ? (
              <>
                {' '}
                • Branch: <b className="text-slate-200">{branch.name}</b>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchReport} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={exportPDF} disabled={!rows.length}>
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
        <CardContent className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <div className="w-full sm:w-60">
            <Label className="text-slate-300">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
          <div className="w-full sm:w-60">
            <Label className="text-slate-300">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                setDateFrom(today);
                setDateTo(today);
              }}
            >
              Today
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // ✅ FIX: do NOT set empty (breaks ISO filters)
                const today = new Date().toISOString().slice(0, 10);
                setDateFrom(today);
                setDateTo(today);
              }}
            >
              Reset
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
              Total Qty: {totals.totalQty.toLocaleString()} • Total Revenue: {money(totals.totalRevenue)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Date</TableHead>
                <TableHead className="text-slate-400">Product</TableHead>
                <TableHead className="text-slate-400">SKU</TableHead>
                <TableHead className="text-slate-400 text-right">Qty Sold</TableHead>
                <TableHead className="text-slate-400 text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.date}-${r.product_id}`} className="border-slate-700">
                  <TableCell className="text-slate-300">{r.date}</TableCell>
                  <TableCell className="text-white font-medium">{r.product_name}</TableCell>
                  <TableCell className="text-slate-300">{r.sku || '-'}</TableCell>
                  <TableCell className="text-slate-300 text-right">
                    {Number(r.qty_sold || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-slate-300 text-right">{money(r.revenue)}</TableCell>
                </TableRow>
              ))}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-10">
                    {loading ? 'Loading...' : 'No sales found for the selected date range.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <p className="text-xs text-slate-500 mt-3">
            Note: “Returned” receipts are excluded from this report.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
