import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Printer, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

type SaleStatus = 'pending' | 'picking' | 'completed' | 'returned';

type CouponRow = {
  coupon_id: string;
  sale_id: string;

  receipt_number: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;

  status: SaleStatus;

  issued_at: string | null;
  revoked_at: string | null;

  printed_at: string | null;
  printed_by: string | null;
  print_count: number | null;
};

type ReceiptItem = {
  name: string;
  sku: string | null;
  qty: number;
  unit_price: number;
};

type ReceiptData = {
  receipt_number: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  cashier_name: string;
  items: ReceiptItem[];
  total_amount: number;
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

// Ghana day range (Accra)
function getAccraDayRangeISO(date = new Date()) {
  const tz = 'Africa/Accra';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = Number(parts.find((p) => p.type === 'year')?.value || '1970');
  const m = Number(parts.find((p) => p.type === 'month')?.value || '01');
  const d = Number(parts.find((p) => p.type === 'day')?.value || '01');

  // Accra is UTC+0, safe as UTC bounds
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));

  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function statusBadge(s: SaleStatus) {
  if (s === 'pending') return <Badge className="bg-yellow-500">pending</Badge>;
  if (s === 'picking') return <Badge className="bg-blue-500">picking</Badge>;
  if (s === 'completed') return <Badge className="bg-green-500">completed</Badge>;
  return <Badge className="bg-slate-500">returned</Badge>;
}

// ✅ escape hatch for new RPCs not included in generated Supabase TS types
async function rpcAny<T = any>(fn: string, args?: Record<string, any>) {
  return (supabase as any).rpc(fn, args) as Promise<{ data: T; error: any }>;
}

// ✅ Print without popup: hidden iframe printing
function printHtmlViaIframe(html: string, onAfter?: () => void) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    onAfter?.();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const w = iframe.contentWindow;

  const cleanup = () => {
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // ignore
      }
      onAfter?.();
    }, 500);
  };

  iframe.onload = () => {
    setTimeout(() => {
      try {
        w?.focus();
        w?.print();
      } finally {
        cleanup();
      }
    }, 200);
  };

  setTimeout(() => {
    try {
      w?.focus();
      w?.print();
    } finally {
      cleanup();
    }
  }, 450);
}

export default function POSCoupons() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const location = useLocation();

  const [tab, setTab] = useState<'unprinted' | 'printed'>('unprinted');
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // status-only dialog for printed coupons
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusRow, setStatusRow] = useState<CouponRow | null>(null);

  const { startISO, endISO } = useMemo(() => getAccraDayRangeISO(new Date()), []);

  // highlight support
  const highlightCouponId = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return qs.get('highlight') || '';
  }, [location.search]);

  const highlightSaleId = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return qs.get('highlightSale') || '';
  }, [location.search]);

  const didAutoScroll = useRef(false);

  const fetchCoupons = async () => {
    if (!user) return;

    setLoading(true);
    try {
      /**
       * ✅ Correct source of truth for "today":
       * use sales.created_at (NOT sale_coupons.created_at)
       *
       * We pull coupons from sale_coupons (active only), join the sale row,
       * and filter for:
       * - this cashier
       * - today range
       */
      const { data, error } = await supabase
        .from('sale_coupons' as any)
        .select(
          `
            id,
            sale_id,
            issued_at,
            revoked_at,
            printed_at,
            printed_by,
            print_count,
            sales:sales!inner (
              id,
              receipt_number,
              created_at,
              customer_name,
              customer_phone,
              status,
              cashier_id
            )
          `
        )
        .is('revoked_at', null)
        .eq('sales.cashier_id', user.id)
        .gte('sales.created_at', startISO)
        .lt('sales.created_at', endISO)
        .order('issued_at', { ascending: false });

      if (error) throw error;

      const list: CouponRow[] = (data || []).map((r: any) => {
        const s = r?.sales;
        return {
          coupon_id: r.id,
          sale_id: r.sale_id,

          receipt_number: s?.receipt_number ?? '',
          created_at: s?.created_at ?? new Date().toISOString(),
          customer_name: s?.customer_name ?? null,
          customer_phone: s?.customer_phone ?? null,

          status: (s?.status ?? 'pending') as SaleStatus,

          issued_at: r?.issued_at ?? null,
          revoked_at: r?.revoked_at ?? null,

          printed_at: r?.printed_at ?? null,
          printed_by: r?.printed_by ?? null,
          print_count: r?.print_count ?? null,
        };
      });

      setRows(list);

      // ✅ If we came here due to failure, auto-switch tab to where the highlighted row belongs
      const target = list.find(
        (x) =>
          (highlightCouponId && x.coupon_id === highlightCouponId) ||
          (highlightSaleId && x.sale_id === highlightSaleId)
      );
      if (target) {
        setTab(target.printed_at ? 'printed' : 'unprinted');
      }
    } catch (e: any) {
      toast({
        title: 'Failed to load coupons',
        description: e?.message || 'Could not load coupons',
        variant: 'destructive',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // realtime refresh
  useEffect(() => {
    if (!user) return;

    const ch = supabase
      .channel('pos-coupons-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_coupons' }, () =>
        fetchCoupons()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () =>
        fetchCoupons()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    // ✅ YOUR RULE:
    // - Unprinted tab: printed_at is null
    // - Printed tab: printed_at is not null (show status for warehouse)
    const base =
      tab === 'unprinted' ? rows.filter((r) => !r.printed_at) : rows.filter((r) => !!r.printed_at);

    if (!s) return base;

    return base.filter((r) => {
      const receipt = (r.receipt_number || '').toLowerCase();
      const name = (r.customer_name || '').toLowerCase();
      const phone = (r.customer_phone || '').toLowerCase();
      return receipt.includes(s) || name.includes(s) || phone.includes(s);
    });
  }, [rows, tab, search]);

  // auto highlight + scroll once after load AND after filtered list is ready
  useEffect(() => {
    if (didAutoScroll.current) return;
    if (loading) return;

    const targetId = highlightCouponId || '';
    const targetSale = highlightSaleId || '';
    if (!targetId && !targetSale) return;

    const exists = filtered.some(
      (r) =>
        (targetId && r.coupon_id === targetId) || (targetSale && r.sale_id === targetSale)
    );
    if (!exists) return;

    const el =
      (targetId && document.getElementById(`coupon-${targetId}`)) ||
      (targetSale && document.getElementById(`sale-${targetSale}`));

    if (el) {
      didAutoScroll.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading, filtered, highlightCouponId, highlightSaleId]);

  const fetchReceiptData = async (saleId: string): Promise<ReceiptData | null> => {
    try {
      const saleRes = await supabase.from('sales').select('*').eq('id', saleId).single();
      if (saleRes.error) throw saleRes.error;
      const sale = saleRes.data;

      const itemsRes = await supabase
        .from('sale_items')
        .select('quantity, unit_price, product:products(name, sku)')
        .eq('sale_id', saleId);

      if (itemsRes.error) throw itemsRes.error;

      const items: ReceiptItem[] = (itemsRes.data || []).map((r: any) => ({
        name: r?.product?.name || 'Unknown',
        sku: r?.product?.sku ?? null,
        qty: Number(r?.quantity || 0),
        unit_price: Number(r?.unit_price || 0),
      }));

      let cashierName = profile?.full_name || 'Cashier';
      if (!profile?.full_name && sale.cashier_id) {
        const cashierRes = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', sale.cashier_id)
          .maybeSingle();
        if (!cashierRes.error && cashierRes.data?.full_name) cashierName = cashierRes.data.full_name;
      }

      return {
        receipt_number: sale.receipt_number,
        created_at: sale.created_at,
        customer_name: sale.customer_name,
        customer_phone: sale.customer_phone,
        cashier_name: cashierName,
        items,
        total_amount: Number(sale.total_amount || 0),
      };
    } catch (e: any) {
      toast({
        title: 'Receipt load failed',
        description: e?.message || 'Could not load receipt details.',
        variant: 'destructive',
      });
      return null;
    }
  };

  const buildPrintHtml = (data: ReceiptData, saleId: string) => {
    const brand = 'Philuz Appz';
    const receiptNumber = escapeHtml(data.receipt_number);
    const now = new Date(data.created_at || Date.now()).toLocaleString();
    const totalPaid = money(data.total_amount);

    const customerLine =
      (data.customer_name ? escapeHtml(data.customer_name) : 'Walk-in') +
      (data.customer_phone ? ` • ${escapeHtml(data.customer_phone)}` : '');

    const rowsHtml = data.items
      .map((it) => {
        const lineTotal = it.qty * it.unit_price;
        return `
          <tr>
            <td>
              <div class="pname">${escapeHtml(it.name)}</div>
              <div class="psku">${it.sku ? `SKU: ${escapeHtml(it.sku)}` : ''}</div>
            </td>
            <td class="r">${it.qty}</td>
            <td class="r">${money(it.unit_price)}</td>
            <td class="r">${money(lineTotal)}</td>
          </tr>
        `;
      })
      .join('');

    const customerSalesCopy = `
      <div class="paper">
        <div class="brand">${brand}</div>
        <div class="sub">Sales Receipt</div>
        <div class="copyTitle">CUSTOMER COPY (NO ITEMS)</div>
        <div class="dash"></div>

        <div class="meta">
          <div><b>Receipt:</b> ${receiptNumber}</div>
          <div><b>Date:</b> ${escapeHtml(now)}</div>
          <div><b>Customer:</b> ${customerLine}</div>
          <div><b>Cashier:</b> ${escapeHtml(data.cashier_name)}</div>
        </div>

        <div class="dash"></div>

        <table>
          <tbody>
            <tr class="totalRow">
              <td>TOTAL PAID</td>
              <td class="r">GHS ${totalPaid}</td>
            </tr>
          </tbody>
        </table>

        <div class="dash"></div>

        <div class="sigWrap">
          <div class="sigLine">Cashier Signature</div>
          <div class="sigLine">Customer Signature</div>
        </div>

        <div class="note muted">Keep this as your payment proof.</div>
        <div class="tiny muted">${escapeHtml(saleId)}</div>
      </div>
      <div class="pageBreak"></div>
    `;

    const cashierSalesCopy = `
      <div class="paper">
        <div class="brand">${brand}</div>
        <div class="sub">Sales Receipt</div>
        <div class="copyTitle">CASHIER COPY (FULL)</div>
        <div class="dash"></div>

        <div class="meta">
          <div><b>Receipt:</b> ${receiptNumber}</div>
          <div><b>Date:</b> ${escapeHtml(now)}</div>
          <div><b>Customer:</b> ${customerLine}</div>
          <div><b>Cashier:</b> ${escapeHtml(data.cashier_name)}</div>
        </div>

        <div class="dash"></div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="r">Qty</th>
              <th class="r">Price</th>
              <th class="r">Total</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="dash"></div>

        <table>
          <tbody>
            <tr class="totalRow">
              <td colspan="3">TOTAL</td>
              <td class="r">GHS ${totalPaid}</td>
            </tr>
          </tbody>
        </table>

        <div class="dash"></div>

        <div class="sigWrap">
          <div class="sigLine">Cashier Signature</div>
          <div class="sigLine">Customer Signature</div>
        </div>

        <div class="note muted">Internal copy for records.</div>
        <div class="tiny muted">${escapeHtml(saleId)}</div>
      </div>
      <div class="pageBreak"></div>
    `;

    const warehouseCoupon = (label: string) => `
      <div class="paper">
        <div class="brand">${brand}</div>
        <div class="sub">Warehouse Pickup Coupon</div>
        <div class="copyTitle">${escapeHtml(label)}</div>
        <div class="dash"></div>

        <div class="meta">
          <div><b>Receipt:</b> ${receiptNumber}</div>
          <div><b>Date:</b> ${escapeHtml(now)}</div>
          <div><b>Customer:</b> ${customerLine}</div>
          <div><b>Cashier:</b> ${escapeHtml(data.cashier_name)}</div>
        </div>

        <div class="dash"></div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="r">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.items.length
                ? data.items
                    .map(
                      (it) => `
                      <tr>
                        <td>
                          <div class="pname">${escapeHtml(it.name)}</div>
                          <div class="psku">${it.sku ? `SKU: ${escapeHtml(it.sku)}` : ''}</div>
                        </td>
                        <td class="r">${it.qty}</td>
                      </tr>
                    `
                    )
                    .join('')
                : `<tr><td colspan="2" style="padding:10px 0; color:#555;">No items.</td></tr>`
            }
          </tbody>
        </table>

        <div class="dash"></div>
        <div class="note"><b>Present this coupon at the warehouse</b></div>

        <div class="sigWrap">
          <div class="sigLine">Warehouse Staff Signature</div>
          <div class="sigLine">Customer Signature</div>
        </div>

        <div class="tiny muted">${escapeHtml(saleId)}</div>
      </div>
      <div class="pageBreak"></div>
    `;

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt ${receiptNumber}</title>
          <style>
            :root { --text:#111; --muted:#555; --line:#000; }
            * { box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              color: var(--text);
              margin: 0;
              padding: 0;
              background: #fff;
              display: flex;
              justify-content: center;
            }
            .paper { width: 340px; max-width: 340px; padding: 16px 8px; }
            .brand { text-align:center; font-weight: 800; font-size: 18px; }
            .sub { text-align:center; font-size: 12px; color: var(--muted); margin-top: 2px; }
            .copyTitle { text-align:center; font-size: 12px; font-weight: 800; margin-top: 6px; }
            .meta { font-size: 12px; margin-top: 10px; }
            .meta div { margin: 3px 0; }
            .dash { border-bottom: 1px dashed var(--line); margin: 10px 0; }

            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 6px 0; vertical-align: top; }
            th { text-align:left; border-bottom: 1px solid #ddd; }
            .r { text-align:right; white-space: nowrap; }
            .pname { font-weight: 600; }
            .psku { font-size: 11px; color: var(--muted); margin-top: 1px; }
            .totalRow { font-weight: 900; font-size: 13px; }
            .note { text-align:center; font-size: 12px; margin-top: 10px; }
            .muted { color: var(--muted); }
            .sigWrap { margin-top: 14px; font-size: 12px; }
            .sigLine { border-top: 1px solid #111; margin-top: 22px; padding-top: 5px; }
            .tiny { margin-top: 10px; text-align:center; font-size: 10px; }
            .pageBreak { page-break-after: always; }

            @media print {
              @page { size: A4; margin: 12mm; }
              body { display:block; }
              .paper { margin: 0 auto; }
            }
          </style>
        </head>
        <body>
          <div>
            ${customerSalesCopy}
            ${cashierSalesCopy}
            ${warehouseCoupon('WAREHOUSE COUPON — COPY 1')}
            ${warehouseCoupon('WAREHOUSE COUPON — COPY 2')}
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintUnprinted = async (r: CouponRow) => {
    try {
      const data = await fetchReceiptData(r.sale_id);
      if (!data) return;

      const html = buildPrintHtml(data, r.sale_id);

      printHtmlViaIframe(html, async () => {
        const { error } = await rpcAny('mark_coupon_printed', { p_coupon_id: r.coupon_id });
        if (error) {
          toast({
            title: 'Printed but not recorded',
            description: error.message,
            variant: 'destructive',
          });
        }
        await fetchCoupons();
      });

      toast({ title: 'Print started', description: `Printing ${r.receipt_number}` });
    } catch (e: any) {
      toast({
        title: 'Print failed',
        description: e?.message || 'Could not print coupon',
        variant: 'destructive',
      });
    }
  };

  const openStatusOnly = async (r: CouponRow) => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id, receipt_number, created_at, customer_name, customer_phone, status')
        .eq('id', r.sale_id)
        .maybeSingle();

      if (error) throw error;

      setStatusRow({
        ...r,
        receipt_number: data?.receipt_number ?? r.receipt_number,
        created_at: data?.created_at ?? r.created_at,
        customer_name: data?.customer_name ?? r.customer_name,
        customer_phone: data?.customer_phone ?? r.customer_phone,
        status: ((data?.status ?? r.status) as SaleStatus) || r.status,
      });
      setStatusOpen(true);
    } catch {
      setStatusRow(r);
      setStatusOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">POS Coupons (Today)</h1>
          <p className="text-slate-400">
            Shows <b>today only</b>. Unprinted coupons can be printed here if power/network failed earlier.
          </p>
        </div>

        <Button variant="outline" onClick={fetchCoupons} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={tab === 'unprinted' ? 'default' : 'outline'}
          onClick={() => setTab('unprinted')}
        >
          Unprinted
        </Button>
        <Button
          variant={tab === 'printed' ? 'default' : 'outline'}
          onClick={() => setTab('printed')}
        >
          Printed
        </Button>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Receipt number, customer name, phone…"
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">
            {tab === 'unprinted' ? 'Unprinted Coupons' : 'Printed Coupons'} ({filtered.length})
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-400">No coupons found.</div>
          ) : (
            filtered.map((r) => {
              const isHighlighted =
                (highlightCouponId && r.coupon_id === highlightCouponId) ||
                (highlightSaleId && r.sale_id === highlightSaleId);

              return (
                <div
                  key={r.coupon_id}
                  id={`coupon-${r.coupon_id}`}
                  className={[
                    'rounded-md border bg-slate-900/40 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition',
                    isHighlighted
                      ? 'border-primary ring-2 ring-primary/40 animate-pulse'
                      : 'border-slate-700',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-white font-semibold truncate">{r.receipt_number}</div>
                      {statusBadge(r.status)}
                      {r.printed_at ? (
                        <Badge className="bg-slate-700">printed</Badge>
                      ) : (
                        <Badge className="bg-red-600">unprinted</Badge>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(r.created_at).toLocaleString()} • {r.customer_name || '—'} •{' '}
                      {r.customer_phone || '—'}
                    </div>

                    {isHighlighted && (
                      <div className="text-xs text-primary mt-1 font-semibold">
                        This is the coupon that needs attention.
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {!r.printed_at ? (
                      <Button onClick={() => handlePrintUnprinted(r)}>
                        <Printer className="h-4 w-4 mr-2" />
                        Print Now
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => openStatusOnly(r)}>
                        View Status
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Coupon Status</DialogTitle>
          </DialogHeader>

          {statusRow ? (
            <div className="space-y-2 text-sm">
              <div className="text-slate-300">
                <span className="text-slate-400">Receipt:</span>{' '}
                <b className="text-white">{statusRow.receipt_number}</b>
              </div>
              <div className="text-slate-300">
                <span className="text-slate-400">Customer:</span>{' '}
                {statusRow.customer_name || '—'} • {statusRow.customer_phone || '—'}
              </div>
              <div className="text-slate-300">
                <span className="text-slate-400">Warehouse Status:</span>{' '}
                {statusBadge(statusRow.status)}
              </div>
              <div className="text-slate-300">
                <span className="text-slate-400">Printed At:</span>{' '}
                {statusRow.printed_at ? new Date(statusRow.printed_at).toLocaleString() : '—'}
              </div>
              <div className="text-xs text-slate-500 pt-2">
                Printed coupons cannot be reprinted here. If customer loses coupon, use the “reissue”
                flow (we’ll implement next).
              </div>
            </div>
          ) : (
            <div className="text-slate-400">No data.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
