export type ReportFilterMeta = {
  title: string;
  supplierLabel: string;
  branchLabel: string;
  startDate: string;
  endDate: string;
  generatedAt?: string;
  company?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logo_url?: string | null;
  } | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateLabel(startDate: string, endDate: string) {
  if (startDate && endDate && startDate === endDate) return startDate;
  if (startDate && endDate) return `${startDate} to ${endDate}`;
  if (startDate) return `From ${startDate}`;
  if (endDate) return `Up to ${endDate}`;
  return "All Dates";
}

function getInitials(name?: string | null) {
  const text = String(name || "").trim();
  if (!text) return "CO";
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function buildCompanyHeader(company?: ReportFilterMeta["company"]) {
  if (!company) return "";

  const logoUrl = String(company.logo_url || "").trim();
  const hasLogo =
    logoUrl &&
    !logoUrl.includes("Company Logo") &&
    !logoUrl.startsWith("data:image/svg+xml") &&
    !logoUrl.includes("placeholder");

  const initials = getInitials(company.name);

  const detailLines = [
    company.address ? `<div>${escapeHtml(company.address)}</div>` : "",
    company.phone ? `<div>Phone: ${escapeHtml(company.phone)}</div>` : "",
    company.email ? `<div>Email: ${escapeHtml(company.email)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="company-header">
      <div class="company-brand">
        ${
          hasLogo
            ? `<div class="company-logo-wrap"><img class="company-logo" src="${escapeHtml(
                logoUrl
              )}" alt="Company Logo" /></div>`
            : `<div class="company-initials">${escapeHtml(initials || "CO")}</div>`
        }
        <div class="company-text">
          <div class="company-name">${escapeHtml(company.name || "Company")}</div>
          <div class="company-details">${detailLines}</div>
        </div>
      </div>
    </div>
  `;
}

export function openPrintFriendlyPdf(args: {
  meta: ReportFilterMeta;
  summaryCardsHtml: string;
  tableHtml: string;
}) {
  const { meta, summaryCardsHtml, tableHtml } = args;

  const reportWindow = window.open("", "_blank", "width=1200,height=900");
  if (!reportWindow) return false;

  const generatedAt =
    meta.generatedAt ||
    new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  const dateLabel = formatDateLabel(meta.startDate, meta.endDate);
  const companyHeader = buildCompanyHeader(meta.company);

  reportWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(meta.title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111827; background: #ffffff; }
          .toolbar { margin-bottom: 16px; }
          .print-btn { padding: 10px 14px; font-size: 14px; cursor: pointer; border: 1px solid #d1d5db; background: #111827; color: #ffffff; border-radius: 8px; }
          .report-shell { border: 1px solid #e5e7eb; border-radius: 18px; overflow: hidden; }
          .report-top { padding: 22px 24px 18px; border-bottom: 1px solid #e5e7eb; background: linear-gradient(180deg, #f9fafb 0%, #ffffff 100%); }
          .company-header { margin-bottom: 18px; }
          .company-brand { display: flex; align-items: center; gap: 16px; }
          .company-logo-wrap, .company-initials { width: 68px; height: 68px; border-radius: 16px; border: 1px solid #d1d5db; overflow: hidden; flex-shrink: 0; background: #111827; display: flex; align-items: center; justify-content: center; }
          .company-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
          .company-initials { color: #ffffff; font-size: 23px; font-weight: 700; letter-spacing: 0.04em; }
          .company-name { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 6px; }
          .company-details { font-size: 11px; line-height: 1.55; color: #4b5563; }
          .report-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
          .report-title-block h1 { margin: 0 0 8px; font-size: 20px; line-height: 1.1; color: #111827; }
          .report-subtitle { font-size: 12px; color: #6b7280; }
          .report-meta { min-width: 280px; padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 14px; background: #ffffff; font-size: 12px; line-height: 1.7; color: #374151; }
          .report-body { padding: 22px 24px 24px; }
          .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 22px; }
          .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; background: #ffffff; }
          .card-title { font-size: 11px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
          .card-value { font-size: 20px; line-height: 1.1; font-weight: 800; color: #111827; }
          .table-wrap { border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; font-size: 12px; vertical-align: top; }
          th { background: #f8fafc; color: #111827; font-weight: 800; }
          td { color: #374151; }
          .right { text-align: right; }
          .muted { color: #6b7280; }
          .footer { margin-top: 14px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #6b7280; }
          @media print {
            body { margin: 10px; }
            .toolbar { display: none !important; }
            .report-shell { border: none; border-radius: 0; }
            .report-top { padding: 0 0 14px; background: #ffffff; border-bottom: 1px solid #d1d5db; }
            .report-body { padding: 14px 0 0; }
            .card { break-inside: avoid; }
            .table-wrap { border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
        </div>

        <div class="report-shell">
          <div class="report-top">
            ${companyHeader}
            <div class="report-header-row">
              <div class="report-title-block">
                <h1>${escapeHtml(meta.title)}</h1>
                <div class="report-subtitle">Generated business report</div>
              </div>
              <div class="report-meta">
                <div><strong>Supplier:</strong> ${escapeHtml(meta.supplierLabel)}</div>
                <div><strong>Branch:</strong> ${escapeHtml(meta.branchLabel)}</div>
                <div><strong>Date:</strong> ${escapeHtml(dateLabel)}</div>
                <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
              </div>
            </div>
          </div>

          <div class="report-body">
            <div class="cards">${summaryCardsHtml}</div>
            <div class="table-wrap">${tableHtml}</div>
            <div class="footer">
              <div>${escapeHtml(meta.company?.name || "Company")}</div>
              <div>End of report</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  reportWindow.document.close();
  reportWindow.focus();
  return true;
}

export function shareReportViaWhatsApp(args: {
  meta: ReportFilterMeta;
  summaryLines: string[];
}) {
  const { meta, summaryLines } = args;

  const dateLabel = formatDateLabel(meta.startDate, meta.endDate);
  const companyLines = [
    meta.company?.name ? `${meta.company.name}` : "",
    meta.company?.address ? `${meta.company.address}` : "",
    meta.company?.phone ? `Phone: ${meta.company.phone}` : "",
    meta.company?.email ? `Email: ${meta.company.email}` : "",
  ].filter(Boolean);

  const text = [
    ...companyLines,
    `${meta.title}`,
    `Supplier: ${meta.supplierLabel}`,
    `Branch: ${meta.branchLabel}`,
    `Date: ${dateLabel}`,
    ...summaryLines,
  ].join("\n");

  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

export function buildSummaryCardHtml(title: string, value: string) {
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-value">${escapeHtml(value)}</div>
    </div>
  `;
}

export function buildTableHtml(args: {
  headers: { label: string; right?: boolean }[];
  rows: (string | number | null | undefined)[][];
}) {
  const thead = `
    <thead>
      <tr>
        ${args.headers
          .map((h) => `<th class="${h.right ? "right" : ""}">${escapeHtml(h.label)}</th>`)
          .join("")}
      </tr>
    </thead>
  `;

  const tbodyRows =
    args.rows.length > 0
      ? args.rows
          .map(
            (row) => `
        <tr>
          ${row
            .map((cell) => {
              const raw = String(cell ?? "-");
              const isRight =
                /^\s*(GHS|[\d,.\-]+)\s*/i.test(raw) || raw.match(/^\d+(\.\d+)?$/);
              return `<td class="${isRight ? "right" : ""}">${escapeHtml(raw)}</td>`;
            })
            .join("")}
        </tr>
      `
          )
          .join("")
      : `<tr><td colspan="${args.headers.length}" class="muted">No records found</td></tr>`;

  return `
    <table>
      ${thead}
      <tbody>${tbodyRows}</tbody>
    </table>
  `;
}
