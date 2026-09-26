"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/shared/page";
import { BarChart3 } from "lucide-react";

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

function NoData() {
  return <EmptyState icon={BarChart3} title="لا توجد بيانات كافية للرسم" className="h-full min-h-48 border-none" />;
}

/** Line chart over time (e.g. monthly achievement trend). X axis reversed for RTL. */
export function TrendChart({
  data,
  series,
  xKey = "label",
  height = 260,
  unit = "%",
}: {
  data: Record<string, string | number | null>[];
  series: { key: string; label: string }[];
  xKey?: string;
  height?: number;
  unit?: string;
}) {
  const hasData = data.some((d) => series.some((s) => typeof d[s.key] === "number"));
  if (!hasData) return <NoData />;
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: `var(--chart-${i + 1})` }]));
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} reversed tickLine={false} axisLine={false} tick={axisTick} tickMargin={8} />
        <YAxis orientation="right" tickLine={false} axisLine={false} tick={axisTick} width={36} domain={[0, 100]} unit={unit} />
        <ChartTooltip cursor={{ strokeDasharray: "4 4" }} content={<ChartTooltipContent />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} type="monotone" stroke={`var(--color-${s.key})`} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} connectNulls />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

/** Grouped bars per category (e.g. productivity vs quality per employee). */
export function GroupedBarChart({
  data,
  series,
  xKey = "name",
  height = 260,
  max = 100,
}: {
  data: Record<string, string | number | null>[];
  series: { key: string; label: string }[];
  xKey?: string;
  height?: number;
  max?: number;
}) {
  if (data.length === 0) return <NoData />;
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: `var(--chart-${i + 1})` }]));
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} reversed tickLine={false} axisLine={false} tick={axisTick} tickMargin={8} interval={0} />
        <YAxis orientation="right" tickLine={false} axisLine={false} tick={axisTick} width={36} domain={[0, max]} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[4, 4, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

const STATUS_SERIES = [
  { key: "COMPLETED", label: "مكتمل", color: "var(--success)" },
  { key: "PENDING_APPROVAL", label: "بانتظار الاعتماد", color: "var(--pending)" },
  { key: "NEEDS_REVISION", label: "يحتاج تحسين", color: "var(--danger)" },
  { key: "IN_PROGRESS", label: "قيد التنفيذ", color: "var(--info)" },
  { key: "BLOCKED", label: "معلق", color: "var(--warning)" },
];

/** Stacked horizontal bars: workflow stage × system status. */
export function StageStatusChart({ data, height }: { data: { label: string; [status: string]: string | number }[]; height?: number }) {
  if (data.length === 0) return <NoData />;
  const config: ChartConfig = Object.fromEntries(STATUS_SERIES.map((s) => [s.key, { label: s.label, color: s.color }]));
  return (
    <ChartContainer config={config} className="w-full" style={{ height: height ?? Math.max(180, data.length * 44 + 60) }}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 4, left: 8, bottom: 0 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" reversed tickLine={false} axisLine={false} tick={axisTick} />
        <YAxis type="category" dataKey="label" orientation="right" tickLine={false} axisLine={false} tick={axisTick} width={110} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {STATUS_SERIES.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="s"
            fill={`var(--color-${s.key})`}
            stroke="var(--card)"
            strokeWidth={2}
            radius={i === STATUS_SERIES.length - 1 ? [4, 0, 0, 4] : 0}
            maxBarSize={22}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** Horizontal percentage bars for goal completion. */
export function PercentBars({ data, height }: { data: { name: string; pct: number }[]; height?: number }) {
  if (data.length === 0) return <NoData />;
  const config: ChartConfig = { pct: { label: "نسبة الإنجاز", color: "var(--chart-1)" } };
  const rows = data.map((d) => ({ ...d, pct: Math.min(d.pct, 150) }));
  return (
    <ChartContainer config={config} className="w-full" style={{ height: height ?? Math.max(160, rows.length * 38 + 30) }}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" reversed domain={[0, 100]} tickLine={false} axisLine={false} tick={axisTick} unit="%" />
        <YAxis type="category" dataKey="name" orientation="right" tickLine={false} axisLine={false} tick={axisTick} width={140} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent />} />
        <Bar dataKey="pct" fill="var(--color-pct)" radius={[4, 0, 0, 4]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  );
}
