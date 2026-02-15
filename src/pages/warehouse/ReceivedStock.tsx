import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Image as ImageIcon, Plus, Search, Trash2, X } from 'lucide-react';

type ProductLite = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  quantity_in_stock: number;
};

type Line = {
  product: ProductLite;
  qty: number;
};

type ReceiptInsertResult = { id: string };

function normalizeWaybillUrls(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);

  if (typeof v === 'object') {
    if (Array.isArray((v as any).urls)) return (v as any).urls.filter(Boolean).map(String);
    if (Array.isArray((v as any).files)) return (v as any).files.filter(Boolean).map(String);
  }

  if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
  return [];
}

export default function ReceivedStock() {
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const [carNumber, setCarNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  // ✅ OPTIONAL WAYBILLS
  const [waybillFiles, setWaybillFiles] = useState<File[]>([]);
  const [waybillPreviews, setWaybillPreviews] = useState<string[]>([]);

  // -----------------------------
  // Product search (picker)
  // -----------------------------
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductLite[]>([]);

  const trimmed = query.trim();

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }

      setSearching(true);

      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, unit, quantity_in_stock')
        .or(`name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`)
        .order('name')
        .limit(10);

      if (!active) return;

      setResults(error ? [] : ((data || []) as ProductLite[]));
      setSearching(false);
    };

    const t = setTimeout(run, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [trimmed]);

  const showDropdown = open && (searching || results.length > 0 || trimmed.length >= 2);

  const addProductLine = (p: ProductLite) => {
    setLines((prev) => {
      const existing = prev.find((x) => x.product.id === p.id);
      if (existing) {
        return prev.map((x) =>
          x.product.id === p.id ? { ...x, qty: Math.max(1, Number(x.qty || 0) + 1) } : x
        );
      }
      return [...prev, { product: p, qty: 1 }];
    });

    setQuery('');
    setOpen(false);
  };

  const updateQty = (productId: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.product.id === productId ? { ...l, qty: Number.isFinite(qty) ? qty : 1 } : l
      )
    );
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  };

  const totalQty = useMemo(() => lines.reduce((sum, l) => sum + Number(l.qty || 0), 0), [lines]);

  // -----------------------------
  // Waybill handlers (optional)
  // -----------------------------
  const onPickWaybills = (files: FileList | null) => {
    if (!files) return;

    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) {
      toast({
        title: 'Invalid files',
        description: 'Please select image files only.',
        variant: 'destructive',
      });
      return;
    }

    // safety limits
    const MAX_FILES = 6;
    const MAX_MB_EACH = 8;

    const filtered = list
      .slice(0, MAX_FILES)
      .filter((f) => f.size <= MAX_MB_EACH * 1024 * 1024);

    if (filtered.length !== list.slice(0, MAX_FILES).length) {
      toast({
        title: 'Some files skipped',
        description: `Max ${MAX_FILES} images, and each must be <= ${MAX_MB_EACH}MB.`,
        variant: 'destructive',
      });
    }

    setWaybillFiles((prev) => [...prev, ...filtered].slice(0, MAX_FILES));
  };

  useEffect(() => {
    const urls = waybillFiles.map((f) => URL.createObjectURL(f));
    setWaybillPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [waybillFiles]);

  const removeWaybill = (idx: number) => {
    setWaybillFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  /**
   * ✅ Upload returns storage paths (best for private buckets)
   * ✅ Writes JSONB array into waybill_urls (append-safe)
   */
  const uploadWaybills = async (receiptId: string) => {
    if (!user) return { paths: [] as string[], failed: 0 };
    if (waybillFiles.length === 0) return { paths: [] as string[], failed: 0 };

    const paths: string[] = [];
    let failed = 0;

    for (const file of waybillFiles) {
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';

        const path = `${receiptId}/${user.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`;

        const { error: upErr } = await supabase.storage.from('waybills').upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'image/jpeg',
        });

        if (upErr) throw upErr;

        paths.push(path);
      } catch {
        failed += 1;
      }
    }

    if (paths.length > 0) {
      // ✅ Merge with any existing waybill_urls (jsonb)
      const { data: currentRow } = await supabase
        .from('warehouse_receipts' as any)
        .select('waybill_urls')
        .eq('id', receiptId)
        .maybeSingle();

      const existing = normalizeWaybillUrls((currentRow as any)?.waybill_urls);
      const merged = [...existing, ...paths];

      const { error: updateErr } = await supabase
        .from('warehouse_receipts' as any)
        .update({ waybill_urls: merged }) // ✅ jsonb array
        .eq('id', receiptId);

      if (updateErr) {
        failed += 1;
      }
    }

    return { paths, failed };
  };

  // -----------------------------
  // Save Draft (pending)
  // -----------------------------
  const saveDraft = async () => {
    if (!user) {
      toast({ title: 'Not logged in', description: 'Please login again.', variant: 'destructive' });
      return;
    }

    // ✅ CRITICAL: receipt.branch_id is NOT NULL
    const branchId = profile?.branch_id ?? null;
    if (!branchId) {
      toast({
        title: 'No branch assigned',
        description: 'Your account must be assigned to a branch before you can receive stock.',
        variant: 'destructive',
      });
      return;
    }

    if (!carNumber.trim()) {
      toast({
        title: 'Car number required',
        description: 'Please enter a car number before saving.',
        variant: 'destructive',
      });
      return;
    }

    if (lines.length === 0) {
      toast({
        title: 'No products',
        description: 'Please add at least one product.',
        variant: 'destructive',
      });
      return;
    }

    const bad = lines.find((l) => !l.qty || Number(l.qty) <= 0);
    if (bad) {
      toast({
        title: 'Invalid quantity',
        description: `Quantity must be greater than 0 for: ${bad.product.name}`,
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    let receiptId: string | null = null;

    try {
      // ✅ DB expects a DATE, not timestamp
      const todayISO = new Date().toISOString().slice(0, 10);

      // 1) Create receipt header (MUST include branch_id)
      const { data: receiptData, error: receiptError } = await supabase
        .from('warehouse_receipts' as any)
        .insert({
          car_number: carNumber.trim(),
          receipt_date: todayISO,
          notes: notes.trim() ? notes.trim() : null,
          created_by: user.id,
          status: 'pending',
          branch_id: branchId, // ✅ FIXED
          waybill_urls: waybillFiles.length > 0 ? [] : null, // jsonb
        })
        .select('id')
        .single();

      if (receiptError) {
        const msg = (receiptError.message || '').toLowerCase();
        if (msg.includes('duplicate') || msg.includes('unique')) {
          toast({
            title: 'Duplicate entry blocked',
            description:
              'This car number has already been captured today. If this is a different delivery, use a different car number.',
            variant: 'destructive',
          });
          return;
        }
        throw receiptError;
      }

      const receipt = receiptData as unknown as ReceiptInsertResult;
      receiptId = receipt.id;

      // 2) Insert lines
      const itemsPayload = lines.map((l) => ({
        receipt_id: receiptId,
        product_id: l.product.id,
        quantity: Number(l.qty),
      }));

      const { error: itemsError } = await supabase
        .from('warehouse_receipt_items' as any)
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      // 3) Upload optional waybills (BEST-EFFORT; never blocks saving)
      let uploadInfo = { paths: [] as string[], failed: 0 };
      if (waybillFiles.length > 0) {
        uploadInfo = await uploadWaybills(receiptId);
      }

      if (waybillFiles.length > 0 && uploadInfo.paths.length === 0) {
        toast({
          title: 'Saved ✅ (no waybill uploaded)',
          description:
            'Receipt saved as Pending, but waybill upload failed. Check bucket permissions or file size/type.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Saved ✅',
          description:
            waybillFiles.length > 0
              ? `Receipt saved (Pending). Waybills: ${uploadInfo.paths.length} uploaded${
                  uploadInfo.failed ? `, ${uploadInfo.failed} failed` : ''
                }.`
              : 'Receipt saved (Pending). Admin must approve before stock increases.',
        });
      }

      // Reset
      setCarNumber('');
      setNotes('');
      setLines([]);
      setQuery('');
      setOpen(false);
      setWaybillFiles([]);
      setWaybillPreviews([]);
    } catch (e: any) {
      // Cleanup receipt only if items insert failed (receipt alone is useless)
      if (receiptId) {
        await supabase.from('warehouse_receipts' as any).delete().eq('id', receiptId);
      }

      toast({
        title: 'Save failed',
        description: e?.message || 'Could not save receiving draft',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const nowText = new Date().toLocaleString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Receive Stock (Warehouse)</h1>
        <p className="text-slate-400">
          Brand: <b>Philuz Appz</b> • Captures car number + items received (pending approval)
        </p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Receiving Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-slate-300">Car Number (Required)</Label>
            <Input
              value={carNumber}
              onChange={(e) => setCarNumber(e.target.value)}
              placeholder="e.g. GR-1234-20"
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div>
            <Label className="text-slate-300">Received By</Label>
            <Input
              value={profile?.full_name || 'Unknown'}
              disabled
              className="bg-slate-900 border-slate-700 text-slate-300"
            />
          </div>

          <div>
            <Label className="text-slate-300">Captured At</Label>
            <Input value={nowText} disabled className="bg-slate-900 border-slate-700 text-slate-300" />
          </div>

          <div className="md:col-span-3">
            <Label className="text-slate-300">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Waybill notes, supplier notes, etc."
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* ✅ OPTIONAL WAYBILL UPLOAD */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Waybill (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <Label className="text-slate-300">Upload Waybill Image(s)</Label>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onPickWaybills(e.target.files)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <div className="text-xs text-slate-500 mt-1">
                Optional — submit without waybill. If attached, admin will see it in approvals.
              </div>
            </div>

            <div className="text-sm text-slate-400 flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Attached: <b className="text-white">{waybillFiles.length}</b>
            </div>
          </div>

          {waybillPreviews.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {waybillPreviews.map((src, idx) => (
                <div
                  key={src}
                  className="relative rounded-md border border-slate-700 overflow-hidden bg-slate-900/40"
                >
                  <img src={src} alt="Waybill preview" className="w-full h-32 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeWaybill(idx)}
                    className="absolute top-2 right-2 bg-slate-950/70 text-white rounded-full p-1 hover:bg-slate-950"
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product picker */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Add Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Search product by name or SKU (min 2 letters)…"
                className="pl-10 bg-slate-800 border-slate-700 text-white"
              />
            </div>

            {showDropdown && (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-md border border-slate-700 bg-slate-900">
                <div className="max-h-72 overflow-auto">
                  {searching && <div className="px-3 py-2 text-sm text-slate-400">Searching…</div>}

                  {!searching && results.length === 0 && trimmed.length >= 2 && (
                    <div className="px-3 py-2 text-sm text-slate-400">
                      No matches. Try another name or SKU.
                    </div>
                  )}

                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addProductLine(p)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors"
                    >
                      <div className="text-sm text-white font-medium">{p.name}</div>
                      <div className="text-xs text-slate-400">
                        SKU: {p.sku || '-'} • Unit: {p.unit || '-'} • Current Stock:{' '}
                        {Number(p.quantity_in_stock || 0).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {lines.length === 0 ? (
              <div className="text-sm text-slate-400">No products added yet.</div>
            ) : (
              lines.map((l) => (
                <div
                  key={l.product.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-slate-700 bg-slate-900/40 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{l.product.name}</div>
                    <div className="text-xs text-slate-400">
                      SKU: {l.product.sku || '-'} • Unit: {l.product.unit || '-'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-36">
                      <Label className="text-slate-300 text-xs">Qty Received</Label>
                      <Input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => updateQty(l.product.id, Number(e.target.value))}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => removeLine(l.product.id)}
                      title="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-slate-400">
              Lines: <b className="text-white">{lines.length}</b> • Total Qty:{' '}
              <b className="text-white">{Number(totalQty).toLocaleString()}</b>
            </div>

            <Button onClick={saveDraft} disabled={saving}>
              <Plus className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Draft (Pending)'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500">
        This saves as <b>Pending</b>. Stock increases only after admin approves (automatic).
      </div>
    </div>
  );
}
