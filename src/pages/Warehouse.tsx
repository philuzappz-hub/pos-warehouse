import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { SaleItem } from '@/types/database';
import {
  CheckCircle,
  ClipboardList,
  Clock,
  FileText,
  Package,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type SaleStatus = 'pending' | 'picking' | 'completed' | 'returned';

type PendingRow = {
  coupon_id: string;
  sale_id: string;
  receipt_number: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: SaleStatus;

  printed_at: string | null;
  received_at: string | null;
};

type PickingRow = PendingRow & {
  sale_items: (SaleItem & { product: { name: string; sku: string | null } })[];
};

function statusBadge(status: SaleStatus) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-yellow-500">pending</Badge>;
    case 'picking':
      return <Badge className="bg-blue-500">picking</Badge>;
    case 'completed':
      return <Badge className="bg-green-500">completed</Badge>;
    default:
      return <Badge className="bg-slate-500">{status}</Badge>;
  }
}

function yesNoBadge(ok: boolean, okText: string, badText: string) {
  return ok ? (
    <Badge className="bg-slate-700">{okText}</Badge>
  ) : (
    <Badge className="bg-red-600">{badText}</Badge>
  );
}

// ✅ escape hatch for new RPCs not included in generated Supabase TS types
async function rpcAny<T = any>(fn: string, args?: Record<string, any>) {
  return (supabase as any).rpc(fn, args) as Promise<{ data: T; error: any }>;
}

function upsertByCouponId(list: PendingRow[], row: PendingRow) {
  const idx = list.findIndex((x) => x.coupon_id === row.coupon_id);
  if (idx === -1) return [row, ...list];
  const next = [...list];
  next[idx] = row;
  return next;
}

export default function Warehouse() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'pending' | 'picking' | 'completed'>('pending');

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [pickingRows, setPickingRows] = useState<PickingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [receiveInput, setReceiveInput] = useState('');
  const [receiving, setReceiving] = useState(false);

  const [query, setQuery] = useState('');

  const mapCouponToPendingRow = (r: any): PendingRow | null => {
    const s = r?.sales;
    if (!s) return null;

    return {
      coupon_id: String(r.id),
      sale_id: String(r.sale_id),
      receipt_number: s?.receipt_number ?? '',
      created_at: s?.created_at ?? new Date().toISOString(),
      customer_name: s?.customer_name ?? null,
      customer_phone: s?.customer_phone ?? null,
      status: (s?.status ?? 'pending') as SaleStatus,
      printed_at: r?.printed_at ?? null,
      received_at: r?.received_at ?? null,
    };
  };

  const mapCouponToPickingRow = (r: any): PickingRow | null => {
    const s = r?.sales;
    if (!s) return null;

    return {
      coupon_id: String(r.id),
      sale_id: String(r.sale_id),
      receipt_number: s?.receipt_number ?? '',
      created_at: s?.created_at ?? new Date().toISOString(),
      customer_name: s?.customer_name ?? null,
      customer_phone: s?.customer_phone ?? null,
      status: (s?.status ?? 'picking') as SaleStatus,
      printed_at: r?.printed_at ?? null,
      received_at: r?.received_at ?? null,
      sale_items: (s?.sale_items || []) as any,
    };
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      if (filter === 'picking') {
        // ✅ Picking must be: active + received + printed + sale.status = picking
        const { data, error } = await supabase
          .from('sale_coupons' as any)
          .select(
            `
            id,
            sale_id,
            printed_at,
            received_at,
            revoked_at,
            sales:sales!inner (
              id,
              receipt_number,
              created_at,
              customer_name,
              customer_phone,
              status,
              sale_items (
                id,
                sale_id,
                product_id,
                quantity,
                unit_price,
                picked,
                picked_by,
                picked_at,
                product:products (name, sku)
              )
            )
          `
          )
          .is('revoked_at', null)
          .not('received_at', 'is', null)
          .not('printed_at', 'is', null)
          .eq('sales.status', 'picking')
          .order('received_at', { ascending: false });

        if (error) throw error;

        const list = (data || []).map(mapCouponToPickingRow).filter(Boolean) as PickingRow[];
        setPickingRows(list);
        setRows([]);
        return;
      }

      // ✅ Pending & Completed (Option A):
      // show ONLY received coupons, even if UNPRINTED (button disabled)
      const baseQuery = supabase
        .from('sale_coupons' as any)
        .select(
          `
          id,
          sale_id,
          printed_at,
          received_at,
          revoked_at,
          sales:sales!inner (
            id,
            receipt_number,
            created_at,
            customer_name,
            customer_phone,
            status
          )
        `
        )
        .is('revoked_at', null)
        .not('received_at', 'is', null);

      if (filter === 'pending') {
        (baseQuery as any).eq('sales.status', 'pending');
      } else {
        (baseQuery as any).eq('sales.status', 'completed');
      }

      const { data, error } = await (baseQuery as any).order('received_at', { ascending: false });
      if (error) throw error;

      const list = (data || []).map(mapCouponToPendingRow).filter(Boolean) as PendingRow[];
      setRows(list);
      setPickingRows([]);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to load orders',
        variant: 'destructive',
      });
      setRows([]);
      setPickingRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // realtime refresh (best-effort)
  useEffect(() => {
    const channel = supabase
      .channel('warehouse-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_coupons' }, () => fetchOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  /**
   * ✅ KEY FIX:
   * Do NOT require printed_at to show in Pending.
   * Pending is "received by warehouse", printed just controls Start Picking enablement.
   */
  const handleReceiveCoupon = async () => {
    const receipt = receiveInput.trim();
    if (!receipt) return;

    setReceiving(true);
    try {
      const { data, error } = await rpcAny('warehouse_receive_coupon_by_receipt', {
        p_receipt_number: receipt,
      });
      if (error) throw error;

      const couponId = (Array.isArray(data) ? data?.[0]?.coupon_id : (data as any)?.coupon_id) as
        | string
        | undefined;

      toast({
        title: 'Coupon received',
        description: `Receipt ${receipt} is now available in Pending.`,
      });

      setReceiveInput('');
      setFilter('pending');

      // ✅ Immediate “by id” fetch so it appears instantly
      if (couponId) {
        const { data: one, error: oneErr } = await supabase
          .from('sale_coupons' as any)
          .select(
            `
            id,
            sale_id,
            printed_at,
            received_at,
            revoked_at,
            sales:sales!inner (
              id,
              receipt_number,
              created_at,
              customer_name,
              customer_phone,
              status
            )
          `
          )
          .eq('id', couponId)
          .maybeSingle();

        if (!oneErr && one) {
          const mapped = mapCouponToPendingRow(one);
          if (mapped) {
            // ✅ Only require: pending + received. Printed is optional (button will be disabled if unprinted)
            if (mapped.status === 'pending' && mapped.received_at) {
              setRows((prev) => upsertByCouponId(prev, mapped));
            }
          }
        }
      }

      await fetchOrders();
    } catch (e: any) {
      toast({
        title: 'Cannot receive coupon',
        description: e?.message || 'Invalid receipt / revoked / wrong status',
        variant: 'destructive',
      });
    } finally {
      setReceiving(false);
    }
  };

  const startPicking = async (saleId: string) => {
    const { error } = await supabase
      .from('sales')
      .update({ status: 'picking' })
      .eq('id', saleId)
      .eq('status', 'pending');

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Picking Started', description: 'Order moved to picking stage' });
    setFilter('picking');
  };

  const handlePickItem = async (saleId: string, itemId: string, picked: boolean) => {
    if (!user) return;

    const { error } = await supabase
      .from('sale_items')
      .update({
        picked,
        picked_by: picked ? user.id : null,
        picked_at: picked ? new Date().toISOString() : null,
      })
      .eq('id', itemId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    const order = pickingRows.find((o) => o.sale_id === saleId);
    if (!order) return;

    const allPicked = order.sale_items.every((it: any) =>
      it.id === itemId ? picked : !!it.picked
    );

    if (allPicked) {
      const { error: completeError } = await supabase
        .from('sales')
        .update({ status: 'completed' })
        .eq('id', saleId);

      if (completeError) {
        toast({
          title: 'Warning',
          description: 'Items picked, but failed to mark order completed: ' + completeError.message,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Order Completed', description: 'All items picked successfully' });
      }
    }

    fetchOrders();
  };

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const receipt = (r.receipt_number || '').toLowerCase();
      const name = (r.customer_name || '').toLowerCase();
      const phone = (r.customer_phone || '').toLowerCase();
      return receipt.includes(q) || name.includes(q) || phone.includes(q);
    });
  }, [rows, query]);

  const filteredPicking = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pickingRows;

    return pickingRows.filter((r) => {
      const receipt = (r.receipt_number || '').toLowerCase();
      const name = (r.customer_name || '').toLowerCase();
      const phone = (r.customer_phone || '').toLowerCase();
      return receipt.includes(q) || name.includes(q) || phone.includes(q);
    });
  }, [pickingRows, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">Warehouse Fulfillment</h1>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/warehouse/receive')}
            title="Receive new stock into warehouse"
          >
            <Package className="h-4 w-4 mr-2" />
            Receive Stock
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate('/warehouse/my-receipts')}
            title="View receipts you captured"
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            My Receipts
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate('/reports/stock-balance')}
            title="Open Stock Balance Report"
          >
            <FileText className="h-4 w-4 mr-2" />
            Stock Balance
          </Button>

          <Button variant="ghost" size="icon" onClick={fetchOrders} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Receive + Search */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Receive Customer Coupon</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
            <Input
              value={receiveInput}
              onChange={(e) => setReceiveInput(e.target.value)}
              placeholder="Enter receipt number (e.g. RCP-20260117-0004)"
              className="bg-slate-800 border-slate-700 text-white"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReceiveCoupon();
              }}
            />
            <Button onClick={handleReceiveCoupon} disabled={receiving || !receiveInput.trim()}>
              {receiving ? 'Receiving...' : 'Receive'}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Search</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search receipt, customer, phone…"
                className="pl-10 bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'pending' ? 'default' : 'outline'}
          onClick={() => setFilter('pending')}
        >
          <Clock className="h-4 w-4 mr-2" /> Pending
        </Button>
        <Button
          variant={filter === 'picking' ? 'default' : 'outline'}
          onClick={() => setFilter('picking')}
        >
          <Package className="h-4 w-4 mr-2" /> Picking
        </Button>
        <Button
          variant={filter === 'completed' ? 'default' : 'outline'}
          onClick={() => setFilter('completed')}
        >
          <CheckCircle className="h-4 w-4 mr-2" /> Completed
        </Button>
      </div>

      <div className="text-xs text-slate-500">
        Pending shows only coupons that have been <b>received</b> by warehouse (Option A). Items appear only in{' '}
        <b>Picking</b>. Start Picking is <b>disabled</b> until coupon is printed.
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-slate-400">Loading orders...</p>
      ) : filter === 'picking' ? (
        filteredPicking.length === 0 ? (
          <p className="text-slate-400">No orders in picking</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPicking.map((r) => (
              <Card key={r.coupon_id} className="bg-slate-800 border-slate-700">
                <CardHeader className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-white font-bold text-[14px] leading-5 break-all">
                      {r.receipt_number}
                    </div>
                    <div className="flex gap-1">
                      {statusBadge(r.status)}
                      {yesNoBadge(!!r.printed_at, 'printed', 'unprinted')}
                    </div>
                  </div>

                  <div className="text-xs text-slate-400">
                    {r.customer_name || '—'} • {r.customer_phone || '—'}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="text-xs text-slate-500">
                    Tick items as you pick them. Order auto-completes when all items are ticked.
                  </div>

                  <div className="space-y-2">
                    {r.sale_items.map((it: any) => (
                      <div key={it.id} className="flex items-center gap-3 rounded-md bg-slate-900/40 p-2">
                        <Checkbox
                          checked={!!it.picked}
                          onCheckedChange={(checked) =>
                            handlePickItem(r.sale_id, it.id, checked as boolean)
                          }
                          className="border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <div className="min-w-0">
                          <div className="text-white text-sm truncate">{it.product?.name}</div>
                          <div className="text-xs text-slate-400">
                            {it.product?.sku || '—'} • Qty {it.quantity}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        filteredRows.length === 0 ? (
          <p className="text-slate-400">
            {filter === 'pending'
              ? 'No received coupons in pending. Use “Receive Customer Coupon” above.'
              : 'No completed orders.'}
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRows.map((r) => {
              // ✅ Start Picking should show always, but only enabled if printed + received + still pending
              const canStartPicking =
                filter === 'pending' &&
                !!r.received_at &&
                !!r.printed_at &&
                r.status === 'pending';

              return (
                <Card key={r.coupon_id} className="bg-slate-800 border-slate-700">
                  <CardHeader className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-white font-bold text-[14px] leading-5 break-all">
                        {r.receipt_number}
                      </div>

                      <div className="flex gap-1">
                        {statusBadge(r.status)}
                        {yesNoBadge(!!r.printed_at, 'printed', 'unprinted')}
                      </div>
                    </div>

                    <div className="text-xs text-slate-400">
                      {r.customer_name || '—'} • {r.customer_phone || '—'}
                    </div>

                    {filter === 'pending' && (
                      <div className="text-[11px] text-slate-500">
                        Received:{' '}
                        <span className={r.received_at ? 'text-slate-200' : 'text-red-400'}>
                          {r.received_at ? new Date(r.received_at).toLocaleString() : 'NOT received'}
                        </span>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent>
                    {filter === 'pending' && (
                      <Button
                        className="w-full"
                        onClick={() => startPicking(r.sale_id)}
                        disabled={!canStartPicking}
                        title={
                          canStartPicking
                            ? 'Start picking'
                            : !r.printed_at
                              ? 'Cannot start: coupon not printed'
                              : 'Cannot start'
                        }
                      >
                        Start Picking
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
