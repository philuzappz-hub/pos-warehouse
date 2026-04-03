import { CURRENCY, companyInitials, escapeHtml, money } from "@/features/reports/helpers";
import type { BranchRow, CompanyRow, SalesSummary } from "@/features/reports/types";

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

export function openPdfWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Please allow popups to export PDF.");
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
}

export const basePdfCss = `
  <style>
    :root {
      --border:#d9dee7;
      --muted:#6b7280;
      --text:#111827;
      --soft:#f8fafc;
      --soft2:#eef2f7;
      --accent:#0f172a;
      --good:#166534;
      --warn:#92400e;
      --bad:#991b1b;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      padding: 18px;
      color: var(--text);
      background: white;
    }
    .paper {
      max-width: 1050px;
      margin: 0 auto;
    }
    .printBtn {
      margin-bottom: 12px;
    }
    .header {
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:20px;
      border-bottom: 2px solid var(--border);
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .brandRow {
      display:flex;
      gap:12px;
      align-items:flex-start;
    }
    .logoBadge {
      width:58px;
      height:58px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: var(--soft);
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight: 900;
      letter-spacing: .5px;
      overflow:hidden;
    }
    .logoImg {
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
    }
    .brand {
      font-weight: 900;
      font-size: 19px;
    }
    .title {
      font-weight: 800;
      font-size: 16px;
      margin-top: 2px;
    }
    .sub {
      font-size: 12px;
      color: var(--muted);
      margin-top: 5px;
      line-height: 1.5;
    }
    .meta {
      text-align:right;
      font-size: 12px;
      color: var(--muted);
      min-width: 220px;
    }
    .meta b {
      color: var(--text);
    }
    .section {
      margin-top: 14px;
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      background: white;
    }
    .sectionHead {
      padding: 10px 14px;
      background: var(--soft2);
      border-bottom: 1px solid var(--border);
      font-weight: 800;
      font-size: 14px;
    }
    .sectionBody {
      padding: 14px;
    }
    .grid2 {
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .miniBox {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      background: #fff;
    }
    .miniTitle {
      font-weight: 800;
      margin-bottom: 8px;
    }
    .muted {
      color: var(--muted);
    }
    .kv {
      display:grid;
      grid-template-columns: 1.5fr 1fr;
      border: 1px solid var(--border);
      border-bottom: none;
    }
    .kv:last-child {
      border-bottom: 1px solid var(--border);
    }
    .kv .label,
    .kv .value {
      padding: 10px 12px;
      font-size: 12px;
    }
    .kv .label {
      background: #fff;
      font-weight: 600;
      border-right: 1px solid var(--border);
    }
    .kv .value {
      text-align: right;
      background: #fff;
    }
    .rowSoft .label,
    .rowSoft .value {
      background: var(--soft);
    }
    .rowStrong .label,
    .rowStrong .value {
      background: #eef6ff;
      font-weight: 800;
    }
    .rowResultShort .label,
    .rowResultShort .value {
      background: #fef2f2;
      color: var(--bad);
      font-weight: 800;
    }
    .rowResultOver .label,
    .rowResultOver .value {
      background: #fff7ed;
      color: var(--warn);
      font-weight: 800;
    }
    .rowResultBalanced .label,
    .rowResultBalanced .value {
      background: #f0fdf4;
      color: var(--good);
      font-weight: 800;
    }
    .summaryGrid {
      display:grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .summaryCard {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      background: #fff;
    }
    .summaryCard .k {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 6px;
    }
    .summaryCard .v {
      font-weight: 900;
      font-size: 20px;
    }
    .noteBox {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      background: #fff;
      font-size: 12px;
      line-height: 1.65;
    }
    .sigRow {
      display:grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      margin-top: 24px;
    }
    .sigBox {
      font-size: 12px;
    }
    .sigTitle {
      font-weight: 800;
      margin-bottom: 24px;
    }
    .sigLine {
      border-bottom: 1px solid #9ca3af;
      height: 20px;
      margin-top: 8px;
    }
    .sigLabel {
      color: var(--muted);
      margin-top: 6px;
    }
    .footerNote {
      margin-top: 16px;
      font-size: 11px;
      color: var(--muted);
    }
    @media print {
      .printBtn { display:none; }
      body { padding:0; }
      .paper { max-width:none; }
    }
  </style>
`;

export async function exportFinancialReportPdf(args: {
  companyLogoUrl?: string | null;
  companyName?: string | null;
  company: CompanyRow | null;
  selectedBranch: BranchRow | null;
  scopedBranchId: string | null;
  startDate: string;
  endDate: string;
  salesSummary: SalesSummary;
  netSalesValue: number;
  inventoryValuationBasis: string;
}) {
  const {
    companyLogoUrl,
    companyName,
    company,
    selectedBranch,
    scopedBranchId,
    startDate,
    endDate,
    salesSummary,
    netSalesValue,
    inventoryValuationBasis,
  } = args;

  const logoDataUrl = await urlToDataUrl(companyLogoUrl || company?.logo_url || null);

  const co = (company?.name || companyName || "Company") as string;
  const initials = companyInitials(co);
  const scopeLine = scopedBranchId ? selectedBranch?.name || "Selected Branch" : "All Branches";
  const logoHtml = logoDataUrl
    ? `<img class="logoImg" src="${logoDataUrl}" alt="Logo" />`
    : escapeHtml(initials);

  const html = `
    <html>
      <head>
        <title>${escapeHtml("Financial Report")} (${escapeHtml(
    `${startDate} to ${endDate}`
  )})</title>
        ${basePdfCss}
      </head>
      <body>
        <div class="paper">
          <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

          <div class="header">
            <div class="brandRow">
              <div class="logoBadge">${logoHtml}</div>
              <div>
                <div class="brand">${escapeHtml(co)}</div>
                <div class="title">Financial Report</div>
                <div class="sub">
                  ${escapeHtml(`${startDate} to ${endDate}`)}<br/>
                  ${escapeHtml(scopeLine)}
                </div>
              </div>
            </div>
            <div class="meta">
              <div><b>Generated:</b> ${escapeHtml(new Date().toLocaleString())}</div>
              <div><b>Currency:</b> ${CURRENCY}</div>
            </div>
          </div>

          <div class="section">
            <div class="sectionHead">Financial Summary</div>
            <div class="sectionBody">
              <div class="kv">
                <div class="label">Gross Revenue</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.totalAmount))}</div>
              </div>
              <div class="kv">
                <div class="label">Net Sales</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(netSalesValue))}</div>
              </div>
              <div class="kv">
                <div class="label">Estimated Cost of Sales</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.estimatedCostOfSales)
                )}</div>
              </div>
              <div class="kv">
                <div class="label">Gross Profit</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.grossProfit))}</div>
              </div>
              <div class="kv rowSoft">
                <div class="label">Operating Profit</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.operatingProfit)
                )}</div>
              </div>
              <div class="kv">
                <div class="label">Total Paid</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.totalPaidAmount)
                )}</div>
              </div>
              <div class="kv">
                <div class="label">Cash Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.cashCollectedAmount)
                )}</div>
              </div>
              <div class="kv">
                <div class="label">Momo Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.momoCollectedAmount)
                )}</div>
              </div>
              <div class="kv">
                <div class="label">Card Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.cardCollectedAmount)
                )}</div>
              </div>
              <div class="kv">
                <div class="label">Outstanding Debt</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.outstandingDebt)
                )}</div>
              </div>
              <div class="kv">
                <div class="label">Inventory Value</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.inventoryValue)
                )}</div>
              </div>
              <div class="kv rowSoft">
                <div class="label">Tracked Liquid Position</div>
                <div class="value">${CURRENCY} ${escapeHtml(
                  money(salesSummary.totalTrackedLiquidPosition)
                )}</div>
              </div>
            </div>
          </div>

          <div class="footerNote">
            Inventory valuation basis: ${escapeHtml(inventoryValuationBasis)}<br/>
            ${escapeHtml(company?.receipt_footer || "Powered by Philuz Appz")}
          </div>
        </div>
      </body>
    </html>
  `;

  openPdfWindow(html);
}

export async function printReconciliationSlip(args: {
  companyLogoUrl?: string | null;
  companyName?: string | null;
  company: CompanyRow | null;
  selectedBranch: BranchRow | null;
  reconciliationDate: string;
  reconciliationNotes: string;
  salesSummary: SalesSummary;
  openingFloatNum: number;
  reconPreview: {
    cashSalesReceived: number;
    approvedCashReturns: number;
    approvedCashExpenses: number;
  };
  expectedCashForClosing: number;
  actualCashCountedNum: number;
  reconciliationStatus: string;
  reconciliationShortAmount: number;
  reconciliationExcessAmount: number;
  varianceLabel: string;
  paymentBreakdownLine: string;
  formulaLine: string;
}) {
  const {
    companyLogoUrl,
    companyName,
    company,
    selectedBranch,
    reconciliationDate,
    reconciliationNotes,
    salesSummary,
    openingFloatNum,
    reconPreview,
    expectedCashForClosing,
    actualCashCountedNum,
    reconciliationStatus,
    reconciliationShortAmount,
    reconciliationExcessAmount,
    varianceLabel,
    paymentBreakdownLine,
    formulaLine,
  } = args;

  const branchLabel = selectedBranch?.name || "Selected Branch";
  const logoDataUrl = await urlToDataUrl(companyLogoUrl || company?.logo_url || null);
  const title = "Daily Cash Closing Report";
  const subtitle = `Closing Date: ${reconciliationDate}`;

  const companyDisplay = company?.name || companyName || "Company";
  const initials = companyInitials(companyDisplay);
  const logoHtml = logoDataUrl
    ? `<img class="logoImg" src="${logoDataUrl}" alt="Logo" />`
    : escapeHtml(initials);

  const varianceRowClass =
    reconciliationStatus === "Balanced"
      ? "rowResultBalanced"
      : reconciliationStatus === "Short"
      ? "rowResultShort"
      : "rowResultOver";

  const varianceAmountText =
    reconciliationStatus === "Balanced"
      ? `${CURRENCY} ${escapeHtml(money(0))}`
      : reconciliationStatus === "Short"
      ? `${CURRENCY} ${escapeHtml(money(reconciliationShortAmount))}`
      : `${CURRENCY} ${escapeHtml(money(reconciliationExcessAmount))}`;

  const html = `
    <html>
      <head>
        <title>${escapeHtml(title)} - ${escapeHtml(branchLabel)} - ${escapeHtml(
    reconciliationDate
  )}</title>
        ${basePdfCss}
      </head>
      <body>
        <div class="paper">
          <button class="printBtn" onclick="window.print()">Print / Save as PDF</button>

          <div class="header">
            <div class="brandRow">
              <div class="logoBadge">${logoHtml}</div>
              <div>
                <div class="brand">${escapeHtml(companyDisplay)}</div>
                <div class="title">${escapeHtml(title)}</div>
                <div class="sub">
                  ${escapeHtml(subtitle)}<br/>
                  ${escapeHtml(branchLabel)}
                </div>
              </div>
            </div>
            <div class="meta">
              <div><b>Generated:</b> ${escapeHtml(new Date().toLocaleString())}</div>
              <div><b>Status:</b> ${escapeHtml(varianceLabel)}</div>
              <div><b>Currency:</b> ${CURRENCY}</div>
            </div>
          </div>

          <div class="summaryGrid">
            <div class="summaryCard">
              <div class="k">Expected Closing Cash</div>
              <div class="v">${CURRENCY} ${escapeHtml(money(expectedCashForClosing))}</div>
            </div>
            <div class="summaryCard">
              <div class="k">Actual Cash Counted</div>
              <div class="v">${CURRENCY} ${escapeHtml(money(actualCashCountedNum))}</div>
            </div>
            <div class="summaryCard">
              <div class="k">${escapeHtml(varianceLabel)}</div>
              <div class="v">${varianceAmountText}</div>
            </div>
          </div>

          <div class="section">
            <div class="sectionHead">1. Closing Information</div>
            <div class="sectionBody">
              <div class="grid2">
                <div class="miniBox">
                  <div class="miniTitle">Branch Details</div>
                  <div class="muted" style="font-size:12px; line-height:1.6;">
                    <div><b>Company:</b> ${escapeHtml(companyDisplay)}</div>
                    <div><b>Branch:</b> ${escapeHtml(branchLabel)}</div>
                    <div><b>Address:</b> ${escapeHtml(selectedBranch?.address || "-")}</div>
                    <div><b>Phone:</b> ${escapeHtml(selectedBranch?.phone || "-")}</div>
                    <div><b>Email:</b> ${escapeHtml(selectedBranch?.email || "-")}</div>
                  </div>
                </div>

                <div class="miniBox">
                  <div class="miniTitle">Closing Notes</div>
                  <div class="muted" style="font-size:12px; line-height:1.7;">
                    ${escapeHtml(reconciliationNotes || "No notes added.")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="sectionHead">2. Sales and Collections Summary</div>
            <div class="sectionBody">
              <div class="kv rowSoft">
                <div class="label">Gross Revenue</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.totalAmount))}</div>
              </div>
              <div class="kv">
                <div class="label">Total Paid Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.totalPaidAmount))}</div>
              </div>
              <div class="kv">
                <div class="label">Outstanding Debt</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.outstandingDebt))}</div>
              </div>
              <div class="kv">
                <div class="label">Cash Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.cashCollectedAmount))}</div>
              </div>
              <div class="kv">
                <div class="label">Momo Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.momoCollectedAmount))}</div>
              </div>
              <div class="kv">
                <div class="label">Card Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.cardCollectedAmount))}</div>
              </div>
              <div class="kv rowSoft">
                <div class="label">Total Non-Cash Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(salesSummary.nonCashCollectedAmount))}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="sectionHead">3. Cash Drawer Reconciliation</div>
            <div class="sectionBody">
              <div class="kv">
                <div class="label">Opening Float</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(openingFloatNum))}</div>
              </div>
              <div class="kv">
                <div class="label">Add: Cash Sales Received</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(reconPreview.cashSalesReceived))}</div>
              </div>
              <div class="kv">
                <div class="label">Less: Approved Cash Returns</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(reconPreview.approvedCashReturns))}</div>
              </div>
              <div class="kv">
                <div class="label">Less: Approved Cash Expenses</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(reconPreview.approvedCashExpenses))}</div>
              </div>
              <div class="kv rowStrong">
                <div class="label">Expected Closing Cash</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(expectedCashForClosing))}</div>
              </div>
              <div class="kv">
                <div class="label">Actual Cash Counted</div>
                <div class="value">${CURRENCY} ${escapeHtml(money(actualCashCountedNum))}</div>
              </div>
              <div class="kv ${varianceRowClass}">
                <div class="label">${escapeHtml(varianceLabel)}</div>
                <div class="value">${varianceAmountText}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="sectionHead">4. Reconciliation Basis</div>
            <div class="sectionBody">
              <div class="noteBox">
                <div style="font-weight:800; margin-bottom:8px;">Total Paid Breakdown</div>
                <div class="muted">${escapeHtml(paymentBreakdownLine)}</div>

                <div style="font-weight:800; margin:14px 0 8px;">Cash Drawer Formula</div>
                <div class="muted">
                  Expected Closing Cash = Opening Float + Cash Sales Received − Approved Cash Returns − Approved Cash Expenses
                </div>
                <div class="muted" style="margin-top:6px;">${escapeHtml(formulaLine)}</div>

                <div style="margin-top:14px;" class="muted">
                  Momo and card payments are received successfully but are not part of the physical cash drawer.
                  Therefore, they are excluded from till balancing and physical cash count.
                </div>
              </div>
            </div>
          </div>

          <div class="sigRow">
            <div class="sigBox">
              <div class="sigTitle">Prepared by</div>
              <div class="sigLine"></div>
              <div class="sigLabel">Cashier / Officer</div>
            </div>
            <div class="sigBox">
              <div class="sigTitle">Checked by</div>
              <div class="sigLine"></div>
              <div class="sigLabel">Supervisor</div>
            </div>
            <div class="sigBox">
              <div class="sigTitle">Approved by</div>
              <div class="sigLine"></div>
              <div class="sigLabel">Manager / Admin</div>
            </div>
          </div>

          <div class="footerNote">
            ${escapeHtml(company?.receipt_footer || "Powered by Philuz Appz")}
          </div>
        </div>
      </body>
    </html>
  `;

  openPdfWindow(html);
}