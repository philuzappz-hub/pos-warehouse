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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
    CheckCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Clock,
    ExternalLink,
    FileText,
    Image as ImageIcon,
    RefreshCw,
    XCircle,
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
  quantity_in_stock: number;
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

  // ✅ jsonb in your DB (can be array, object, or string)
  waybill_urls?: any;

  items?: ReceiptItem[];
};

type AuditRow = {
  id: string;
  receipt_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  note: string | null;
  created_at: string;
};

function fmtDate(d?: string | null) {
  if (!d) return '-';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString();
}

function safeUpper(v?: string | null) {
  return (v || '').toString().toUpperCase();
}

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

// ✅ normalize jsonb -> string[]
function normalizeWaybillUrls(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);

  if (typeof v === 'object') {
    if (Array.isArray(v.urls)) return v.urls.filter(Boolean).map(String);
    if (Array.isArray(v.files)) return v.files.filter(Boolean).map(String);
  }

  if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
  return [];
}

/**
 * ✅ createSignedUrl expects bucket-relative PATH (not full URL)
 * We store paths in ReceivedStock like: `${receiptId}/${user.id}/...jpg`
 * If older data stored full URL, this tries best to extract path.
 */
function extractWaybillPath(urlOrPath: string): string {
  const s = (urlOrPath || '').trim();
  if (!s) return '';
  if (!s.startsWith('http')) return s;

  const idx = s.toLowerCase().indexOf('/waybills/');
  if (idx >= 0) return s.slice(idx + '/waybills/'.length);

  const idx2 = s.toLowerCase().indexOf('/object/');
  if (idx2 >= 0) {
    const after = s.slice(idx2 + '/object/'.length);
    const lower = after.toLowerCase();
    const b = 'waybills/';
    const bIdx = lower.indexOf(b);
    if (bIdx >= 0) return after.slice(bIdx + b.length);
  }

  return s; // fallback (likely won't sign)
}

function isLikelyImageUrl(url?: string | null) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes('.png') || u.includes('.jpg') || u.includes('.jpeg') || u.includes('.webp') || u.includes('image');
}

async function imageUrlToDataUrl(
  url: string
): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;

    const blob = await res.blob();
    const mime = (blob.type || '').toLowerCase();

    const format: 'PNG' | 'JPEG' =
      mime.includes('png') || url.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return { dataUrl, format };
  } catch {
    return null;
  }
}

// ✅ get real image dimensions (for correct scaling in PDF)
async function getImageNaturalSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });
    const w = Number(img.naturalWidth || img.width || 0);
    const h = Number(img.naturalHeight || img.height || 0);
    if (!w || !h) return null;
    return { w, h };
  } catch {
    return null;
  }
}

// ✅ fit image into a box (keeps aspect ratio)
function fitIntoBox(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number
): { w: number; h: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return { w: Math.max(1, imgW * scale), h: Math.max(1, imgH * scale) };
}

export default function StockApprovals() {
  const { toast } = useToast();
  const { user } = useAuth(); // route admin-only; DB RLS also enforces

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReceiptStatus>('pending');
  const [search, setSearch] = useState('');
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // name maps
  const [userNameMap, setUserNameMap] = useState<Map<string, string>>(new Map());

  // audit map
  const [auditMap, setAuditMap] = useState<Map<string, AuditRow[]>>(new Map());

  // reject dialog
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // per-receipt processing state
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // ✅ Waybill viewer dialog (private bucket signed URLs + carousel)
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
      const signed: string[] = [];

      for (const u of raw) {
        const path = extractWaybillPath(u);
        if (!path || path.startsWith('http')) continue;

        const { data, error } = await supabase.storage.from('waybills').createSignedUrl(path, 3600);
        if (!error && data?.signedUrl) signed.push(data.signedUrl);
      }

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

  const fetchReceipts = async () => {
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
              product:products (
                id,
                name,
                sku,
                unit,
                quantity_in_stock
              )
            )
          `
        )
        .eq('status', tab)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as ReceiptRow[];
      setReceipts(rows);

      const ids = new Set<string>();
      rows.forEach((r) => {
        if (r.created_by) ids.add(r.created_by);
        if (r.approved_by) ids.add(String(r.approved_by));
        if (r.rejected_by) ids.add(String(r.rejected_by));
      });

      if (ids.size > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', Array.from(ids));

        if (!pErr && profiles) {
          const m = new Map<string, string>();
          profiles.forEach((p) => m.set(p.user_id, p.full_name));
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
        description: e?.message || 'Failed to load approvals',
        variant: 'destructive',
      });
      setReceipts([]);
      setUserNameMap(new Map());
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditForReceipt = async (receiptId: string) => {
    try {
      const { data, error } = await supabase
        .from('warehouse_receipt_audit' as any)
        .select('id, receipt_id, action, from_status, to_status, actor_id, note, created_at')
        .eq('receipt_id', receiptId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as AuditRow[];
      setAuditMap((prev) => {
        const next = new Map(prev);
        next.set(receiptId, rows);
        return next;
      });

      // Fetch missing actor names
      const actorIds = new Set<string>();
      rows.forEach((a) => a.actor_id && actorIds.add(a.actor_id));

      const missing = Array.from(actorIds).filter((id) => !userNameMap.has(id));
      if (missing.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', missing);

        if (profiles && profiles.length > 0) {
          setUserNameMap((prev) => {
            const next = new Map(prev);
            profiles.forEach((p) => next.set(p.user_id, p.full_name));
            return next;
          });
        }
      }
    } catch {
      // audit optional
    }
  };

  useEffect(() => {
    fetchReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // realtime refresh
  useEffect(() => {
    const ch1 = supabase
      .channel('admin-warehouse-receipts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_receipts' }, () =>
        fetchReceipts()
      )
      .subscribe();

    const ch2 = supabase
      .channel('admin-warehouse-receipt-items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_receipt_items' }, () =>
        fetchReceipts()
      )
      .subscribe();

    const ch3 = supabase
      .channel('admin-warehouse-receipt-audit-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_receipt_audit' }, (payload) => {
        const rid = (payload?.new as any)?.receipt_id;
        if (rid) fetchAuditForReceipt(rid);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const toggleExpand = (id: string) => {
    const willOpen = !expanded.has(id);

    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    if (willOpen) fetchAuditForReceipt(id);
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return receipts;

    return receipts.filter((r) => {
      const car = (r.car_number || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      const creator = (userNameMap.get(r.created_by) || '').toLowerCase();
      const itemsText =
        (r.items || [])
          .map((it) => it.product?.name || '')
          .join(' ')
          .toLowerCase() || '';

      return car.includes(s) || notes.includes(s) || creator.includes(s) || itemsText.includes(s);
    });
  }, [receipts, search, userNameMap]);

  const totals = useMemo(() => {
    const receiptCount = filtered.length;
    const linesCount = filtered.reduce((sum, r) => sum + (r.items?.length || 0), 0);
    const qtyTotal = filtered.reduce(
      (sum, r) => sum + (r.items || []).reduce((s2, it) => s2 + Number(it.quantity || 0), 0),
      0
    );
    return { receiptCount, linesCount, qtyTotal };
  }, [filtered]);

  const setProcessing = (id: string, on: boolean) => {
    setProcessingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const approveReceipt = async (receiptId: string) => {
    if (!user) return;

    setProcessing(receiptId, true);
    try {
      const { error } = await supabase
        .from('warehouse_receipts' as any)
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', receiptId)
        .eq('status', 'pending');

      if (error) throw error;

      toast({
        title: 'Approved ✅',
        description: 'Receipt approved. Stock should increase automatically (trigger).',
      });

      fetchReceipts();
      fetchAuditForReceipt(receiptId);
    } catch (e: any) {
      toast({
        title: 'Approve failed',
        description: e?.message || 'Could not approve receipt',
        variant: 'destructive',
      });
    } finally {
      setProcessing(receiptId, false);
    }
  };

  const openReject = (receiptId: string) => {
    setRejectingId(receiptId);
    setRejectReason('');
    setRejectOpen(true);
  };

  const rejectReceipt = async () => {
    if (!user || !rejectingId) return;

    const receiptId = rejectingId;
    setProcessing(receiptId, true);

    try {
      const payload: any = {
        status: 'rejected',
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectReason.trim() ? rejectReason.trim() : null,
      };

      const { error } = await supabase
        .from('warehouse_receipts' as any)
        .update(payload)
        .eq('id', receiptId)
        .eq('status', 'pending');

      if (error) throw error;

      toast({
        title: 'Rejected',
        description: rejectReason.trim() ? 'Receipt rejected with reason saved.' : 'Receipt rejected.',
      });

      setRejectOpen(false);
      setRejectingId(null);
      setRejectReason('');
      fetchReceipts();
      fetchAuditForReceipt(receiptId);
    } catch (e: any) {
      toast({
        title: 'Reject failed',
        description: e?.message || 'Could not reject receipt',
        variant: 'destructive',
      });
    } finally {
      setProcessing(receiptId, false);
    }
  };

  const statusBadge = (s: ReceiptStatus) => {
    if (s === 'pending') return <Badge className="bg-yellow-500">Pending</Badge>;
    if (s === 'approved') return <Badge className="bg-green-500">Approved</Badge>;
    return <Badge className="bg-red-500">Rejected</Badge>;
  };

  // -----------------------------
  // PDF EXPORT (Admin) — nicer layout + correct image scaling
  // -----------------------------
  const exportReceiptPdf = async (r: ReceiptRow, includeAudit: boolean) => {
    let audit = auditMap.get(r.id) || [];

    if (includeAudit && audit.length === 0) {
      try {
        const { data } = await supabase
          .from('warehouse_receipt_audit' as any)
          .select('id, receipt_id, action, from_status, to_status, actor_id, note, created_at')
          .eq('receipt_id', r.id)
          .order('created_at', { ascending: false });

        audit = (data ?? []) as unknown as AuditRow[];
        setAuditMap((prev) => {
          const next = new Map(prev);
          next.set(r.id, audit);
          return next;
        });
      } catch {
        // ignore
      }
    }

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const brand = 'Philuz Appz';
    const createdBy = userNameMap.get(r.created_by) || 'Unknown';
    const approvedBy = r.approved_by ? userNameMap.get(String(r.approved_by)) || 'Unknown' : '';
    const rejectedBy = r.rejected_by ? userNameMap.get(String(r.rejected_by)) || 'Unknown' : '';

    // Header (clean + compact)
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(`${brand} — Stock Receipt`, 40, 42);

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 60);

    // Status chip
    const statusText = safeUpper(r.status);
    let chipColor: [number, number, number] = [245, 158, 11];
    if (r.status === 'approved') chipColor = [34, 197, 94];
    if (r.status === 'rejected') chipColor = [239, 68, 68];

    doc.setFillColor(...chipColor);
    doc.roundedRect(440, 28, 120, 22, 10, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(statusText, 500, 43, { align: 'center' });

    // Meta block
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);

    const leftX = 40;
    const rightX = 320;
    let y = 86;

    doc.text(`Car Number: ${r.car_number}`, leftX, y);
    doc.text(`Captured At: ${fmtDate(r.created_at)}`, leftX, y + 16);
    doc.text(`Captured By: ${createdBy}`, leftX, y + 32);

    if (r.notes) {
      doc.setTextColor(71, 85, 105);
      doc.text(`Notes: ${r.notes}`, leftX, y + 52, { maxWidth: 520 });
      doc.setTextColor(15, 23, 42);
      y += 18;
    }

    // Decision info (right column)
    if (r.status === 'approved') {
      doc.text(`Approved By: ${approvedBy}`, rightX, 86);
      doc.text(`Approved At: ${fmtDate(r.approved_at)}`, rightX, 102);
    } else if (r.status === 'rejected') {
      doc.text(`Rejected By: ${rejectedBy}`, rightX, 86);
      doc.text(`Rejected At: ${fmtDate(r.rejected_at)}`, rightX, 102);
      doc.setTextColor(185, 28, 28);
      doc.text(`Reason: ${r.rejection_reason || '—'}`, rightX, 118, { maxWidth: 240 });
      doc.setTextColor(15, 23, 42);
    } else {
      doc.setTextColor(71, 85, 105);
      doc.text(`Pending approval`, rightX, 86);
      doc.setTextColor(15, 23, 42);
    }

    // Items table
    const items = r.items || [];
    const body = items.map((it) => {
      const p = it.product;
      const current = Number(p?.quantity_in_stock || 0);
      const qty = Number(it.quantity || 0);
      const after = current + qty;

      return [
        p?.name || 'Unknown product',
        p?.sku || '-',
        p?.unit || '-',
        qty.toLocaleString(),
        current.toLocaleString(),
        after.toLocaleString(),
      ];
    });

    autoTable(doc, {
      startY: 170,
      head: [['Product', 'SKU', 'Unit', 'Qty Received', 'Current Stock', 'After Approval']],
      body: body.length ? body : [['—', '—', '—', '—', '—', '—']],
      styles: { fontSize: 9, cellPadding: 4 },
      margin: { left: 40, right: 40 },
      headStyles: { fillColor: [30, 41, 59] as any },
      columnStyles: {
        3: { halign: 'right', cellWidth: 70 },
        4: { halign: 'right', cellWidth: 80 },
        5: { halign: 'right', cellWidth: 90 },
      },
    });

    y = (doc as any).lastAutoTable?.finalY || 250;

    // ✅ Waybill images (embedded, smaller + clean like your MyReceipts)
    // We embed up to 2 images as “previews”. If you want more, we can add a new page grid.
    const rawWaybills = normalizeWaybillUrls(r.waybill_urls);

    if (rawWaybills.length > 0) {
      // create signed urls (private bucket)
      const signed: string[] = [];
      for (const u of rawWaybills.slice(0, 2)) {
        const path = extractWaybillPath(u);
        if (!path || path.startsWith('http')) continue;

        const { data } = await supabase.storage.from('waybills').createSignedUrl(path, 3600);
        if (data?.signedUrl) signed.push(data.signedUrl);
      }

      if (signed.length > 0) {
        // section title
        y += 26;
        if (y > 700) {
          doc.addPage();
          y = 60;
        }

        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`Waybill Images (Embedded)`, 40, y);

        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(`Showing ${signed.length} of ${rawWaybills.length} (signed links expire ~1 hour)`, 40, y + 14);

        y += 26;

        // layout boxes (two columns)
        const boxW = 250;
        const boxH = 180;
        const gap = 20;

        for (let i = 0; i < signed.length; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);

          const x = 40 + col * (boxW + gap);
          const top = y + row * (boxH + 26);

          if (top + boxH > 770) {
            doc.addPage();
            y = 60;
          }

          // draw box
          doc.setDrawColor(203, 213, 225);
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(x, top, boxW, boxH, 10, 10, 'FD');

          const imgInfo = await imageUrlToDataUrl(signed[i]);
          if (imgInfo) {
            const natural = await getImageNaturalSize(imgInfo.dataUrl);
            const nW = natural?.w || 1000;
            const nH = natural?.h || 700;
            const fitted = fitIntoBox(nW, nH, boxW - 16, boxH - 16);

            const ix = x + (boxW - fitted.w) / 2;
            const iy = top + (boxH - fitted.h) / 2;

            try {
              doc.addImage(imgInfo.dataUrl, imgInfo.format, ix, iy, fitted.w, fitted.h, undefined, 'FAST');
            } catch {
              // ignore embed failure
            }
          } else {
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(10);
            doc.text('Could not embed image', x + boxW / 2, top + boxH / 2, { align: 'center' });
          }

          // caption
          doc.setTextColor(71, 85, 105);
          doc.setFontSize(9);
          doc.text(`Waybill ${i + 1}`, x, top + boxH + 16);
        }

        // update y after image block
        const rowsUsed = Math.ceil(signed.length / 2);
        y = y + rowsUsed * (boxH + 26) + 8;
      } else {
        // still show that there is a waybill
        y += 26;
        if (y > 760) {
          doc.addPage();
          y = 60;
        }
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        doc.text(`Waybill: ${rawWaybills.length} file(s) attached (signing failed for embed)`, 40, y);
        y += 10;
      }
    }

    // Audit (optional)
    if (includeAudit) {
      const auditRows = (audit || []).slice(0, 12).map((a) => [
        fmtDate(a.created_at),
        a.action,
        a.from_status || '—',
        a.to_status || '—',
        a.actor_id ? userNameMap.get(a.actor_id) || 'Unknown' : '—',
        a.note || '',
      ]);

      y += 20;
      if (y > 720) {
        doc.addPage();
        y = 60;
      }

      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Audit Log (latest)', 40, y);

      autoTable(doc, {
        startY: y + 10,
        head: [['When', 'Action', 'From', 'To', 'By', 'Note']],
        body: auditRows.length ? auditRows : [['—', 'No audit entries', '—', '—', '—', '—']],
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { left: 40, right: 40 },
        headStyles: { fillColor: [15, 23, 42] as any },
        columnStyles: {
          0: { cellWidth: 95 },
          1: { cellWidth: 85 },
          2: { cellWidth: 55 },
          3: { cellWidth: 55 },
          4: { cellWidth: 75 },
          5: { cellWidth: 'auto' },
        },
      });

      y = (doc as any).lastAutoTable?.finalY || y + 70;
    }

    // Signatures (simple + neat)
    y += 26;
    if (y > 750) {
      doc.addPage();
      y = 60;
    }

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);

    doc.text('Prepared By (Warehouse):', 40, y);
    doc.setTextColor(71, 85, 105);
    doc.text(`${createdBy}`, 40, y + 14);
    doc.text('Signature: ___________________________', 40, y + 34);
    doc.text(`Date: ${fmtDate(r.created_at)}`, 40, y + 54);

    doc.setTextColor(15, 23, 42);
    doc.text('Reviewed / Approved By (Admin):', 320, y);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${r.status === 'approved' ? approvedBy : r.status === 'rejected' ? rejectedBy : '________________'}`,
      320,
      y + 14
    );
    doc.text('Signature: ___________________________', 320, y + 34);
    doc.text(
      `Date: ${
        r.status === 'approved'
          ? fmtDate(r.approved_at)
          : r.status === 'rejected'
            ? fmtDate(r.rejected_at)
            : '________________'
      }`,
      320,
      y + 54
    );

    // Footer
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${brand} • Generated: ${new Date().toLocaleString()}`, 40, 820);

    const filename = `StockReceipt-${r.car_number}-${r.status}${includeAudit ? '-audit' : ''}.pdf`;
    forceDownloadPdf(doc, filename);
  };

  const exportFilteredPdf = () => {
    if (filtered.length === 0) {
      toast({ title: 'Nothing to export', description: 'No receipts in this view.' });
      return;
    }

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const brand = 'Philuz Appz';

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`${brand} — Stock Receipts Export`, 40, 40);
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Tab: ${tab.toUpperCase()} • Exported: ${new Date().toLocaleString()}`, 40, 60);

    const body = filtered.map((r) => {
      const createdBy = userNameMap.get(r.created_by) || 'Unknown';
      const qtyTotal = (r.items || []).reduce((sum, it) => sum + Number(it.quantity || 0), 0);
      const wb = normalizeWaybillUrls(r.waybill_urls).length;
      return [
        r.car_number,
        createdBy,
        fmtDate(r.created_at),
        (r.items?.length || 0).toString(),
        qtyTotal.toLocaleString(),
        r.status.toUpperCase(),
        wb > 0 ? `YES (${wb})` : 'NO',
      ];
    });

    autoTable(doc, {
      startY: 80,
      head: [['Car #', 'Captured By', 'Captured At', 'Lines', 'Total Qty', 'Status', 'Waybill']],
      body,
      styles: { fontSize: 9 },
      margin: { left: 40, right: 40 },
      headStyles: { fillColor: [30, 41, 59] as any },
    });

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${brand}`, 40, 820);

    const filename = `StockReceipts-${tab}-${new Date().toISOString().slice(0, 10)}.pdf`;
    forceDownloadPdf(doc, filename);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Approvals</h1>
          <p className="text-slate-400">
            Brand: <b>Philuz Appz</b> • Review warehouse receiving before approving stock updates
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={exportFilteredPdf} title="Export current view to PDF">
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>

          <Button variant="ghost" size="icon" onClick={fetchReceipts} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === 'pending' ? 'default' : 'outline'} onClick={() => setTab('pending')}>
          <Clock className="h-4 w-4 mr-2" />
          Pending
        </Button>
        <Button variant={tab === 'approved' ? 'default' : 'outline'} onClick={() => setTab('approved')}>
          <CheckCircle className="h-4 w-4 mr-2" />
          Approved
        </Button>
        <Button variant={tab === 'rejected' ? 'default' : 'outline'} onClick={() => setTab('rejected')}>
          <XCircle className="h-4 w-4 mr-2" />
          Rejected
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Search</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <Label className="text-slate-300">Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Car number, staff name, notes, product..."
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="text-sm text-slate-400">
            Receipts: <b className="text-white">{totals.receiptCount}</b> • Lines:{' '}
            <b className="text-white">{totals.linesCount}</b> • Total Qty:{' '}
            <b className="text-white">{totals.qtyTotal.toLocaleString()}</b>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {tab.charAt(0).toUpperCase() + tab.slice(1)} Receipts ({filtered.length})
          </CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Car #</TableHead>
                <TableHead className="text-slate-400">Captured By</TableHead>
                <TableHead className="text-slate-400">Captured At</TableHead>
                <TableHead className="text-slate-400">Items</TableHead>
                <TableHead className="text-slate-400">Total Qty</TableHead>
                <TableHead className="text-slate-400">Waybill</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-400 py-10">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-400 py-10">
                    No receipts found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const isOpen = expanded.has(r.id);
                  const totalQty = (r.items || []).reduce((sum, it) => sum + Number(it.quantity || 0), 0);
                  const creatorName = userNameMap.get(r.created_by) || 'Unknown';
                  const busy = processingIds.has(r.id);
                  const audit = auditMap.get(r.id) || [];
                  const waybillCount = normalizeWaybillUrls(r.waybill_urls).length;

                  return (
                    <Fragment key={r.id}>
                      <TableRow className="border-slate-700">
                        <TableCell className="text-white font-medium">
                          <button
                            type="button"
                            onClick={() => toggleExpand(r.id)}
                            className="inline-flex items-center gap-2 hover:underline"
                            title="Expand receipt details"
                          >
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            )}
                            {r.car_number}
                          </button>
                        </TableCell>

                        <TableCell className="text-slate-300">{creatorName}</TableCell>
                        <TableCell className="text-slate-300">{fmtDate(r.created_at)}</TableCell>
                        <TableCell className="text-slate-300">{r.items?.length || 0}</TableCell>
                        <TableCell className="text-slate-300">{Number(totalQty).toLocaleString()}</TableCell>

                        <TableCell className="text-slate-300">
                          {waybillCount > 0 ? (
                            <div className="inline-flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openWaybillsForReceipt(r, 0)}
                                title="View waybill"
                              >
                                <ImageIcon className="h-4 w-4 mr-2" />
                                View ({waybillCount})
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">None</span>
                          )}
                        </TableCell>

                        <TableCell>{statusBadge(r.status)}</TableCell>

                        <TableCell className="text-right">
                          <div className="inline-flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => exportReceiptPdf(r, false)} title="Export to PDF">
                              PDF
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => exportReceiptPdf(r, true)}
                              title="Export to PDF with Audit Log"
                            >
                              PDF + Audit
                            </Button>

                            {r.status === 'pending' ? (
                              <>
                                <Button size="sm" onClick={() => approveReceipt(r.id)} disabled={busy}>
                                  {busy ? 'Working...' : 'Approve'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openReject(r.id)} disabled={busy}>
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 self-center">No action</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="border-slate-700">
                          <TableCell colSpan={9} className="p-0">
                            <div className="bg-slate-900/40 border-t border-slate-700 p-4 space-y-4">
                              {/* Notes + decision info */}
                              <div className="grid md:grid-cols-2 gap-3">
                                <div className="text-sm text-slate-300">
                                  <span className="text-slate-400">Notes:</span>{' '}
                                  {r.notes || <span className="text-slate-500">No notes</span>}
                                </div>

                                <div className="text-sm text-slate-300">
                                  {r.status === 'approved' && (
                                    <>
                                      <span className="text-slate-400">Approved By:</span>{' '}
                                      {r.approved_by ? userNameMap.get(String(r.approved_by)) || 'Unknown' : '—'}
                                      <br />
                                      <span className="text-slate-400">Approved At:</span> {fmtDate(r.approved_at)}
                                    </>
                                  )}

                                  {r.status === 'rejected' && (
                                    <>
                                      <span className="text-slate-400">Rejected By:</span>{' '}
                                      {r.rejected_by ? userNameMap.get(String(r.rejected_by)) || 'Unknown' : '—'}
                                      <br />
                                      <span className="text-slate-400">Rejected At:</span> {fmtDate(r.rejected_at)}
                                      <br />
                                      <span className="text-slate-400">Reason:</span> {r.rejection_reason || '—'}
                                    </>
                                  )}

                                  {r.status === 'pending' && (
                                    <span className="text-slate-400">
                                      Pending approval — stock updates only after approve.
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Waybill (expanded) */}
                              <div className="rounded-md border border-slate-700 bg-slate-950/30 p-3">
                                <div className="text-sm text-white font-semibold mb-2">Waybill</div>
                                {waybillCount > 0 ? (
                                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                    <div className="text-xs text-slate-300">
                                      Attached images: <b className="text-white">{waybillCount}</b>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => openWaybillsForReceipt(r, 0)}>
                                        <ImageIcon className="h-4 w-4 mr-2" />
                                        Preview
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-500">No waybill attached (optional).</div>
                                )}
                              </div>

                              {/* Items table */}
                              <div className="rounded-md border border-slate-700 overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-slate-700">
                                      <TableHead className="text-slate-400">Product</TableHead>
                                      <TableHead className="text-slate-400">SKU</TableHead>
                                      <TableHead className="text-slate-400">Unit</TableHead>
                                      <TableHead className="text-slate-400 text-right">Qty Received</TableHead>
                                      <TableHead className="text-slate-400 text-right">Current Stock</TableHead>
                                      <TableHead className="text-slate-400 text-right">After Approval (Preview)</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(r.items || []).map((it) => {
                                      const p = it.product;
                                      const current = Number(p?.quantity_in_stock || 0);
                                      const qty = Number(it.quantity || 0);
                                      const after = current + qty;

                                      return (
                                        <TableRow key={it.id} className="border-slate-700">
                                          <TableCell className="text-white font-medium">
                                            {p?.name || 'Unknown product'}
                                          </TableCell>
                                          <TableCell className="text-slate-300">{p?.sku || '-'}</TableCell>
                                          <TableCell className="text-slate-300">{p?.unit || '-'}</TableCell>
                                          <TableCell className="text-slate-300 text-right">{qty.toLocaleString()}</TableCell>
                                          <TableCell className="text-slate-300 text-right">{current.toLocaleString()}</TableCell>
                                          <TableCell className="text-slate-300 text-right">{after.toLocaleString()}</TableCell>
                                        </TableRow>
                                      );
                                    })}

                                    {(r.items || []).length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={6} className="text-center text-slate-400 py-6">
                                          No items found for this receipt.
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>

                              {/* Audit preview */}
                              <div className="rounded-md border border-slate-700 bg-slate-950/30 p-3">
                                <div className="text-sm text-white font-semibold mb-2">Audit Log</div>

                                {audit.length === 0 ? (
                                  <div className="text-xs text-slate-500">No audit entries yet.</div>
                                ) : (
                                  <div className="space-y-2">
                                    {audit.slice(0, 8).map((a) => (
                                      <div
                                        key={a.id}
                                        className="text-xs text-slate-300 flex flex-col md:flex-row md:items-center md:justify-between gap-1 border-b border-slate-800 pb-2"
                                      >
                                        <div>
                                          <span className="text-slate-400">{fmtDate(a.created_at)}</span> •{' '}
                                          <span className="text-white">{a.action}</span>{' '}
                                          {a.from_status || a.to_status ? (
                                            <span className="text-slate-400">
                                              ({a.from_status || '—'} → {a.to_status || '—'})
                                            </span>
                                          ) : null}
                                          {a.note ? <span className="text-slate-400"> • {a.note}</span> : null}
                                        </div>

                                        <div className="text-slate-400">
                                          By: {a.actor_id ? userNameMap.get(a.actor_id) || 'Unknown' : '—'}
                                        </div>
                                      </div>
                                    ))}

                                    {audit.length > 8 && (
                                      <div className="text-[11px] text-slate-500">Showing latest 8 entries.</div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="text-xs text-slate-500">
                                Approval increases stock automatically (via DB trigger). Use “PDF + Audit” for full history.
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

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Reject Receipt</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-slate-200">Reason (optional)</Label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. wrong car number, wrong quantities, duplicate..."
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <p className="text-xs text-slate-400">
              This will mark the receipt as <b>Rejected</b>. Stock will not increase.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button onClick={rejectReceipt} className="bg-red-600 hover:bg-red-700">
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waybill viewer dialog */}
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

              <div className="flex justify-end">
                <a
                  href={waybillActiveUrls[waybillActiveIndex]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs text-slate-300 hover:text-white"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open current image
                </a>
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
