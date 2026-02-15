import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';

// PDF
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReceiptStatus = 'pending' | 'approved' | 'rejected';

type ProductMini = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
};

type ReceiptItem = {
  id: string;
  receipt_id: string;
  product_id: string;
  quantity: number;
  product?: ProductMini;
};

type ReceiptRow = {
  id: string;
  car_number: string;
  notes: string | null;
  status: ReceiptStatus;
  created_at: string;
  created_by: string;

  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;

  // ✅ Waybill URLs stored in jsonb (paths or other json)
  waybill_urls?: any;

  items?: ReceiptItem[];
};

function formatDate(d?: string | null) {
  if (!d) return '-';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString();
}

function statusLabel(s: ReceiptStatus) {
  if (s === 'pending') return 'PENDING';
  if (s === 'approved') return 'APPROVED';
  return 'REJECTED';
}

// Used only inside PDF colors
function statusColor(s: ReceiptStatus): [number, number, number] {
  if (s === 'pending') return [245, 158, 11]; // amber
  if (s === 'approved') return [34, 197, 94]; // green
  return [239, 68, 68]; // red
}

// ✅ Forces browser download (no new tab)
function forceDownloadPdf(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ✅ Your waybill_urls is jsonb; normalize to string[]
function normalizeWaybillUrls(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);

  // sometimes jsonb might be { urls: [...] }
  if (typeof v === 'object') {
    if (Array.isArray(v.urls)) return v.urls.filter(Boolean).map(String);
    if (Array.isArray(v.files)) return v.files.filter(Boolean).map(String);
  }

  // sometimes stored as a single string
  if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
  return [];
}

/**
 * ✅ If DB stored full public URL, convert to storage path.
 * Supabase createSignedUrl expects a bucket-relative path: "<receiptId>/<file>.jpg"
 */
function extractWaybillPath(urlOrPath: string): string {
  const s = (urlOrPath || '').trim();
  if (!s) return '';

  // already a path like "abc/123.jpg"
  if (!s.startsWith('http')) return s;

  // Try to extract after "/waybills/"
  const idx = s.toLowerCase().indexOf('/waybills/');
  if (idx >= 0) return s.slice(idx + '/waybills/'.length);

  // Try to extract after "/object/" then "waybills/"
  const idx2 = s.toLowerCase().indexOf('/object/');
  if (idx2 >= 0) {
    const after = s.slice(idx2 + '/object/'.length);
    const lower = after.toLowerCase();
    const b = 'waybills/';
    const bIdx = lower.indexOf(b);
    if (bIdx >= 0) return after.slice(bIdx + b.length);
  }

  return s;
}

function isLikelyImageUrl(u: string) {
  const s = (u || '').toLowerCase();
  return s.includes('.png') || s.includes('.jpg') || s.includes('.jpeg') || s.includes('.webp') || s.includes('image');
}

// ✅ Convert an image URL to dataUrl so jsPDF can embed it
async function imageUrlToDataUrl(
  url: string
): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG'; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const blob = await res.blob();
    const mime = (blob.type || '').toLowerCase();
    const format: 'PNG' | 'JPEG' = mime.includes('png') || url.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';

    // get dimensions
    let width = 0;
    let height = 0;

    try {
      // modern browsers
      const bmp = await createImageBitmap(blob);
      width = bmp.width;
      height = bmp.height;
      bmp.close?.();
    } catch {
      // fallback via HTMLImageElement
      const objUrl = URL.createObjectURL(blob);
      try {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            width = img.naturalWidth || 0;
            height = img.naturalHeight || 0;
            resolve();
          };
          img.onerror = () => reject(new Error('img load failed'));
          img.src = objUrl;
        });
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return { dataUrl, format, width, height };
  } catch {
    return null;
  }
}

export default function MyReceipts() {
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReceiptStatus>('pending');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // map user_id -> full_name (for admin approver/rejector)
  const [userNameMap, setUserNameMap] = useState<Map<string, string>>(new Map());

  // ✅ per-receipt pdf export state
  const [exportingIds, setExportingIds] = useState<Set<string>>(new Set());
  const setExporting = (id: string, on: boolean) => {
    setExportingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // ✅ Waybill preview dialog state
  const [waybillOpen, setWaybillOpen] = useState(false);
  const [waybillActiveReceiptId, setWaybillActiveReceiptId] = useState<string | null>(null);
  const [waybillActiveUrls, setWaybillActiveUrls] = useState<string[]>([]);
  const [waybillActiveIndex, setWaybillActiveIndex] = useState(0);
  const [waybillSigning, setWaybillSigning] = useState(false);

  const closeWaybill = () => {
    setWaybillOpen(false);
    setWaybillActiveReceiptId(null);
    setWaybillActiveUrls([]);
    setWaybillActiveIndex(0);
    setWaybillSigning(false);
  };

  // ✅ Create signed URLs for private bucket "waybills"
  const getSignedWaybillUrls = async (r: ReceiptRow, expiresSec = 3600) => {
    const raw = normalizeWaybillUrls(r.waybill_urls);
    if (raw.length === 0) return [];

    const signed: string[] = [];
    for (const u of raw) {
      const path = extractWaybillPath(u);
      if (!path || path.startsWith('http')) continue;

      const { data, error } = await supabase.storage.from('waybills').createSignedUrl(path, expiresSec);
      if (!error && data?.signedUrl) signed.push(data.signedUrl);
    }
    return signed;
  };

  const openWaybillsForReceipt = async (r: ReceiptRow, startIndex = 0) => {
    const raw = normalizeWaybillUrls(r.waybill_urls);
    if (raw.length === 0) {
      toast({ title: 'No waybill', description: 'This receipt has no waybill attached.' });
      return;
    }

    setWaybillOpen(true);
    setWaybillSigning(true);
    setWaybillActiveReceiptId(r.id);
    setWaybillActiveUrls([]);
    setWaybillActiveIndex(Math.max(0, Math.min(startIndex, raw.length - 1)));

    try {
      const signed = await getSignedWaybillUrls(r, 3600);

      if (signed.length === 0) {
        toast({
          title: 'Waybill not accessible',
          description:
            'Could not create signed URLs. Make sure waybill_urls stores storage paths like "receiptId/userId/file.jpg".',
          variant: 'destructive',
        });
        closeWaybill();
        return;
      }

      setWaybillActiveUrls(signed);
      setWaybillActiveIndex((prev) => Math.max(0, Math.min(prev, signed.length - 1)));
    } catch (e: any) {
      toast({
        title: 'Waybill error',
        description: e?.message || 'Could not open waybill preview',
        variant: 'destructive',
      });
      closeWaybill();
    } finally {
      setWaybillSigning(false);
    }
  };

  const fetchMine = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('warehouse_receipts' as any)
        .select(
          `
            id,
            car_number,
            notes,
            status,
            created_at,
            created_by,
            approved_at,
            approved_by,
            rejected_at,
            rejected_by,
            rejection_reason,
            waybill_urls,
            items:warehouse_receipt_items (
              id,
              receipt_id,
              product_id,
              quantity,
              product:products (id, name, sku, unit)
            )
          `
        )
        .eq('created_by', user.id)
        .eq('status', tab)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = (data ?? []) as unknown as ReceiptRow[];
      setRows(list);

      // Build name map for approvers/rejectors
      const ids = new Set<string>();
      list.forEach((r) => {
        if (r.approved_by) ids.add(String(r.approved_by));
        if (r.rejected_by) ids.add(String(r.rejected_by));
      });

      if (ids.size > 0) {
        const { data: profilesData, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', Array.from(ids));

        if (!pErr && profilesData) {
          const m = new Map<string, string>();
          profilesData.forEach((p) => m.set(p.user_id, p.full_name));
          setUserNameMap(m);
        } else {
          setUserNameMap(new Map());
        }
      } else {
        setUserNameMap(new Map());
      }
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to load your receipts',
        variant: 'destructive',
      });
      setRows([]);
      setUserNameMap(new Map());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // realtime refresh
  useEffect(() => {
    const ch1 = supabase
      .channel('warehouse-my-receipts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_receipts' }, () => fetchMine())
      .subscribe();

    const ch2 = supabase
      .channel('warehouse-my-receipt-items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_receipt_items' }, () => fetchMine())
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const car = (r.car_number || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      const itemsText = (r.items || [])
        .map((it) => it.product?.name || '')
        .join(' ')
        .toLowerCase();

      return car.includes(s) || notes.includes(s) || itemsText.includes(s);
    });
  }, [rows, search]);

  const statusBadge = (s: ReceiptStatus) => {
    if (s === 'pending') return <Badge className="bg-yellow-500">Pending</Badge>;
    if (s === 'approved') return <Badge className="bg-green-500">Approved</Badge>;
    return <Badge className="bg-red-500">Rejected</Badge>;
  };

  // ✅ Direct-download PDF + Waybill image embedding
  const exportReceiptPdf = async (r: ReceiptRow) => {
    if (!user) return;

    setExporting(r.id, true);

    try {
      const brand = 'Philuz Appz';
      const staffName = profile?.full_name || 'Unknown';

      const adminName =
        r.status === 'approved'
          ? userNameMap.get(String(r.approved_by || '')) || 'Admin'
          : r.status === 'rejected'
            ? userNameMap.get(String(r.rejected_by || '')) || 'Admin'
            : '—';

      const decisionDate =
        r.status === 'approved'
          ? formatDate(r.approved_at || null)
          : r.status === 'rejected'
            ? formatDate(r.rejected_at || null)
            : '—';

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      // Header
      doc.setFontSize(14);
      doc.text(`${brand} — Stock Receipt`, 40, 40);

      // Status pill-like
      const [cr, cg, cb] = statusColor(r.status);
      doc.setFillColor(cr, cg, cb);
      doc.roundedRect(420, 26, 130, 22, 10, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(statusLabel(r.status), 485, 41, { align: 'center' });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.text(`Car Number: ${r.car_number}`, 40, 70);
      doc.text(`Captured At: ${formatDate(r.created_at)}`, 40, 86);
      doc.text(`Received By: ${staffName}`, 40, 102);
      doc.text(`Admin: ${adminName}`, 40, 118);
      doc.text(`Decision Date: ${decisionDate}`, 40, 134);

      // Notes
      const notesText = r.notes?.trim() ? r.notes.trim() : '—';
      doc.text(`Notes: ${notesText}`, 40, 152, { maxWidth: 520 });

      // Rejection reason (if any)
      let startY = 175;
      if (r.status === 'rejected') {
        doc.setTextColor(185, 28, 28);
        doc.text(`Rejection Reason: ${r.rejection_reason || '—'}`, 40, startY, { maxWidth: 520 });
        doc.setTextColor(15, 23, 42);
        startY += 18;
      }

      // Items table
      const items = r.items || [];
      const body = items.map((it, idx) => [
        String(idx + 1),
        it.product?.name || 'Unknown',
        it.product?.sku || '-',
        it.product?.unit || '-',
        Number(it.quantity || 0).toLocaleString(),
      ]);

      const totalQty = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

      autoTable(doc, {
        startY: Math.max(200, startY + 10),
        head: [['#', 'Product', 'SKU', 'Unit', 'Qty']],
        body: body.length ? body : [['—', 'No items found', '—', '—', '—']],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 41, 59] as any },
        columnStyles: {
          0: { cellWidth: 30 },
          4: { halign: 'right', cellWidth: 70 },
        },
        margin: { left: 40, right: 40 },
      });

      let y = (doc as any).lastAutoTable?.finalY || 260;

      // Totals
      doc.setFontSize(10);
      doc.text(`Lines: ${items.length}   •   Total Qty: ${Number(totalQty).toLocaleString()}`, 40, y + 20);
      y += 35;

      // ✅ Waybill embedding (best-effort)
      const rawWaybills = normalizeWaybillUrls(r.waybill_urls);
      if (rawWaybills.length > 0) {
        // sign first (private bucket)
        const signed = await getSignedWaybillUrls(r, 3600);

        // embed only images
        const signedImages = signed.filter(isLikelyImageUrl);

        const MAX_EMBED = 2; // 🔧 change to 3/4 if you want
        const toEmbed = signedImages.slice(0, MAX_EMBED);

        if (toEmbed.length > 0) {
          // Title
          if (y > 720) {
            doc.addPage();
            y = 60;
          }

          doc.setFontSize(12);
          doc.setTextColor(15, 23, 42);
          doc.text(`Waybill Image${toEmbed.length > 1 ? 's' : ''} (Embedded)`, 40, y);
          y += 12;

          for (let i = 0; i < toEmbed.length; i++) {
            const signedUrl = toEmbed[i];
            const img = await imageUrlToDataUrl(signedUrl);

            if (!img) continue;

            // Page break if needed
            const maxW = 515; // a4 width minus margins
            const maxH = 300;

            // compute scaled size keeping aspect ratio
            const w = img.width || 1200;
            const h = img.height || 800;
            const scale = Math.min(maxW / w, maxH / h, 1);
            const drawW = Math.floor(w * scale);
            const drawH = Math.floor(h * scale);

            // if not enough space, new page
            if (y + drawH + 30 > 820) {
              doc.addPage();
              y = 60;
            }

            // small label
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text(`Waybill ${i + 1} of ${toEmbed.length}`, 40, y + 10);
            doc.setTextColor(15, 23, 42);

            // draw image
            try {
              doc.addImage(img.dataUrl, img.format, 40, y + 16, drawW, drawH, undefined, 'FAST');
              y = y + 16 + drawH + 18;
            } catch {
              // ignore embed failure
            }
          }

          // note
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(
            `Note: Waybill images are embedded from signed links (private bucket). If you need all images, increase MAX_EMBED.`,
            40,
            Math.min(820, y + 10),
            { maxWidth: 520 }
          );
          doc.setTextColor(15, 23, 42);
          y += 18;
        }
      }

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`${brand} • Generated: ${new Date().toLocaleString()}`, 40, 820);

      const filename = `MyStockReceipt-${r.car_number}-${r.status}-${new Date().toISOString().slice(0, 10)}.pdf`;
      forceDownloadPdf(doc, filename);
    } catch (e: any) {
      toast({
        title: 'PDF export failed',
        description: e?.message || 'Could not generate PDF',
        variant: 'destructive',
      });
    } finally {
      setExporting(r.id, false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">My Stock Receipts</h1>
          <p className="text-slate-400">
            Brand: <b>Philuz Appz</b> • Receipts you captured (pending / approved / rejected)
          </p>
        </div>

        <Button variant="outline" onClick={fetchMine} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === 'pending' ? 'default' : 'outline'} onClick={() => setTab('pending')}>
          Pending
        </Button>
        <Button variant={tab === 'approved' ? 'default' : 'outline'} onClick={() => setTab('approved')}>
          Approved
        </Button>
        <Button variant={tab === 'rejected' ? 'default' : 'outline'} onClick={() => setTab('rejected')}>
          Rejected
        </Button>
      </div>

      {/* Search */}
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
              placeholder="Car number, notes, product..."
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({filtered.length})
          </CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Car #</TableHead>
                <TableHead className="text-slate-400">Captured At</TableHead>
                <TableHead className="text-slate-400">Items</TableHead>
                <TableHead className="text-slate-400">Total Qty</TableHead>
                <TableHead className="text-slate-400">Waybill</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-10">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-10">
                    No receipts found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const isOpen = expanded.has(r.id);
                  const totalQty = (r.items || []).reduce((sum, it) => sum + Number(it.quantity || 0), 0);
                  const waybillCount = normalizeWaybillUrls(r.waybill_urls).length;
                  const exporting = exportingIds.has(r.id);

                  return (
                    <Fragment key={r.id}>
                      <TableRow className="border-slate-700">
                        <TableCell className="text-white font-medium">{r.car_number}</TableCell>
                        <TableCell className="text-slate-300">{formatDate(r.created_at)}</TableCell>
                        <TableCell className="text-slate-300">{r.items?.length || 0}</TableCell>
                        <TableCell className="text-slate-300">{Number(totalQty).toLocaleString()}</TableCell>

                        <TableCell className="text-slate-300">
                          {waybillCount > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openWaybillsForReceipt(r, 0)}
                              title="View waybill images"
                            >
                              <ImageIcon className="h-4 w-4 mr-2" />
                              View ({waybillCount})
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-500">None</span>
                          )}
                        </TableCell>

                        <TableCell>{statusBadge(r.status)}</TableCell>

                        <TableCell className="text-right">
                          <div className="inline-flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => toggleExpand(r.id)}>
                              {isOpen ? 'Hide' : 'View'}
                            </Button>

                            <Button
                              size="sm"
                              onClick={() => exportReceiptPdf(r)}
                              title="Download PDF"
                              disabled={exporting}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              {exporting ? 'Exporting...' : 'Export'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="border-slate-700">
                          <TableCell colSpan={7} className="p-0">
                            <div className="bg-slate-900/40 border-t border-slate-700 p-4 space-y-3">
                              <div className="text-sm text-slate-300">
                                <span className="text-slate-400">Notes:</span> {r.notes || '—'}
                              </div>

                              {/* Waybill block */}
                              <div className="rounded-md border border-slate-700 bg-slate-950/30 p-3">
                                <div className="text-sm text-white font-semibold mb-2">Waybill</div>
                                {waybillCount > 0 ? (
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs text-slate-400">
                                      Attached images: <b className="text-white">{waybillCount}</b>
                                    </div>
                                    <Button size="sm" variant="outline" onClick={() => openWaybillsForReceipt(r, 0)}>
                                      <ImageIcon className="h-4 w-4 mr-2" />
                                      Preview
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-500">No waybill attached (optional).</div>
                                )}
                              </div>

                              {(r.status === 'rejected' && (r.rejection_reason || r.rejected_at)) && (
                                <div className="text-sm text-slate-300">
                                  <span className="text-slate-400">Rejection:</span>{' '}
                                  {r.rejection_reason || '—'}{' '}
                                  <span className="text-slate-500">({r.rejected_at ? formatDate(r.rejected_at) : ''})</span>
                                </div>
                              )}

                              <div className="rounded-md border border-slate-700 overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-slate-700">
                                      <TableHead className="text-slate-400">Product</TableHead>
                                      <TableHead className="text-slate-400">SKU</TableHead>
                                      <TableHead className="text-slate-400">Unit</TableHead>
                                      <TableHead className="text-slate-400 text-right">Qty</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(r.items || []).map((it) => (
                                      <TableRow key={it.id} className="border-slate-700">
                                        <TableCell className="text-white font-medium">{it.product?.name || 'Unknown'}</TableCell>
                                        <TableCell className="text-slate-300">{it.product?.sku || '-'}</TableCell>
                                        <TableCell className="text-slate-300">{it.product?.unit || '-'}</TableCell>
                                        <TableCell className="text-slate-300 text-right">
                                          {Number(it.quantity || 0).toLocaleString()}
                                        </TableCell>
                                      </TableRow>
                                    ))}

                                    {(r.items || []).length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={4} className="text-center text-slate-400 py-6">
                                          No items found.
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>

                              <div className="text-xs text-slate-500">
                                Pending = waiting for admin approval. Approved = stock updated.
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Waybill Viewer Dialog */}
      <Dialog open={waybillOpen} onOpenChange={(o) => (o ? setWaybillOpen(true) : closeWaybill())}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              Waybill Preview {waybillActiveReceiptId ? `• ${waybillActiveReceiptId}` : ''}
            </DialogTitle>
          </DialogHeader>

          {waybillSigning ? (
            <div className="text-sm text-slate-400">Preparing signed links...</div>
          ) : waybillActiveUrls.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-400">
                  Image <b className="text-white">{waybillActiveIndex + 1}</b> of{' '}
                  <b className="text-white">{waybillActiveUrls.length}</b>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setWaybillActiveIndex((i) => Math.max(0, i - 1))}
                    disabled={waybillActiveIndex <= 0}
                    title="Previous"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setWaybillActiveIndex((i) => Math.min(waybillActiveUrls.length - 1, i + 1))}
                    disabled={waybillActiveIndex >= waybillActiveUrls.length - 1}
                    title="Next"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-slate-700 bg-black/20 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={waybillActiveUrls[waybillActiveIndex]}
                  alt="Waybill"
                  className="w-full max-h-[70vh] object-contain rounded"
                />
              </div>

              <div className="text-[11px] text-slate-500">
                Note: Images are signed URLs (expire in ~1 hour). Re-open if they expire.
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">No waybill.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
