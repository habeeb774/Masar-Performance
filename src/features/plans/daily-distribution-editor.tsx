"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, NotionSyncedTag } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { saveDailyDistributionAction, suggestDailyAction } from "@/actions/plans";
import { checkDistribution } from "@/lib/distribution";
import { AR_DAY_NAMES, AR_MONTH_NAMES, dayOfWeek, fromDateKey } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import type { GoalTypeKey } from "@/lib/labels";

export interface DailyGoalRow {
  /** weekly goal id */
  id: string;
  name: string;
  unit: string;
  goalType: GoalTypeKey;
  targetValue: number;
  notion: boolean;
}

type Matrix = Record<string, Record<string, string>>;

/** Weekly goals × working days of the week, saved as DISTRIBUTED daily tasks. */
export function DailyDistributionEditor({
  weeklyPlanId,
  goals,
  days,
  initial,
  today,
  readOnly = false,
}: {
  weeklyPlanId: string;
  goals: DailyGoalRow[];
  days: string[];
  initial: Record<string, Record<string, number>>;
  today: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Matrix>(() =>
    Object.fromEntries(goals.map((g) => [g.id, Object.fromEntries(days.map((d) => [d, String(initial[g.id]?.[d] ?? 0)]))])),
  );
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const save = useServerAction(saveDailyDistributionAction, {
    onSuccess: (d) => {
      setWarnings(d?.warnings ?? []);
      router.refresh();
    },
  });
  const suggest = useServerAction(suggestDailyAction, {
    silent: true,
    onSuccess: (d) => {
      if (!d) return;
      setWarnings(null);
      setValues(Object.fromEntries(goals.map((g) => [g.id, Object.fromEntries(days.map((day) => [day, String(d.suggestions[g.id]?.[day] ?? 0)]))])));
    },
  });

  const checks = useMemo(
    () =>
      Object.fromEntries(
        goals.map((g) => [g.id, g.goalType === "PERCENTAGE" ? null : checkDistribution(days.map((d) => Number(values[g.id]?.[d]) || 0), g.targetValue)]),
      ),
    [goals, days, values],
  );

  if (goals.length === 0 || days.length === 0) {
    return <EmptyState title="لا يوجد ما يوزع على الأيام" description={days.length === 0 ? "لا توجد أيام عمل في هذا الأسبوع." : "لا توجد أهداف أسبوعية لهذا الأسبوع."} />;
  }

  const submit = () =>
    save.run({
      weeklyPlanId,
      targets: Object.fromEntries(goals.map((g) => [g.id, Object.fromEntries(days.map((d) => [d, Number(values[g.id]?.[d]) || 0]))])),
    });

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table className="min-w-[680px]">
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky start-0 z-10 min-w-44 bg-muted text-start text-xs">هدف الأسبوع</TableHead>
              {days.map((d) => {
                const date = fromDateKey(d);
                return (
                  <TableHead key={d} className={`min-w-24 py-2 text-center text-xs ${d === today ? "bg-primary/10 text-primary" : ""}`}>
                    <span className="block font-semibold">{AR_DAY_NAMES[dayOfWeek(d)]}</span>
                    <span className="block font-normal">
                      {date.getUTCDate()} {AR_MONTH_NAMES[date.getUTCMonth()]}
                    </span>
                  </TableHead>
                );
              })}
              <TableHead className="min-w-28 text-center text-xs">المجموع</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {goals.map((g) => {
              const check = checks[g.id];
              return (
                <TableRow key={g.id}>
                  <TableCell className="sticky start-0 z-10 bg-card py-2 text-start whitespace-normal">
                    <p className="text-sm font-medium">{g.name}</p>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      {formatNumber(g.targetValue, 2)} {g.unit}
                      {g.notion && <NotionSyncedTag />}
                    </div>
                  </TableCell>
                  {days.map((d) => (
                    <TableCell key={d} className="p-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        disabled={readOnly}
                        value={values[g.id]?.[d] ?? "0"}
                        onChange={(e) => {
                          const v = e.target.value;
                          setWarnings(null);
                          setValues((m) => ({ ...m, [g.id]: { ...m[g.id], [d]: v } }));
                        }}
                        className="h-8 text-center tabular-nums"
                        aria-label={`${g.name} — ${d}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    {check === null ? (
                      <StatusBadge tone="neutral" dot={false}>
                        نسبة
                      </StatusBadge>
                    ) : check!.ok ? (
                      <StatusBadge tone="success" dot={false}>
                        <CheckCircle2 className="size-3.5" /> {formatNumber(check!.sum, 2)}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning" dot={false}>
                        {formatNumber(check!.sum, 2)} ({check!.diff > 0 ? "+" : ""}
                        {formatNumber(check!.diff, 2)})
                      </StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {warnings && (
        <Alert className={warnings.length ? "border-warning/40 bg-warning-soft/40" : "border-success/40 bg-success-soft/40"}>
          {warnings.length ? <AlertTriangle /> : <CheckCircle2 />}
          <AlertTitle>{warnings.length ? "تم الحفظ مع فروق عن هدف الأسبوع" : "تم توليد مهام الأيام من التوزيع"}</AlertTitle>
          {warnings.length > 0 && <AlertDescription>{warnings.join("، ")}</AlertDescription>}
        </Alert>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => suggest.run(weeklyPlanId)} disabled={suggest.pending || save.pending}>
            {suggest.pending ? <Spinner /> : <Sparkles />} اقتراح تلقائي
          </Button>
          <Button type="button" onClick={submit} disabled={save.pending}>
            {save.pending ? <Spinner /> : <Save />} حفظ توزيع الأيام
          </Button>
        </div>
      )}
    </div>
  );
}
