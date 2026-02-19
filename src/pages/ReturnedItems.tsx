import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { FileCheck, Search } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';

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
  sale_item?: {
    quantity: number;
    product?: { name: string; sku: string };
  };
  initiator?: { full_name: string };
  approver?: { full_name: string };
}

type GroupedReturn = {
  sale_id: string;
  receipt_number: string;
  customer_name: string | null;
  created_at: string; // latest created_at in the group
  status: 'pending' | 'approved' | 'rejected' | 'mixed';
  total_qty: number;
  items: { name: string; sku?: string; qty: number }[];
  reasons: string[];
  initiator_name: string | null;
  approver_name: string | null;
};

type ExportScope = 'summary' | 'items' | 'both';

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

export default function ReturnedItems() {
  const { toast } = useToast();
  const { profile, activeBranchId } = useAuth();

  const [returns, setReturns] = useState<ReturnWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // ✅ date range filter (yyyy-mm-dd)
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // ✅ expand/collapse receipt rows to show all items
  const [expandedSaleIds, setExpandedSaleIds] = useState<Set<string>>(new Set());

  // ✅ export scope (summary only vs items only vs both)
  const [exportScope, setExportScope] = useState<ExportScope>('both');

  // ✅ company/branch (for branded PDF header)
  const [company, setCompany] = useState<CompanyMini | null>(null);
  const [branch, setBranch] = useState<BranchMini | null>(null);

  useEffect(() => {
    const companyId = (profile as any)?.company_id ?? null;
    if (!companyId) {
      setCompany(null);
      setBranch(null);
      return;
    }

    (async () => {
      try {
        const { data: c, error: cErr } = await (supabase as any)
          .from('companies')
          .select('id,name,address,phone,email,tax_id,receipt_footer,logo_url')
          .eq('id', companyId)
          .maybeSingle();

        if (cErr) throw cErr;
        setCompany((c as CompanyMini) || null);

        const bId = activeBranchId || (profile as any)?.branch_id || null;
        if (!bId) {
          setBranch(null);
          return;
        }

        const { data: b, error: bErr } = await (supabase as any)
          .from('branches')
          .select('id,name,address,phone,email')
          .eq('id', bId)
          .maybeSingle();

        if (bErr) throw bErr;
        setBranch((b as BranchMini) || null);
      } catch {
        setCompany(null);
        setBranch(null);
      }
    })();
  }, [(profile as any)?.company_id, activeBranchId]);

  useEffect(() => {
    // initial fetch
    fetchReturns();

    // realtime subscription: refresh list when returns change
    const channel = supabase
      .channel('returned-items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'returns' }, () => {
        fetchReturns();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo]);

  const fetchReturns = async () => {
    setLoading(true);

    let query = supabase
      .from('returns')
      .select(
        `
        *,
        sale:sales(receipt_number, customer_name),
        sale_item:sale_items(quantity, product:products(name, sku))
      `
      )
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    // ✅ date filtering on created_at
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // Fetch initiator and approver names
    const initiatorIds = [...new Set((data || []).map((d) => d.initiated_by).filter(Boolean))] as string[];
    const approverIds = [...new Set((data || []).map((d) => d.approved_by).filter(Boolean))] as string[];
    const allUserIds = [...new Set([...initiatorIds, ...approverIds])];

    let profileMap = new Map<string, string>();
    if (allUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', allUserIds);

      if (!profilesError && profiles) {
        profileMap = new Map(profiles.map((p) => [p.user_id, p.full_name]));
      }
    }

    const enrichedData = (data || []).map((ret) => ({
      ...ret,
      initiator: ret.initiated_by ? { full_name: profileMap.get(ret.initiated_by) || 'Unknown' } : undefined,
      approver: ret.approved_by ? { full_name: profileMap.get(ret.approved_by) || 'Unknown' } : undefined,
    }));

    setReturns(enrichedData as ReturnWithDetails[]);
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500">Pending</Badge>;
      case 'approved':
        return <Badge className="bg-green-500">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500">Rejected</Badge>;
      case 'mixed':
        return <Badge className="bg-slate-500">Mixed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // ✅ GROUP RETURNS BY SALE (COUPON) so it looks like full receipt return
  const groupedReturns: GroupedReturn[] = useMemo(() => {
    const map = new Map<string, ReturnWithDetails[]>();

    for (const r of returns) {
      if (!map.has(r.sale_id)) map.set(r.sale_id, []);
      map.get(r.sale_id)!.push(r);
    }

    const result: GroupedReturn[] = [];

    for (const [sale_id, list] of map.entries()) {
      // sort newest first
      const sorted = [...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

      const receipt_number = sorted[0]?.sale?.receipt_number || sale_id.slice(0, 8);
      const customer_name = sorted[0]?.sale?.customer_name || null;

      // status logic:
      const statuses = new Set(sorted.map((r) => r.status));
      let status: GroupedReturn['status'] = 'mixed';
      if (statuses.has('pending')) status = 'pending';
      else if (statuses.size === 1 && statuses.has('approved')) status = 'approved';
      else if (statuses.size === 1 && statuses.has('rejected')) status = 'rejected';
      else if (statuses.has('approved') && !statuses.has('pending') && !statuses.has('rejected')) status = 'approved';
      else if (statuses.has('rejected') && !statuses.has('pending') && !statuses.has('approved')) status = 'rejected';

      // items aggregation
      const itemMap = new Map<string, { name: string; sku?: string; qty: number }>();
      let total_qty = 0;
      const reasons: string[] = [];

      for (const r of sorted) {
        const name = r.sale_item?.product?.name || 'Unknown item';
        const sku = r.sale_item?.product?.sku;
        const key = `${name}__${sku || ''}`;

        total_qty += Number(r.quantity || 0);
        if (r.reason) reasons.push(r.reason);

        if (!itemMap.has(key)) itemMap.set(key, { name, sku, qty: 0 });
        itemMap.get(key)!.qty += Number(r.quantity || 0);
      }

      const items = Array.from(itemMap.values());

      // initiator/approver: show latest known (from newest row)
      const initiator_name = sorted.find((r) => r.initiator?.full_name)?.initiator?.full_name || null;

      const approver_name = sorted.find((r) => r.approver?.full_name)?.approver?.full_name || null;

      result.push({
        sale_id,
        receipt_number,
        customer_name,
        created_at: sorted[0]?.created_at || '',
        status,
        total_qty,
        items,
        reasons,
        initiator_name,
        approver_name,
      });
    }

    // newest receipts first
    return result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [returns]);

  const filteredGroupedReturns = useMemo(() => {
    if (!search.trim()) return groupedReturns;

    const s = search.toLowerCase();

    return groupedReturns.filter((gr) => {
      const itemsText = gr.items.map((i) => i.name).join(' ').toLowerCase();
      const receipt = (gr.receipt_number || '').toLowerCase();
      const customer = (gr.customer_name || '').toLowerCase();
      const initiator = (gr.initiator_name || '').toLowerCase();

      return receipt.includes(s) || customer.includes(s) || itemsText.includes(s) || initiator.includes(s);
    });
  }, [groupedReturns, search]);

  const stamp = new Date().toISOString().slice(0, 10);

  const buildSummaryRows = () =>
    filteredGroupedReturns.map((gr) => ({
      receipt_number: gr.receipt_number,
      customer_name: gr.customer_name || '',
      status: gr.status,
      total_qty: gr.total_qty,
      items_count: gr.items.length,
      items: gr.items
        .map((it) => `${it.name}${it.sku ? ` (${it.sku})` : ''} x${it.qty}`)
        .join(' | '),
      reason: gr.reasons.length === 0 ? '' : gr.reasons.length === 1 ? gr.reasons[0] : 'Multiple reasons',
      initiated_by: gr.initiator_name || '',
      approved_by: gr.approver_name || '',
      created_at: gr.created_at || '',
    }));

  const buildItemRows = () => {
    const rows: Record<string, any>[] = [];
    filteredGroupedReturns.forEach((gr) => {
      gr.items.forEach((it) => {
        rows.push({
          receipt_number: gr.receipt_number,
          customer_name: gr.customer_name || '',
          status: gr.status,
          product_name: it.name,
          sku: it.sku || '',
          qty_returned: it.qty,
          initiated_by: gr.initiator_name || '',
          approved_by: gr.approver_name || '',
          created_at: gr.created_at || '',
        });
      });
    });
    return rows;
  };

  // ✅ Export Excel - creates up to 2 sheets depending on exportScope
  // NOTE: requires installing: npm i xlsx
  const exportExcel = async () => {
    if (!filteredGroupedReturns || filteredGroupedReturns.length === 0) {
      toast({ title: 'Nothing to export', description: 'No rows match your filters.' });
      return;
    }

    try {
      const XLSX = await import('xlsx');

      const wb = XLSX.utils.book_new();

      if (exportScope === 'summary' || exportScope === 'both') {
        const wsSummary = XLSX.utils.json_to_sheet(buildSummaryRows());
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      }

      if (exportScope === 'items' || exportScope === 'both') {
        const wsItems = XLSX.utils.json_to_sheet(buildItemRows());
        XLSX.utils.book_append_sheet(wb, wsItems, 'Items');
      }

      XLSX.writeFile(wb, `returned-receipts-${exportScope}-${stamp}.xlsx`);

      toast({
        title: 'Export complete',
        description:
          exportScope === 'both'
            ? 'Downloaded Excel file with 2 sheets (Summary + Items).'
            : `Downloaded Excel file (${exportScope}).`,
      });
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description:
          'Could not export Excel. Make sure "xlsx" is installed (npm i xlsx). ' + (e?.message ? `\n${e.message}` : ''),
        variant: 'destructive',
      });
    }
  };

  // ✅ CSV export respecting exportScope
  const exportCSV = () => {
    if (!filteredGroupedReturns || filteredGroupedReturns.length === 0) {
      toast({ title: 'Nothing to export', description: 'No rows match your filters.' });
      return;
    }

    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const download = (filename: string, headers: string[], rows: Record<string, any>[]) => {
      const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(','))].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
    };

    const summaryHeaders = [
      'receipt_number',
      'customer_name',
      'status',
      'total_qty',
      'items_count',
      'items',
      'reason',
      'initiated_by',
      'approved_by',
      'created_at',
    ];

    const itemHeaders = [
      'receipt_number',
      'customer_name',
      'status',
      'product_name',
      'sku',
      'qty_returned',
      'initiated_by',
      'approved_by',
      'created_at',
    ];

    if (exportScope === 'summary') {
      download(`returned-receipts-summary-${stamp}.csv`, summaryHeaders, buildSummaryRows());
      toast({ title: 'Export complete', description: 'Downloaded summary CSV.' });
      return;
    }

    if (exportScope === 'items') {
      download(`returned-receipts-items-${stamp}.csv`, itemHeaders, buildItemRows());
      toast({ title: 'Export complete', description: 'Downloaded items CSV.' });
      return;
    }

    // both
    download(`returned-receipts-summary-${stamp}.csv`, summaryHeaders, buildSummaryRows());
    download(`returned-receipts-items-${stamp}.csv`, itemHeaders, buildItemRows());
    toast({
      title: 'Export complete',
      description: 'Downloaded 2 CSV files (summary + items).',
    });
  };

  // ✅ PDF export respecting exportScope (Summary only / Items only / Both)
  // NOTE: requires installing: npm i jspdf jspdf-autotable
  // IMPORTANT: In Vite/ESM, use autoTable(doc, ...) NOT doc.autoTable(...)
  const exportPDF = async () => {
    if (!filteredGroupedReturns || filteredGroupedReturns.length === 0) {
      toast({ title: 'Nothing to export', description: 'No rows match your filters.' });
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDFMod: any = await import('jspdf');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autoTableMod: any = await import('jspdf-autotable');

      const JsPDF = jsPDFMod?.default || jsPDFMod?.jsPDF;
      const autoTable = autoTableMod?.default || autoTableMod;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;

      const reportTitle = `Returned Receipts`;
      const scopeTitle =
        exportScope === 'both' ? 'Summary + Breakdown' : exportScope === 'summary' ? 'Summary' : 'Items';

      const now = new Date().toLocaleString();

      const filtersLine = [
        statusFilter !== 'all' ? `Status: ${statusFilter}` : 'Status: all',
        dateFrom ? `From: ${dateFrom}` : '',
        dateTo ? `To: ${dateTo}` : '',
        search.trim() ? `Search: "${search.trim()}"` : '',
      ]
        .filter(Boolean)
        .join('  •  ');

      const companyName = company?.name?.trim() || 'Company';
      const branchName = branch?.name?.trim() || '';

      const headerAddress = (branch?.address?.trim() || company?.address?.trim() || '').trim();
      const headerPhone = (branch?.phone?.trim() || company?.phone?.trim() || '').trim();
      const headerEmail = (branch?.email?.trim() || company?.email?.trim() || '').trim();

      const contactParts = [headerAddress || null, headerPhone ? `Tel: ${headerPhone}` : null, headerEmail || null].filter(
        Boolean
      ) as string[];

      // ---------
      // Branding helpers (header/footer on every page)
      // ---------
      const drawHeader = () => {
        doc.setFontSize(14);
        doc.text(companyName, marginX, 34);

        doc.setFontSize(11);
        doc.text(`${reportTitle} (${scopeTitle})`, marginX, 52);

        doc.setFontSize(9);
        doc.text(contactParts.length ? contactParts.join(' • ') : '—', marginX, 66, {
          maxWidth: pageWidth - marginX * 2,
        });

        if (branchName) {
          doc.text(`Branch: ${branchName}`, marginX, 80, {
            maxWidth: pageWidth - marginX * 2,
          });
        }

        if (filtersLine) {
          doc.text(filtersLine, marginX, branchName ? 94 : 80, {
            maxWidth: pageWidth - marginX * 2,
          });
        }

        const lineY = filtersLine ? (branchName ? 106 : 92) : branchName ? 92 : 78;

        // thin line under header
        doc.setLineWidth(0.6);
        doc.line(marginX, lineY, pageWidth - marginX, lineY);
      };

      const drawFooter = (pageNumber: number, totalPages: number) => {
        const y = pageHeight - 40;

        // top line
        doc.setLineWidth(0.6);
        doc.line(marginX, y - 10, pageWidth - marginX, y - 10);

        doc.setFontSize(9);
        doc.text(`Prepared By: ____________________`, marginX, y);
        doc.text(`Approved By: ____________________`, marginX + 220, y);

        const pageText = `Page ${pageNumber} of ${totalPages}`;
        doc.text(pageText, pageWidth - marginX - doc.getTextWidth(pageText), y);
      };

      // Start page with header
      drawHeader();

      // table should start after header area
      const startY = 120;

      const addSummaryTable = () => {
        const rows = buildSummaryRows().map((r) => [
          r.receipt_number,
          r.customer_name,
          r.status,
          String(r.items_count),
          String(r.total_qty),
          r.reason || '',
          r.initiated_by || '',
          r.approved_by || '',
          r.created_at ? new Date(r.created_at).toLocaleString() : '',
        ]);

        autoTable(doc, {
          startY,
          margin: { left: marginX, right: marginX },
          head: [
            ['Receipt #', 'Customer', 'Status', 'Items', 'Total Qty', 'Reason', 'Initiated By', 'Approved By', 'Date/Time'],
          ],
          body: rows,
          styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
          headStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 80 },
            2: { cellWidth: 50 },
            3: { cellWidth: 35 },
            4: { cellWidth: 45 },
            5: { cellWidth: 90 },
            6: { cellWidth: 70 },
            7: { cellWidth: 70 },
            8: { cellWidth: 70 },
          },
          didDrawPage: () => {
            // autoTable calls this on new pages — re-draw header
            drawHeader();
          },
        });

        return doc.lastAutoTable?.finalY || startY;
      };

      const addItemsTable = () => {
        const rows = buildItemRows().map((r) => [
          r.receipt_number,
          r.customer_name,
          r.status,
          r.product_name,
          r.sku,
          String(r.qty_returned),
          r.initiated_by || '',
          r.approved_by || '',
          r.created_at ? new Date(r.created_at).toLocaleString() : '',
        ]);

        autoTable(doc, {
          startY,
          margin: { left: marginX, right: marginX },
          head: [['Receipt #', 'Customer', 'Status', 'Product', 'SKU', 'Qty', 'Initiated By', 'Approved By', 'Date/Time']],
          body: rows,
          styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
          headStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 80 },
            2: { cellWidth: 50 },
            3: { cellWidth: 120 },
            4: { cellWidth: 55 },
            5: { cellWidth: 35 },
            6: { cellWidth: 70 },
            7: { cellWidth: 70 },
            8: { cellWidth: 70 },
          },
          didDrawPage: () => {
            drawHeader();
          },
        });

        return doc.lastAutoTable?.finalY || startY;
      };

      const addPerReceiptBreakdown = () => {
        // One receipt per page so ALL items are clearly visible (no matter how many)
        filteredGroupedReturns.forEach((gr) => {
          doc.addPage();
          drawHeader();

          doc.setFontSize(12);
          doc.text(`Receipt: ${gr.receipt_number}`, marginX, 132);

          doc.setFontSize(9);
          doc.text(
            `Customer: ${gr.customer_name || 'Walk-in'}   •   Status: ${gr.status}   •   Total Qty: ${gr.total_qty}`,
            marginX,
            148,
            { maxWidth: pageWidth - marginX * 2 }
          );

          if (gr.reasons.length) {
            const reasonText =
              gr.reasons.length === 1 ? gr.reasons[0] : `Multiple: ${Array.from(new Set(gr.reasons)).join(' | ')}`;
            doc.text(`Reason(s): ${reasonText}`, marginX, 164, {
              maxWidth: pageWidth - marginX * 2,
            });
          }

          const rows = gr.items.map((it) => [it.name, it.sku || '', String(it.qty)]);

          autoTable(doc, {
            startY: gr.reasons.length ? 184 : 176,
            margin: { left: marginX, right: marginX },
            head: [['Product', 'SKU', 'Qty Returned']],
            body: rows,
            styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
            headStyles: { fontSize: 9 },
            columnStyles: {
              0: { cellWidth: 340 },
              1: { cellWidth: 110 },
              2: { cellWidth: 70 },
            },
            didDrawPage: () => {
              drawHeader();
            },
          });

          const footerY = Math.min((doc.lastAutoTable?.finalY || 200) + 18, pageHeight - 70);
          doc.setFontSize(9);
          doc.text(
            `Initiated By: ${gr.initiator_name || '-'}   •   Approved By: ${gr.approver_name || '-'}   •   Date: ${
              gr.created_at ? new Date(gr.created_at).toLocaleString() : '-'
            }`,
            marginX,
            footerY,
            { maxWidth: pageWidth - marginX * 2 }
          );
        });
      };

      if (exportScope === 'summary') {
        addSummaryTable();
      } else if (exportScope === 'items') {
        addItemsTable();
      } else {
        // both: summary first page + per-receipt breakdown pages
        const lastY = addSummaryTable();
        doc.setFontSize(9);
        doc.text('Detailed breakdown per receipt (all items shown):', marginX, Math.min(lastY + 16, pageHeight - 70));
        addPerReceiptBreakdown();
      }

      // Add footers with proper total page count
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        drawFooter(i, totalPages);
      }

      doc.save(`returned-receipts-${exportScope}-${stamp}.pdf`);

      toast({
        title: 'Export complete',
        description:
          exportScope === 'both'
            ? 'Downloaded branded PDF (Summary + per-receipt breakdown).'
            : `Downloaded branded PDF (${exportScope}).`,
      });
    } catch (e: any) {
      toast({
        title: 'PDF export failed',
        description: 'Could not export PDF. Install: npm i jspdf jspdf-autotable' + (e?.message ? `\n${e.message}` : ''),
        variant: 'destructive',
      });
    }
  };

  const toggleExpand = (saleId: string) => {
    setExpandedSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) next.delete(saleId);
      else next.add(saleId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Returned Items</h1>
        <p className="text-slate-400">View all returned receipts and items</p>
      </div>

      {/* Filter bar: search + status + date range + export */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by receipt, customer, or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:w-52">
            <Label className="text-slate-300">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="w-full sm:w-52">
            <Label className="text-slate-300">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="w-full sm:w-56">
            <Label className="text-slate-300">Export What?</Label>
            <Select value={exportScope} onValueChange={(v) => setExportScope(v as ExportScope)}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Choose export scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Receipts only (Summary)</SelectItem>
                <SelectItem value="items">Items only</SelectItem>
                <SelectItem value="both">Both (Summary + Items)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
            >
              Clear Dates
            </Button>

            <Button onClick={exportPDF}>Export PDF</Button>

            <Button variant="outline" onClick={exportExcel}>
              Export Excel
            </Button>

            <Button variant="outline" onClick={exportCSV}>
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Returned Receipts ({filteredGroupedReturns.length})
          </CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Receipt #</TableHead>
                <TableHead className="text-slate-400">Customer</TableHead>
                <TableHead className="text-slate-400">Items Returned</TableHead>
                <TableHead className="text-slate-400">Total Qty</TableHead>
                <TableHead className="text-slate-400">Reason</TableHead>
                <TableHead className="text-slate-400">Initiated By</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400">Approved By</TableHead>
                <TableHead className="text-slate-400">Date</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredGroupedReturns.map((gr) => {
                const expanded = expandedSaleIds.has(gr.sale_id);

                return (
                  <Fragment key={gr.sale_id}>
                    <TableRow
                      className="border-slate-700 cursor-pointer hover:bg-slate-800/60"
                      onClick={() => toggleExpand(gr.sale_id)}
                      title="Click to view all items on this receipt"
                    >
                      <TableCell className="text-white font-medium">{gr.receipt_number}</TableCell>
                      <TableCell className="text-slate-300">{gr.customer_name || 'Walk-in'}</TableCell>

                      <TableCell className="text-slate-300">
                        <div className="space-y-1">
                          {gr.items.slice(0, 3).map((it, idx) => (
                            <div key={`${it.name}-${idx}`} className="text-sm">
                              {it.name}
                              {it.sku ? <span className="text-xs text-slate-500"> ({it.sku})</span> : null}
                              <span className="text-xs text-slate-400"> ×{it.qty}</span>
                            </div>
                          ))}
                          {gr.items.length > 3 && (
                            <div className="text-xs text-slate-500">
                              {expanded ? 'Showing all items' : `+${gr.items.length - 3} more item(s) — click to expand`}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-slate-300">{gr.total_qty}</TableCell>

                      <TableCell className="text-slate-300">
                        {gr.reasons.length === 0 ? '-' : gr.reasons.length === 1 ? gr.reasons[0] : 'Multiple reasons'}
                      </TableCell>

                      <TableCell className="text-slate-300">{gr.initiator_name || '-'}</TableCell>
                      <TableCell>{getStatusBadge(gr.status)}</TableCell>
                      <TableCell className="text-slate-300">{gr.approver_name || '-'}</TableCell>
                      <TableCell className="text-slate-300">
                        {gr.created_at ? new Date(gr.created_at).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>

                    {expanded && (
                      <TableRow className="border-slate-700">
                        <TableCell colSpan={9} className="p-0">
                          <div className="bg-slate-900/40 border-t border-slate-700 p-3">
                            <p className="text-xs text-slate-400 mb-2">All items on this returned receipt:</p>

                            <div className="space-y-2">
                              {gr.items.map((it, idx) => (
                                <div
                                  key={`${gr.sale_id}-${it.name}-${it.sku || ''}-${idx}`}
                                  className="flex items-center justify-between rounded-md bg-slate-800/50 border border-slate-700 px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm text-white">
                                      {it.name}
                                      {it.sku ? <span className="text-xs text-slate-500"> ({it.sku})</span> : null}
                                    </p>
                                    <p className="text-xs text-slate-400">Qty Returned: {it.qty}</p>
                                  </div>

                                  <Badge className="bg-slate-700">{gr.status}</Badge>
                                </div>
                              ))}
                            </div>

                            {gr.reasons.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs text-slate-400 mb-1">Reasons:</p>
                                <div className="text-sm text-slate-300 space-y-1">
                                  {gr.reasons.length === 1 ? (
                                    <p>{gr.reasons[0]}</p>
                                  ) : (
                                    gr.reasons.map((r, i) => <p key={`${gr.sale_id}-reason-${i}`}>• {r}</p>)
                                  )}
                                </div>
                              </div>
                            )}

                            <p className="text-xs text-slate-500 mt-3">Click the receipt row again to collapse.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}

              {filteredGroupedReturns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-400 py-8">
                    {loading ? 'Loading...' : 'No returns found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
