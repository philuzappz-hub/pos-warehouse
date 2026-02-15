import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sale, SaleItem } from '@/types/database';
import {
  CheckCircle,
  Clock,
  Package,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface SaleWithItems extends Sale {
  sale_items: (SaleItem & { product: { name: string; sku: string } })[];
}

interface ReturnWithDetails {
  id: string;
  sale_id: string;
  sale_item_id: string;
  quantity: number;
  reason: string | null;
  processed_by: string;
  initiated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  status: string;
  created_at: string;
  sale?: { receipt_number: string; customer_name: string | null };
  sale_item?: { product?: { name: string } };
  initiator?: { full_name: string };
  approver?: { full_name: string };
}

type PendingGroup = {
  sale_id: string;
  receipt_number: string;
  customer_name: string | null;
  initiated_by_name: string;
  created_at: string; // earliest created_at in group
  items: ReturnWithDetails[];
};

type ApprovedRow = {
  id: string;
  approved_at: string;
  receipt_number: string;
  customer_name: string | null;
  items_count: number;
  initiated_by_name: string;
  approved_by_name: string;
};

export default function Returns() {
  const { user, hasRole, isReturnsHandler, isAdmin } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [sales, setSales] = useState<SaleWithItems[]>([]);
  const [pendingReturns, setPendingReturns] = useState<ReturnWithDetails[]>([]);
  const [approvedToday, setApprovedToday] = useState<ApprovedRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedSale, setSelectedSale] = useState<SaleWithItems | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);

  const [returnReason, setReturnReason] = useState('');

  const isCashier = hasRole('cashier');
  const canApprove = isReturnsHandler || isAdmin;

  // ✅ Default tab:
  // - returns handler/admin land on "today"
  // - cashier lands on "initiate"
  const [activeTab, setActiveTab] = useState<string>(canApprove ? 'today' : 'initiate');

  // track coupons/items that already have an active return (pending/approved)
  const [activeReturnSaleIds, setActiveReturnSaleIds] = useState<Set<string>>(new Set());
  const [activeReturnItemIds, setActiveReturnItemIds] = useState<Set<string>>(new Set());

  // UI-only: expand/collapse grouped pending receipt rows
  const [expandedSaleIds, setExpandedSaleIds] = useState<Set<string>>(new Set());

  // If canApprove changes after profile loads, ensure default tab becomes "today"
  useEffect(() => {
    if (canApprove) setActiveTab('today');
    else setActiveTab('initiate');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canApprove]);

  const todayIsoStart = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  // ========= REALTIME RETURNS =========
  useEffect(() => {
    if (!canApprove) return;

    void fetchPendingReturns();
    void fetchApprovedToday();

    const channel = supabase
      .channel('returns-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'returns' },
        () => {
          void fetchPendingReturns();
          void fetchApprovedToday();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canApprove]);

  const fetchPendingReturns = async () => {
    const { data, error } = await supabase
      .from('returns')
      .select(`
        *,
        sale:sales(receipt_number, customer_name),
        sale_item:sale_items(product:products(name))
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return;

    if (data) {
      const initiatorIds = [...new Set(data.map(d => d.initiated_by).filter(Boolean))] as string[];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', initiatorIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      const enrichedData = data.map(ret => ({
        ...ret,
        initiator: ret.initiated_by
          ? { full_name: profileMap.get(ret.initiated_by) || 'Unknown' }
          : undefined,
      }));

      setPendingReturns(enrichedData as ReturnWithDetails[]);
    }
  };

  const fetchApprovedToday = async () => {
    // Approved today (newest first)
    const { data, error } = await supabase
      .from('returns')
      .select(`
        id,
        approved_at,
        initiated_by,
        approved_by,
        sale:sales(receipt_number, customer_name),
        status,
        sale_id
      `)
      .eq('status', 'approved')
      .gte('approved_at', todayIsoStart())
      .order('approved_at', { ascending: false });

    if (error) return;

    const rows = (data ?? []) as any[];

    if (rows.length === 0) {
      setApprovedToday([]);
      return;
    }

    // Build name maps for initiator + approver
    const initiatorIds = [...new Set(rows.map(r => r.initiated_by).filter(Boolean))] as string[];
    const approverIds = [...new Set(rows.map(r => r.approved_by).filter(Boolean))] as string[];
    const allProfileIds = [...new Set([...initiatorIds, ...approverIds])] as string[];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', allProfileIds);

    const nameMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

    // Group by sale_id so one receipt shows once with item count
    const grouped = new Map<string, { approved_at: string; receipt_number: string; customer_name: string | null; items_count: number; initiated_by?: string | null; approved_by?: string | null }>();

    for (const r of rows) {
      const saleId = String(r.sale_id);
      const receipt = r.sale?.receipt_number ?? '—';
      const customer = r.sale?.customer_name ?? null;
      const approvedAt = r.approved_at ?? r.created_at ?? new Date().toISOString();

      if (!grouped.has(saleId)) {
        grouped.set(saleId, {
          approved_at: approvedAt,
          receipt_number: receipt,
          customer_name: customer,
          items_count: 1,
          initiated_by: r.initiated_by ?? null,
          approved_by: r.approved_by ?? null,
        });
      } else {
        const g = grouped.get(saleId)!;
        g.items_count += 1;

        // keep newest approved_at for sorting/display
        if (new Date(approvedAt) > new Date(g.approved_at)) {
          g.approved_at = approvedAt;
        }
      }
    }

    const list: ApprovedRow[] = Array.from(grouped.entries()).map(([saleId, g]) => ({
      id: saleId,
      approved_at: g.approved_at,
      receipt_number: g.receipt_number,
      customer_name: g.customer_name,
      items_count: g.items_count,
      initiated_by_name: g.initiated_by ? (nameMap.get(g.initiated_by) || 'Unknown') : '—',
      approved_by_name: g.approved_by ? (nameMap.get(g.approved_by) || 'Unknown') : '—',
    }));

    list.sort((a, b) => new Date(b.approved_at).getTime() - new Date(a.approved_at).getTime());
    setApprovedToday(list);
  };

  // helper: active returns for the searched receipts (pending/approved)
  const loadActiveReturnsForSales = async (fetchedSales: SaleWithItems[]) => {
    const allItemIds = fetchedSales.flatMap(s => s.sale_items.map(i => i.id));

    if (allItemIds.length === 0) {
      setActiveReturnSaleIds(new Set());
      setActiveReturnItemIds(new Set());
      return { saleIdSet: new Set<string>(), itemIdSet: new Set<string>() };
    }

    const { data: activeReturns, error: activeReturnsError } = await supabase
      .from('returns')
      .select('sale_id, sale_item_id, status')
      .in('sale_item_id', allItemIds)
      .in('status', ['pending', 'approved']);

    if (activeReturnsError) {
      toast({
        title: 'Warning',
        description: 'Could not verify existing returns: ' + activeReturnsError.message,
        variant: 'destructive'
      });
      return { saleIdSet: new Set<string>(), itemIdSet: new Set<string>() };
    }

    const saleIdSet = new Set<string>();
    const itemIdSet = new Set<string>();

    (activeReturns || []).forEach((r: any) => {
      if (r.sale_id) saleIdSet.add(r.sale_id);
      if (r.sale_item_id) itemIdSet.add(r.sale_item_id);
    });

    setActiveReturnSaleIds(saleIdSet);
    setActiveReturnItemIds(itemIdSet);

    return { saleIdSet, itemIdSet };
  };

  const searchSales = async () => {
    if (!search.trim()) return;
    setLoading(true);

    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('sales')
      .select(`
        *,
        sale_items (
          *,
          product:products (name, sku)
        )
      `)
      .or(
        `receipt_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`
      )
      .gte('created_at', today)
      .order('created_at', { ascending: false });

    if (isCashier && !isAdmin) {
      query = query.eq('cashier_id', user?.id);
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const fetchedSales = (data as SaleWithItems[]) || [];

    if (fetchedSales.length > 0) {
      const { saleIdSet } = await loadActiveReturnsForSales(fetchedSales);

      // Hide coupons that already have pending/approved return
      const filteredSales = fetchedSales.filter(s => !saleIdSet.has(s.id));
      setSales(filteredSales);

      if (filteredSales.length === 0) {
        toast({
          title: 'No Eligible Receipts',
          description: 'Any receipt with an initiated/approved return is hidden here.'
        });
      }
    } else {
      setSales([]);
      toast({ title: 'No Results', description: 'No sales found for today with that search term' });
    }

    setLoading(false);
  };

  // FULL COUPON RETURN: open dialog for whole receipt
  const openReturnDialog = (sale: SaleWithItems) => {
    setSelectedSale(sale);
    setReturnReason('');
    setReturnDialogOpen(true);
  };

  // FULL COUPON RETURN: create returns for all items on receipt
  const initiateFullCouponReturn = async () => {
    if (!user || !selectedSale) return;

    if (activeReturnSaleIds.has(selectedSale.id)) {
      toast({
        title: 'Return Exists',
        description: 'This receipt already has an active return (pending/approved).',
        variant: 'destructive'
      });
      return;
    }

    const itemIds = selectedSale.sale_items.map(i => i.id);
    const { data: existing, error: existingError } = await supabase
      .from('returns')
      .select('id, sale_item_id, status')
      .in('sale_item_id', itemIds)
      .in('status', ['pending', 'approved']);

    if (existingError) {
      toast({ title: 'Error', description: existingError.message, variant: 'destructive' });
      return;
    }

    if (existing && existing.length > 0) {
      toast({
        title: 'Return Exists',
        description: 'One or more items on this receipt already has an active return.',
        variant: 'destructive'
      });
      return;
    }

    const payload = selectedSale.sale_items.map(item => ({
      sale_id: selectedSale.id,
      sale_item_id: item.id,
      quantity: item.quantity,
      reason: returnReason.trim() || null,
      processed_by: user.id,
      initiated_by: user.id,
      status: 'pending'
    }));

    const { error: insertError } = await supabase.from('returns').insert(payload);

    if (insertError) {
      toast({ title: 'Error', description: insertError.message, variant: 'destructive' });
      return;
    }

    toast({
      title: 'Return Initiated',
      description: 'Full receipt return created. Waiting for warehouse approval.'
    });

    setReturnDialogOpen(false);
    await searchSales();

    if (canApprove) {
      void fetchPendingReturns();
      void fetchApprovedToday();
    }
  };

  const approveReturnGroup = async (group: PendingGroup) => {
    if (!user) return;

    const ids = group.items.map(i => i.id);
    if (ids.length === 0) return;

    const results = await Promise.all(
      ids.map((id) => (supabase as any).rpc('approve_return', { p_return_id: id }))
    );

    const firstError = results.find(r => r.error)?.error;
    if (firstError) {
      toast({ title: 'Error', description: firstError.message, variant: 'destructive' });
      return;
    }

    const { error: saleError } = await supabase
      .from('sales')
      .update({ status: 'returned' })
      .eq('id', group.sale_id);

    if (saleError) {
      toast({
        title: 'Warning',
        description: 'Approved items but failed to update sale status: ' + saleError.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Receipt Approved',
        description: `Approved ${ids.length} item(s) for receipt ${group.receipt_number}`
      });
    }

    void fetchPendingReturns();
    void fetchApprovedToday();

    // Optional: switch back to Today tab after approving
    setActiveTab('today');
  };

  const rejectReturnGroup = async (group: PendingGroup) => {
    if (!user) return;

    const ids = group.items.map(i => i.id);
    if (ids.length === 0) return;

    const { error: rejectError } = await supabase
      .from('returns')
      .update({
        status: 'rejected',
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .in('id', ids)
      .eq('status', 'pending');

    if (rejectError) {
      toast({ title: 'Error', description: rejectError.message, variant: 'destructive' });
      return;
    }

    toast({
      title: 'Receipt Rejected',
      description: `Rejected ${ids.length} item(s) for receipt ${group.receipt_number}`
    });

    void fetchPendingReturns();
    void fetchApprovedToday();
  };

  const canReturnSale = (sale: SaleWithItems) => !activeReturnSaleIds.has(sale.id);

  const groupedPendingReturns: PendingGroup[] = useMemo(() => {
    const map = new Map<string, PendingGroup>();

    for (const r of pendingReturns) {
      const saleId = r.sale_id;
      const receiptNumber = r.sale?.receipt_number || '—';
      const customerName = r.sale?.customer_name || null;
      const initiatedByName = r.initiator?.full_name || '—';

      if (!map.has(saleId)) {
        map.set(saleId, {
          sale_id: saleId,
          receipt_number: receiptNumber,
          customer_name: customerName,
          initiated_by_name: initiatedByName,
          created_at: r.created_at,
          items: [r],
        });
      } else {
        const g = map.get(saleId)!;
        g.items.push(r);
        if (new Date(r.created_at) < new Date(g.created_at)) {
          g.created_at = r.created_at;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const ad = new Date(a.created_at).getTime();
      const bd = new Date(b.created_at).getTime();
      return bd - ad;
    });
  }, [pendingReturns]);

  const toggleExpand = (saleId: string) => {
    setExpandedSaleIds(prev => {
      const next = new Set(prev);
      if (next.has(saleId)) next.delete(saleId);
      else next.add(saleId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Process Returns</h1>
        <p className="text-slate-400">Same-day returns with approval workflow</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800">
          {canApprove && (
            <TabsTrigger value="today">
              Today (Approved)
              {approvedToday.length > 0 && (
                <Badge className="ml-2 bg-green-600">{approvedToday.length}</Badge>
              )}
            </TabsTrigger>
          )}

          {isCashier && <TabsTrigger value="initiate">Initiate Return</TabsTrigger>}

          {canApprove && (
            <TabsTrigger value="approve">
              Pending Approval
              {pendingReturns.length > 0 && (
                <Badge className="ml-2 bg-yellow-500">{pendingReturns.length}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ✅ Today Approved Tab (Returns Handler default) */}
        <TabsContent value="today" className="space-y-4">
          {approvedToday.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center text-slate-400">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No approved return coupons yet today</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Approved Returns Today (Newest First)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-400">Receipt</TableHead>
                      <TableHead className="text-slate-400">Customer</TableHead>
                      <TableHead className="text-slate-400">Items</TableHead>
                      <TableHead className="text-slate-400">Initiated By</TableHead>
                      <TableHead className="text-slate-400">Approved By</TableHead>
                      <TableHead className="text-slate-400">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedToday.map((row) => (
                      <TableRow key={row.id} className="border-slate-700">
                        <TableCell className="text-white font-medium">{row.receipt_number}</TableCell>
                        <TableCell className="text-slate-300">{row.customer_name || 'Walk-in'}</TableCell>
                        <TableCell className="text-slate-300">
                          <Badge className="bg-green-600">{row.items_count}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-300">{row.initiated_by_name}</TableCell>
                        <TableCell className="text-slate-300">{row.approved_by_name}</TableCell>
                        <TableCell className="text-slate-300">
                          {row.approved_at ? new Date(row.approved_at).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Initiate Returns Tab (Cashiers) */}
        <TabsContent value="initiate" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Search className="h-5 w-5" />
                Find Your Sale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Input
                  placeholder="Search by receipt number, customer name, or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchSales()}
                  className="flex-1 bg-slate-700 border-slate-600 text-white"
                />
                <Button onClick={searchSales} disabled={loading}>
                  {loading ? 'Searching...' : 'Search'}
                </Button>
              </div>

              <p className="text-xs text-slate-500 mt-2">
                Note: You can only initiate returns for receipts you issued today.
              </p>

              <p className="text-xs text-yellow-400 mt-2">
                ✅ Full receipt return is enabled. Any receipt that already has an initiated/approved return is hidden.
              </p>
            </CardContent>
          </Card>

          {sales.length > 0 && (
            <div className="space-y-4">
              {sales.map(sale => (
                <Card key={sale.id} className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white">{sale.receipt_number}</CardTitle>
                      <span className="text-slate-400 text-sm">
                        {new Date(sale.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm">
                      Customer: {sale.customer_name || 'Walk-in'} • Total: GHS {sale.total_amount.toLocaleString()}
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-700">
                          <TableHead className="text-slate-400">Item</TableHead>
                          <TableHead className="text-slate-400">Qty</TableHead>
                          <TableHead className="text-slate-400">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sale.sale_items.map(item => (
                          <TableRow key={item.id} className="border-slate-700">
                            <TableCell className="text-white">{item.product.name}</TableCell>
                            <TableCell className="text-slate-300">{item.quantity}</TableCell>
                            <TableCell className="text-slate-300">GHS {item.unit_price.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => openReturnDialog(sale)}
                      disabled={!canReturnSale(sale)}
                      title={
                        canReturnSale(sale)
                          ? 'Initiate return for full receipt'
                          : 'This receipt already has a return (pending/approved)'
                      }
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Return Full Receipt ({sale.sale_items.length} items)
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {sales.length === 0 && search && !loading && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center text-slate-400">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No sales found. You can only return items from your own receipts issued today.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Pending Approval Tab (Returns Handler) */}
        <TabsContent value="approve" className="space-y-4">
          {groupedPendingReturns.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center text-slate-400">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pending returns to approve</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Pending Returns (Grouped by Receipt)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-400">Receipt</TableHead>
                      <TableHead className="text-slate-400">Customer</TableHead>
                      <TableHead className="text-slate-400">Items</TableHead>
                      <TableHead className="text-slate-400">Initiated By</TableHead>
                      <TableHead className="text-slate-400">Time</TableHead>
                      <TableHead className="text-slate-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {groupedPendingReturns.map(group => {
                      const expanded = expandedSaleIds.has(group.sale_id);

                      return (
                        <>
                          <TableRow
                            key={group.sale_id}
                            className="border-slate-700 cursor-pointer hover:bg-slate-800/60"
                            onClick={() => toggleExpand(group.sale_id)}
                          >
                            <TableCell className="text-white font-medium">
                              {group.receipt_number}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {group.customer_name || 'Walk-in'}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              <Badge className="bg-yellow-500">{group.items.length}</Badge>
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {group.initiated_by_name}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {new Date(group.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => approveReturnGroup(group)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Approve All
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => rejectReturnGroup(group)}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Reject All
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {expanded && (
                            <TableRow className="border-slate-700">
                              <TableCell colSpan={6} className="p-0">
                                <div className="bg-slate-900/40 border-t border-slate-700 p-3">
                                  <p className="text-xs text-slate-400 mb-2">
                                    Items in this receipt return:
                                  </p>
                                  <div className="space-y-2">
                                    {group.items.map(item => (
                                      <div
                                        key={item.id}
                                        className="flex items-center justify-between rounded-md bg-slate-800/50 border border-slate-700 px-3 py-2"
                                      >
                                        <div>
                                          <p className="text-sm text-white">
                                            {item.sale_item?.product?.name || 'Item'}
                                          </p>
                                          <p className="text-xs text-slate-400">
                                            Qty: {item.quantity} • Reason: {item.reason || '-'}
                                          </p>
                                        </div>
                                        <Badge className="bg-yellow-500">pending</Badge>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>

                <p className="text-xs text-slate-500 mt-3">
                  Tip: Click a row to expand and see all items under that receipt.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Full Receipt Return Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Return Full Receipt</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-slate-400">
              Receipt: <span className="text-white">{selectedSale?.receipt_number}</span>
            </p>
            <p className="text-slate-400">
              Items on receipt: <span className="text-white">{selectedSale?.sale_items.length || 0}</span>
            </p>

            <div>
              <Label className="text-slate-200">Reason for Return</Label>
              <Input
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g., Customer changed mind, Wrong items, etc."
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <p className="text-xs text-yellow-400">
              ⚠️ This creates return requests for ALL items on the receipt and requires warehouse approval.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>Cancel</Button>
            <Button onClick={initiateFullCouponReturn}>
              Initiate Full Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
