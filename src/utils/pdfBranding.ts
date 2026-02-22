// src/utils/pdfBranding.ts
import jsPDF from "jspdf";

export type PdfReceiptStatus = "pending" | "approved" | "rejected";

export type CompanyMini = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  receipt_footer: string | null;
  logo_url: string | null;
};

export function formatDate(d?: string | null) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString();
}

export function statusLabel(s: PdfReceiptStatus) {
  if (s === "pending") return "PENDING";
  if (s === "approved") return "APPROVED";
  return "REJECTED";
}

export function statusColor(s: PdfReceiptStatus): [number, number, number] {
  if (s === "pending") return [245, 158, 11];
  if (s === "approved") return [34, 197, 94];
  return [239, 68, 68];
}

export function getInitials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CO";
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1] || "";
  return (first + last).toUpperCase() || "CO";
}

export function toTitleCase(input: string) {
  return (input || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function staffBranchName(profile: any) {
  const n =
    profile?.branch?.name ||
    profile?.branch_name ||
    profile?.branchName ||
    profile?.branch_title ||
    profile?.branch_label ||
    "";
  return String(n || "").trim();
}

export function receiptNumber(prefix: string, createdAt: string, id: string) {
  const d = new Date(createdAt);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const short = (id || "").replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${prefix}-${yyyy}-${mm}${dd}-${short}`;
}

export function drawWatermark(doc: jsPDF, text: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.saveGraphicsState?.();
  try {
    (doc as any).setGState?.(new (doc as any).GState({ opacity: 0.08 }));
  } catch {}

  doc.setTextColor(2, 6, 23);
  doc.setFontSize(56);
  doc.text(text, w / 2, h / 2, { align: "center", angle: 35 });

  try {
    (doc as any).setGState?.(new (doc as any).GState({ opacity: 1 }));
  } catch {}
  doc.restoreGraphicsState?.();
}

/** Contact line below company name */
export function getHeaderContactParts(company: CompanyMini | null) {
  const address = company?.address?.trim() || "";
  const phone = company?.phone?.trim() || "";
  const email = company?.email?.trim() || "";
  const tax = company?.tax_id?.trim() || "";

  return [
    address || null,
    phone ? `Tel: ${phone}` : null,
    email || null,
    tax ? `Tax ID: ${tax}` : null,
  ].filter(Boolean) as string[];
}

async function imageUrlToDataUrl(
  url: string
): Promise<{ dataUrl: string; format: "PNG" | "JPEG"; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const blob = await res.blob();
    const mime = (blob.type || "").toLowerCase();
    const format: "PNG" | "JPEG" =
      mime.includes("png") || url.toLowerCase().includes(".png") ? "PNG" : "JPEG";

    let width = 0;
    let height = 0;

    try {
      const bmp = await createImageBitmap(blob);
      width = bmp.width;
      height = bmp.height;
      bmp.close?.();
    } catch {
      const objUrl = URL.createObjectURL(blob);
      try {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            width = img.naturalWidth || 0;
            height = img.naturalHeight || 0;
            resolve();
          };
          img.onerror = () => reject(new Error("img load failed"));
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

/**
 * Turn a displayable logo url into a jsPDF-ready image payload.
 * Pass `companyLogoUrl` from useAuth (public OR signed) here.
 */
export async function getLogoForPdf(
  companyLogoUrl: string | null
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  const u = (companyLogoUrl || "").trim();
  if (!u) return null;

  const img = await imageUrlToDataUrl(u);
  if (!img) return null;

  return { dataUrl: img.dataUrl, format: img.format };
}

/**
 * ✅ Clean header + dynamic height
 * Uses companyLogoUrl (already public/signed) — no storage logic here.
 */
export function drawCompanyHeader(
  doc: jsPDF,
  company: CompanyMini | null,
  titleRight: string,
  status?: PdfReceiptStatus,
  logo?: { dataUrl: string; format: "PNG" | "JPEG" } | null
): { bottomY: number } {
  const companyName = company?.name || "Company";
  const initials = getInitials(companyName);

  // Left: logo if available, else initials badge
  if (logo?.dataUrl) {
    try {
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(40, 28, 44, 44, 10, 10, "FD");
      doc.addImage(logo.dataUrl, logo.format, 44, 32, 36, 36, undefined, "FAST");
    } catch {
      doc.setFillColor(30, 41, 59);
      doc.circle(54, 44, 16, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.text(initials, 54, 48, { align: "center" });
    }
  } else {
    doc.setFillColor(30, 41, 59);
    doc.circle(54, 44, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(initials, 54, 48, { align: "center" });
  }

  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text(`${companyName} — ${titleRight}`, 90, 44);

  // Status chip (top-right)
  if (status) {
    const [cr, cg, cb] = statusColor(status);
    doc.setFillColor(cr, cg, cb);
    doc.roundedRect(420, 30, 130, 22, 10, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(statusLabel(status), 485, 45, { align: "center" });
  }

  // Contact line (wrapped)
  const contactParts = getHeaderContactParts(company);
  const line = contactParts.length ? contactParts.join(" • ") : "—";

  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);

  const wrapped = doc.splitTextToSize(line, 380);
  doc.text(wrapped, 90, 60);

  const linesCount = Array.isArray(wrapped) ? wrapped.length : 1;
  const bottomY = 86 + Math.max(0, linesCount - 1) * 12;

  doc.setDrawColor(226, 232, 240);
  doc.line(40, bottomY, 555, bottomY);

  return { bottomY };
}