export function escapeHtml(str: any) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function companyInitials(name: string) {
  const cleaned = String(name || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();

  if (!cleaned) return "CO";

  const parts = cleaned.split(/\s+/).filter(Boolean);
  const take = parts.slice(0, 3);
  const initials = take.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return initials || "CO";
}

export function safeNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function roundMoney(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

export function getFieldNumber(obj: any, keys: string[]) {
  for (const key of keys) {
    if (obj && obj[key] != null && obj[key] !== "") {
      const n = Number(obj[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

export function detectInventoryCost(product: any) {
  return roundMoney(
    getFieldNumber(product, [
      "cost_price",
      "buying_price",
      "purchase_price",
      "unit_cost",
      "cost",
      "last_cost",
      "average_cost",
    ])
  );
}

export function detectSellingPrice(product: any) {
  return roundMoney(
    getFieldNumber(product, [
      "selling_price",
      "price",
      "unit_price",
      "sale_price",
      "retail_price",
    ])
  );
}

export function detectInventoryBasis(products: any[]) {
  const hasCost = products.some(
    (p) =>
      getFieldNumber(p, [
        "cost_price",
        "buying_price",
        "purchase_price",
        "unit_cost",
        "cost",
        "last_cost",
        "average_cost",
      ]) > 0
  );

  if (hasCost) return "cost-based";

  const hasSelling = products.some(
    (p) =>
      getFieldNumber(p, [
        "selling_price",
        "price",
        "unit_price",
        "sale_price",
        "retail_price",
      ]) > 0
  );

  if (hasSelling) return "selling-price fallback";
  return "no valuation fields";
}

export async function urlToDataUrl(url?: string | null): Promise<string | null> {
  const u = (url || "").trim();
  if (!u) return null;

  try {
    const res = await fetch(u, { mode: "cors" });
    if (!res.ok) return null;

    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return dataUrl;
  } catch {
    return null;
  }
}

export function isValidSale(row: any) {
  if (!row) return false;
  if (row?.is_returned) return false;

  const status = String(row?.status || "").toLowerCase();
  if (status === "cancelled" || status === "returned") return false;

  return true;
}