import type { SimpleInfoRowProps } from "@/features/reports/types";

export default function SimpleInfoRow({
  label,
  value,
  valueClassName = "text-white",
}: SimpleInfoRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 p-3">
      <span className="text-slate-400">{label}</span>
      <span className={`font-medium ${valueClassName}`}>{value}</span>
    </div>
  );
}