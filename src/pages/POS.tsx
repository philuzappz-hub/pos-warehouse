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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { CartItem, Product } from '@/types/database';
import { FileText, Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

type CompanyMini = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  logo_url?: string | null; // ✅ added (for printing logo)
};

type BranchMini = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

const COMPANY_LOGO_BUCKET = 'company-logos';
const SIGNED_URL_TTL = 60 * 60; // 1 hour

function escapeHtml(str: string) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v || '');
}

function getInitials(name: string) {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return 'CO';
  return parts.map((p) => p[0]?.toUpperCase()).join('');
}

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Display helper: convert "233xxxxxxxxx" => "0xxxxxxxxx"
function displayGhPhone(v?: string | null) {
  const s = String(v ?? '').trim().replace(/\s+/g, '');
  if (!s) return '';
  if (/^233\d{9}$/.test(s)) return `0${s.slice(3)}`;
  return s;
}

function cleanLine(parts: Array<string | null | undefined>) {
  return parts
    .map((p) => (p ?? '').toString().trim())
    .filter(Boolean)
    .join(' • ');
}

// ✅ escape hatch for new RPCs not included in generated Supabase TS types
async function rpcAny<T = any>(fn: string, args?: Record<string, any>) {
  return (supabase as any).rpc(fn, args) as Promise<{ data: T; error: any }>;
}

// ✅ Print without popup: hidden iframe printing (avoids blank new window)
// ✅ Updated: waits briefly for logo/images to load before printing
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

  const waitForImages = async (maxMs = 1200) => {
    try {
      const d = iframe.contentDocument || iframe.contentWindow?.document;
      if (!d) return;

      const imgs = Array.from(d.images || []);
      if (!imgs.length) return;

      const stillLoading = imgs.filter((img) => !(img as any).complete);
      if (!stillLoading.length) return;

      await Promise.race([
        Promise.all(
          stillLoading.map(
            (img) =>
              new Promise<void>((resolve) => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              })
          )
        ),
        new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
      ]);
    } catch {
      // ignore
    }
  };

  const doPrint = async () => {
    try {
      await waitForImages();
      w?.focus();
      w?.print();
    } finally {
      cleanup();
    }
  };

  iframe.onload = () => {
    setTimeout(() => {
      void doPrint();
    }, 200);
  };

  // fallback if onload doesn't fire
  setTimeout(() => {
    void doPrint();
  }, 450);
}

/** ✅ Detect "duplicate receipt number" errors reliably (different shapes possible) */
function isReceiptDuplicateErr(err: any) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  const details = String(err?.details || '');
  const hint = String(err?.hint || '');

  if (code === '23505') return true;

  const blob = (msg + ' ' + details + ' ' + hint).toLowerCase();
  return (
    blob.includes('duplicate key') &&
    (blob.includes('sales_receipt_number_key') || blob.includes('receipt_number'))
  );
}

/** ✅ If collision happens, make the receipt number unique on retry */
function withCollisionSuffix(base: string, attempt: number) {
  if (attempt <= 1) return base;
  const rnd = Math.floor(100 + Math.random() * 900); // 100-999
  return `${base}-${rnd}`;
}

export default function POS() {
  // ✅ IMPORTANT: pull activeBranchId + branchId from useAuth
  const { user, profile, activeBranchId, branchId } = useAuth();

  const { toast } = useToast();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [processing, setProcessing] = useState(false);

  // ✅ prevents double-submit (mobile tap / lag / print dialog)
  const checkoutLockRef = useRef(false);

  // ✅ company + branch for receipt header
  const [company, setCompany] = useState<CompanyMini | null>(null);
  const [branch, setBranch] = useState<BranchMini | null>(null);

  // ✅ resolved logo url for printing (public or signed)
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>('');

  // ✅ single source of truth for branch filtering
  const branchFilterId = activeBranchId || branchId;

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilterId]);

  // ✅ load company + branch details (for printing header)
  useEffect(() => {
    const companyId = (profile as any)?.company_id ?? null;

    (async () => {
      // Company
      try {
        if (companyId) {
          const { data, error } = await (supabase as any)
            .from('companies')
            .select('id,name,address,phone,email,tax_id,logo_url') // ✅ include logo_url
            .eq('id', companyId)
            .maybeSingle();

          if (!error) {
            const c = (data as CompanyMini) || null;
            setCompany(c);

            // ✅ resolve logo url (http or signed)
            const raw = String((c as any)?.logo_url ?? '').trim();
            if (!raw) {
              setCompanyLogoUrl('');
            } else if (isHttpUrl(raw)) {
              setCompanyLogoUrl(raw);
            } else {
              try {
                const { data: signed, error: signErr } = await supabase.storage
                  .from(COMPANY_LOGO_BUCKET)
                  .createSignedUrl(raw, SIGNED_URL_TTL);

                if (signErr) throw signErr;
                setCompanyLogoUrl(signed?.signedUrl || '');
              } catch {
                setCompanyLogoUrl('');
              }
            }
          } else {
            setCompany(null);
            setCompanyLogoUrl('');
          }
        } else {
          setCompany(null);
          setCompanyLogoUrl('');
        }
      } catch {
        setCompany(null);
        setCompanyLogoUrl('');
      }

      // Branch (use branchFilterId, NOT profile.active_branch_id)
      try {
        if (branchFilterId) {
          const { data, error } = await (supabase as any)
            .from('branches')
            .select('id,name,address,phone,email')
            .eq('id', branchFilterId)
            .maybeSingle();
          if (!error) setBranch((data as BranchMini) || null);
          else setBranch(null);
        } else {
          setBranch(null);
        }
      } catch {
        setBranch(null);
      }
    })();
  }, [(profile as any)?.company_id, branchFilterId]);

  // realtime products refresh (still ok — it re-fetches WITH branch filter)
  useEffect(() => {
    const channel = supabase
      .channel('pos-products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilterId]);

  const fetchProducts = async () => {
    // ✅ BLOCK if branch not set
    if (!branchFilterId) {
      setProducts([]);
      setLoading(false);
      toast({
        title: 'Branch not set',
        description: 'Your account is missing a branch. Contact admin.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('branch_id', branchFilterId) // ✅ FIX: branch filter stops duplicates
      .gt('quantity_in_stock', 0)
      .order('name');

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to load products',
        variant: 'destructive',
      });
      setProducts([]);
    } else {
      setProducts((data as Product[]) || []);
    }
    setLoading(false);
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);

      if (existing) {
        if (existing.quantity >= product.quantity_in_stock) {
          toast({
            title: 'Stock limit',
            description: 'Cannot add more than available stock',
            variant: 'destructive',
          });
          return prev;
        }

        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;

        const newQty = item.quantity + delta;
        if (newQty < 1) return item;

        if (newQty > item.product.quantity_in_stock) {
          toast({
            title: 'Stock limit',
            description: 'Cannot exceed available stock',
            variant: 'destructive',
          });
          return item;
        }

        return { ...item, quantity: newQty };
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.unit_price * item.quantity, 0);
  }, [cart]);

  const validateCheckout = () => {
    if (!user) {
      toast({
        title: 'Not logged in',
        description: 'Please login again.',
        variant: 'destructive',
      });
      return false;
    }

    if (cart.length === 0) {
      toast({
        title: 'Empty cart',
        description: 'Please add products before confirming sale.',
        variant: 'destructive',
      });
      return false;
    }

    if (!customerName.trim()) {
      toast({
        title: 'Customer name required',
        description: 'Please enter the customer name.',
        variant: 'destructive',
      });
      return false;
    }

    if (!customerPhone.trim()) {
      toast({
        title: 'Customer phone required',
        description: 'Please enter the customer phone number.',
        variant: 'destructive',
      });
      return false;
    }

    const phone = customerPhone.trim().replace(/\s+/g, '');
    if (phone.length < 9) {
      toast({
        title: 'Invalid phone',
        description: 'Please enter a valid phone number.',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

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
    // ✅ Use company + branch for header
    const companyName = company?.name?.trim() || 'Company';
    const branchName = branch?.name?.trim() || 'Branch';

    const initials = getInitials(companyName);
    const logoUrl = (companyLogoUrl || '').trim();

    const addr = (branch?.address || company?.address || '').trim();
    const phone = displayGhPhone(branch?.phone || company?.phone || '');
    const email = (branch?.email || company?.email || '').trim();

    const contactLine = cleanLine([addr || null, phone ? `Tel: ${phone}` : null, email || null]);

    const receiptNumber = escapeHtml(data.receipt_number);
    const now = new Date(data.created_at || Date.now()).toLocaleString();
    const totalPaid = money(data.total_amount);

    const customerLine =
      (data.customer_name ? escapeHtml(data.customer_name) : 'Walk-in') +
      (data.customer_phone ? ` • ${escapeHtml(displayGhPhone(data.customer_phone))}` : '');

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

    // ✅ NEW: logo slot (or initials fallback) + clean spacing
    const brandHtml = `
      <div class="brand">
        ${
          logoUrl
            ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Company logo" />`
            : `<div class="logoFallback">${escapeHtml(initials)}</div>`
        }
      </div>
    `;

    const headerHtml = `
      <div class="hdr">
        ${brandHtml}
        <div class="co">${escapeHtml(companyName)}</div>
        <div class="br">${escapeHtml(branchName)}</div>
        ${contactLine ? `<div class="ct">${escapeHtml(contactLine)}</div>` : ''}
      </div>
      <div class="dash"></div>
    `;

    const customerSalesCopy = `
      <div class="paper">
        ${headerHtml}
        <div class="sub">Sales Receipt</div>
        <div class="copyTitle">Customer Copy (No Items)</div>

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
              <td>Total Paid</td>
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
        ${headerHtml}
        <div class="sub">Sales Receipt</div>
        <div class="copyTitle">Cashier Copy (Full)</div>

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
              <td colspan="3">Total</td>
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
        ${headerHtml}
        <div class="sub">Warehouse Pickup Coupon</div>
        <div class="copyTitle">${escapeHtml(label)}</div>

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

            .hdr { text-align: center; }

            /* ✅ NEW: logo area (or initials fallback) */
            .brand { display:flex; justify-content:center; align-items:center; margin-bottom: 6px; }
            .logo {
              max-width: 62px;
              max-height: 62px;
              width: auto;
              height: auto;
              object-fit: contain;
              display:block;
            }
            .logoFallback {
              width: 56px;
              height: 56px;
              border: 1px solid #111;
              border-radius: 10px;
              display:flex;
              align-items:center;
              justify-content:center;
              font-weight: 900;
              font-size: 14px;
              letter-spacing: 0.5px;
            }

            .co { font-weight: 900; font-size: 16px; }
            .br { font-weight: 800; font-size: 12px; margin-top: 2px; }
            .ct { font-size: 11px; color: var(--muted); margin-top: 4px; line-height: 1.25; }

            .sub { text-align:center; font-size: 12px; color: var(--muted); margin-top: 2px; }
            .copyTitle { text-align:center; font-size: 12px; font-weight: 800; margin-top: 6px; text-transform: none; }
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
            ${warehouseCoupon('Warehouse Coupon — Copy 1')}
            ${warehouseCoupon('Warehouse Coupon — Copy 2')}
          </div>
        </body>
      </html>
    `;
  };

  /**
   * ✅ UPDATED: retry-safe checkout (fixes "duplicate receipt_number")
   * - prevents double submit using checkoutLockRef
   * - retries sale insert if unique constraint happens
   * - adds suffix on retry to guarantee uniqueness
   */
  const handleCheckoutAndPrint = async () => {
    if (!validateCheckout()) return;

    // ✅ stop double tap
    if (checkoutLockRef.current) return;
    checkoutLockRef.current = true;

    setProcessing(true);

    let saleId: string | null = null;
    let couponId: string | null = null;

    try {
      const MAX_TRIES = 6;

      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        // ✅ always start from RPC base number
        const { data: receiptData, error: receiptErr } = await supabase.rpc('generate_receipt_number');
        if (receiptErr) throw receiptErr;

        const baseReceipt = String(receiptData || '').trim() || `RCP-${Date.now()}`;
        const receiptNumber = withCollisionSuffix(baseReceipt, attempt);

        // ✅ create sale
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert({
            receipt_number: receiptNumber,
            cashier_id: user!.id,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            total_amount: total,
            status: 'pending',
          })
          .select()
          .single();

        // ✅ handle duplicate receipt -> retry
        if (saleError) {
          if (isReceiptDuplicateErr(saleError) && attempt < MAX_TRIES) {
            continue; // try again with suffix
          }
          throw saleError;
        }

        saleId = sale.id;

        // ✅ create sale_items
        const saleItems = cart.map((item) => ({
          sale_id: sale.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.product.unit_price,
        }));

        const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
        if (itemsError) throw itemsError;

        // ✅ create coupon (active)
        const { data: couponData, error: couponErr } = await supabase
          .from('sale_coupons' as any)
          .insert({ sale_id: sale.id, issued_by: user!.id })
          .select('id')
          .single();

        if (couponErr) throw couponErr;

        couponId = (couponData as any)?.id ?? null;
        if (!couponId) throw new Error('Coupon was created but ID could not be read');

        // reset UI
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setCheckoutOpen(false);

        toast({ title: 'Sale Complete', description: `Receipt: ${receiptNumber}` });
        fetchProducts();

        // ✅ print
        const data = await fetchReceiptData(sale.id);
        if (!data) throw new Error('Could not load receipt for printing');

        const html = buildPrintHtml(data, sale.id);

        printHtmlViaIframe(html, async () => {
          // ✅ best effort: mark printed after print dialog opens
          if (couponId) {
            const { error } = await rpcAny('mark_coupon_printed', { p_coupon_id: couponId });
            if (error) {
              toast({
                title: 'Printed but not recorded',
                description: error.message,
                variant: 'destructive',
              });
            }
          }
        });

        return; // ✅ success
      }

      throw new Error('Could not generate a unique receipt number. Try again.');
    } catch (error: any) {
      toast({
        title: 'Confirm/Print issue',
        description: error?.message || 'Could not complete printing',
        variant: 'destructive',
      });

      // ✅ go to coupons and highlight
      if (couponId) {
        navigate(`/pos/coupons?highlight=${encodeURIComponent(couponId)}`);
      } else if (saleId) {
        navigate(`/pos/coupons?highlightSale=${encodeURIComponent(saleId)}`);
      } else {
        navigate(`/pos/coupons`);
      }
    } finally {
      setProcessing(false);
      checkoutLockRef.current = false;
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-4">
      {/* Products */}
      <div className="flex-1 flex flex-col">
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <Button
            variant="outline"
            className="whitespace-nowrap"
            onClick={() => navigate('/reports/daily-sales')}
            title="Open Daily Sales Report"
          >
            <FileText className="h-4 w-4 mr-2" />
            Daily Sales
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className="bg-slate-800/50 border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors"
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-3">
                  <p className="font-medium text-white text-sm truncate">{product.name}</p>
                  <p className="text-xs text-slate-400">{product.sku}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-primary font-bold">
                      GHS {product.unit_price.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500">{product.quantity_in_stock} in stock</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {loading && <p className="text-slate-400 text-center py-8">Loading products...</p>}
          {!loading && filteredProducts.length === 0 && (
            <p className="text-slate-400 text-center py-8">No products found</p>
          )}
        </div>
      </div>

      {/* Cart */}
      <Card className="w-full lg:w-96 bg-slate-800/50 border-slate-700 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-white">
            <ShoppingCart className="h-5 w-5" />
            Cart ({cart.length})
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 overflow-auto space-y-2 mb-4">
            {cart.length === 0 ? (
              <p className="text-slate-400 text-center py-8">Cart is empty</p>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center gap-2 bg-slate-700/50 p-2 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.product.name}</p>
                    <p className="text-xs text-slate-400">
                      GHS {item.product.unit_price.toLocaleString()} × {item.quantity}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.product.id, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>

                    <span className="w-6 text-center text-white text-sm">{item.quantity}</span>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.product.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-400"
                      onClick={() => removeFromCart(item.product.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-700 pt-4 space-y-3">
            <div className="flex justify-between text-lg font-bold text-white">
              <span>Total</span>
              <span>GHS {total.toLocaleString()}</span>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0}
              onClick={() => setCheckoutOpen(true)}
            >
              Checkout
            </Button>

            <Button variant="outline" className="w-full" onClick={() => navigate('/pos/coupons')}>
              View POS Coupons (Today)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Complete Sale</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Customer Name (required)</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Enter customer name"
              />
            </div>

            <div>
              <Label className="text-slate-200">Phone Number (required)</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Enter phone number"
              />
            </div>

            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex justify-between text-white font-bold text-xl">
                <span>Total Amount</span>
                <span>GHS {total.toLocaleString()}</span>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Confirm will save the sale and open the print dialog for:
              <br />• 1 Customer Sales Receipt (no items)
              <br />• 1 Cashier Sales Receipt (full)
              <br />• 2 Warehouse Coupons
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleCheckoutAndPrint} disabled={processing}>
              <Printer className="h-4 w-4 mr-2" />
              {processing ? 'Processing...' : 'Confirm & Print'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}