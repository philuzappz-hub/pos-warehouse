import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricCardProps } from "@/features/reports/types";

export default function MetricCard({
  title,
  value,
  subtitle,
  valueClassName = "text-white",
}: MetricCardProps) {
  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClassName}`}>{value}</div>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}