import { money } from "@/features/suppliers/helpers";
import type { SupplierStatementEntry } from "@/features/suppliers/types";

type Props = {
  entries: SupplierStatementEntry[];
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function friendlyTypeLabel(type: string) {
  const raw = String(type || "").toLowerCase();
  if (raw === "purchase") return "Purchase";
  if (raw === "payment") return "Payment";
  if (raw === "credit_applied") return "Credit Applied";
  if (raw === "overpayment_credit") return "Overpayment Credit";
  if (raw === "opening_balance") return "Opening Balance";
  if (raw === "credit_note_issued") return "Credit Note Issued";
  if (raw === "credit_note_applied") return "Credit Note Applied";
  return raw.replace(/_/g, " ");
}

function typeClassName(type: string) {
  const raw = String(type || "").toLowerCase();
  if (raw === "purchase") return "text-amber-300";
  if (raw === "payment") return "text-emerald-300";
  if (raw === "credit_applied") return "text-cyan-300";
  if (raw === "overpayment_credit") return "text-sky-300";
  if (raw === "opening_balance") return "text-violet-300";
  if (raw === "credit_note_issued") return "text-fuchsia-300";
  if (raw === "credit_note_applied") return "text-indigo-300";
  return "text-slate-200";
}

function normalizeRows(entries: SupplierStatementEntry[]) {
  return entries.map((entry, index) => ({
    id: entry.id || `entry-${index}`,
    date: formatDate(entry.entry_date),
    type: String(entry.entry_type || "entry").toLowerCase(),
    reference: entry.reference || "—",
    description: entry.description || "—",
    debit: roundMoney(safeNumber(entry.debit)),
    credit: roundMoney(safeNumber(entry.credit)),
    runningBalance: roundMoney(safeNumber(entry.running_balance)),
  }));
}

export default function SupplierStatementTable({ entries }: Props) {
  const rows = normalizeRows(entries);

  if (!rows.length) {
    return (
      <div className="p-6 text-sm text-slate-400">
        No supplier statement entries found.
      </div>
    );
  }

  const lastIndex = rows.length - 1;

  return (
    <table className="min-w-full text-sm">
      <thead className="bg-slate-900/90 text-slate-300">
        <tr>
          <th className="px-4 py-3 text-left font-medium">Date</th>
          <th className="px-4 py-3 text-left font-medium">Type</th>
          <th className="px-4 py-3 text-left font-medium">Reference</th>
          <th className="px-4 py-3 text-left font-medium">Description</th>
          <th className="px-4 py-3 text-right font-medium">Debit</th>
          <th className="px-4 py-3 text-right font-medium">Credit</th>
          <th className="px-4 py-3 text-right font-medium">Running Balance</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row, index) => {
          const balance = row.runningBalance;

          const isCredit = balance < 0;
          const isZero = balance === 0;

          const balanceColor = isZero
            ? "text-white"
            : isCredit
            ? "text-emerald-400"
            : "text-amber-400";

          const displayAmount = Math.abs(balance);

          return (
            <tr
              key={row.id}
              className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/40"
            >
              <td className="px-4 py-3 text-slate-200">{row.date}</td>

              <td className={`px-4 py-3 font-medium ${typeClassName(row.type)}`}>
                {friendlyTypeLabel(row.type)}
              </td>

              <td className="px-4 py-3 text-slate-200">{row.reference}</td>

              <td className="px-4 py-3 text-slate-300">{row.description}</td>

              <td className="px-4 py-3 text-right text-amber-300">
                {row.debit > 0 ? `GHS ${money(row.debit)}` : "—"}
              </td>

              <td className="px-4 py-3 text-right text-emerald-300">
                {row.credit > 0 ? `GHS ${money(row.credit)}` : "—"}
              </td>

              <td className={`px-4 py-3 text-right font-semibold ${balanceColor}`}>
                GHS {money(displayAmount)}

                {index === lastIndex && (
                  <div className="mt-1 text-xs opacity-80">
                    {isZero && <span>Settled</span>}
                    {isCredit && <span>Supplier owes you (Credit)</span>}
                    {!isCredit && !isZero && <span>You owe supplier</span>}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}