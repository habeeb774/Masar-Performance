"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Hourglass, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { saveWeeklyDistributionAction } from "@/actions/plans";
import { checkDistribution, suggestWeeklyTargets } from "@/lib/distribution";
import { AR_MONTH_NAMES, fromDateKey } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { WEEKLY_PLAN_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DistributionGoal, WeekColumn } from "./types";

const shortDate = (key: string) => {
  const d = fromDateKey(key);
  return `${d.getUTCDate()} ${AR_MONTH_NAMES[d.getUTCMonth()]}`;
};

type Matrix = Record<string, Record<string, string>>;

function toMatrix(goals: DistributionGoal[], weeks: WeekColumn[], source: Record<string, Record<string, number>>): Matrix {
  return Object.fromEntries(goals.map((g) => [g.id, Object.fromEntries(weeks.map((w) => [String(w.index), String(source[g.id]?.[String(w.index)] ?? 0)]))]));
}

/**
 * Monthly goals × working weeks matrix. Each row should sum to the monthly
 * target (percentages repeat weekly); a mismatch needs a justification and,
 * for employees, the manager's approval.
 */
export function WeeklyDistributionEditor({
  planId,
  goals,
  weeks,
  initial,
  varianceNote,
  readOnly = false,
  isManager = false,
}: {
  planId: string;
  goals: DistributionGoal[];
  weeks: WeekColumn[];
  initial: Record<string, Record<string, number>>;
  varianceNote: string | null;
  readOnly?: boolean;
  /** managers' mismatches are auto-approved */
  isManager?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Matrix>(() => toMatrix(goals, weeks, initial));
  const [note, setNote] = useState(varianceNote ?? "");
  const [result, setResult] = useState<{ needsApproval: boolean; mismatches: { goal: string; diff: number }[] } | null>(null);
  const { run, pending } = useServerAction(saveWeeklyDistributionAction, {
    onSuccess: (d) => {
      setResult(d ?? null);
      router.refresh();
    },
  });

  const checks = useMemo(
    () =>
      Object.fromEntries(
        goals.map((g) => {
          const parts = weeks.map((w) => Number(values[g.id]?.[String(w.index)]) || 0);
          return [g.id, g.goalType === "PERCENTAGE" ? null : checkDistribution(parts, g.targetValue)];
        }),
      ),
    [goals, weeks, values],
  );
  const mismatch = goals.some((g) => checks[g.id] && !checks[g.id]!.ok);

  if (goals.length === 0 || weeks.length === 0) {
    return <EmptyState title="لا يوجد ما يوزع" description={weeks.length === 0 ? "لم تتولد أسابيع الخطة بعد — تتولد تلقائيًا عند اعتماد الخطة." : "لا توجد أهداف نشطة في الخطة."} />;
  }

  const suggest = () => {
    setResult(null);
    setValues(
      Object.fromEntries(
        goals.map((g) => {
          const split = suggestWeeklyTargets({ goalType: g.goalType, targetValue: g.targetValue, dueDate: g.dueDate }, weeks);
          return [g.id, Object.fromEntries(weeks.map((w, i) => [String(w.index), String(split[i] ?? 0)]))];
        }),
      ),
    );
  };

  const save = () => {
    const targets = Object.fromEntries(goals.map((g) => [g.id, Object.fromEntries(weeks.map((w) => [String(w.index), Number(values[g.id]?.[String(w.index)]) || 0]))]));
    run({ planId, targets, varianceNote: mismatch ? note : null });
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table className="min-w-[720px]">
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky start-0 z-10 min-w-48 bg-muted text-start text-xs">الهدف</TableHead>
              {weeks.map((w) => (
                <TableHead key={w.index} className="min-w-28 py-2 text-center text-xs">
                  <span className="block font-semibold text-foreground">الفترة {w.index}</span>
                  <span className="block font-normal">
                    {shortDate(w.start)} – {shortDate(w.end)}
                  </span>
                  <span className="block font-normal">{formatNumber(w.workDays.length)} أيام عمل</span>
                  {w.status !== "DRAFT" && <EnumBadge map={WEEKLY_PLAN_STATUS_LABELS} value={w.status} className="mt-1" />}
                </TableHead>
              ))}
              <TableHead className="min-w-32 text-center text-xs">المجموع / الهدف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {goals.map((g) => {
              const check = checks[g.id];
              return (
                <TableRow key={g.id}>
                  <TableCell className="sticky start-0 z-10 bg-card py-2 text-start whitespace-normal">
                    <p className="text-sm font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatNumber(g.targetValue, 2)} {g.unit}
                      {g.goalType === "PERCENTAGE" && " · نسبة ثابتة أسبوعيًا"}
                    </p>
                  </TableCell>
                  {weeks.map((w) => (
                    <TableCell key={w.index} className="p-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        disabled={readOnly}
                        value={values[g.id]?.[String(w.index)] ?? "0"}
                        onChange={(e) => {
                          setResult(null);
                          const v = e.target.value;
                          setValues((m) => ({ ...m, [g.id]: { ...m[g.id], [String(w.index)]: v } }));
                        }}
                        className="h-8 text-center tabular-nums"
                        aria-label={`${g.name} — الفترة ${w.index}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    {check === null ? (
                      <StatusBadge tone="neutral" dot={false}>
                        لا يلزم التطابق
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

      {!readOnly && mismatch && (
        <div className="space-y-1.5 rounded-xl border border-warning/40 bg-warning-soft/40 p-3">
          <Label htmlFor="variance-note">مبرر اختلاف المجموع عن الهدف الشهري</Label>
          <Textarea id="variance-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: إجازة في الأسبوع الثالث، سيتم التعويض في الشهر القادم" />
          <p className="text-xs text-muted-foreground">
            {isManager ? "بصفتك مديرًا سيُعتمد الفرق مباشرة مع حفظ المبرر." : "سيُرسل التوزيع للمدير لاعتماد الفرق قبل تفعيل الأسابيع."}
          </p>
        </div>
      )}
      {readOnly && varianceNote && (
        <Alert>
          <AlertTitle>مبرر الفرق</AlertTitle>
          <AlertDescription>{varianceNote}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert className={cn(result.needsApproval ? "border-pending/40 bg-pending-soft/40" : "border-success/40 bg-success-soft/40")}>
          {result.needsApproval ? <Hourglass /> : <CheckCircle2 />}
          <AlertTitle>{result.needsApproval ? "أُرسل التوزيع للمدير لاعتماد الفرق" : "تم تفعيل التوزيع الأسبوعي"}</AlertTitle>
          {result.mismatches.length > 0 && (
            <AlertDescription>
              فروق: {result.mismatches.map((m) => `${m.goal} (${m.diff > 0 ? "+" : ""}${m.diff})`).join("، ")}
            </AlertDescription>
          )}
        </Alert>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={suggest} disabled={pending}>
            <Sparkles /> اقتراح تلقائي
          </Button>
          <Button type="button" onClick={save} disabled={pending || (mismatch && note.trim().length < 3)}>
            {pending ? <Spinner /> : <Save />} حفظ التوزيع
          </Button>
        </div>
      )}
    </div>
  );
}
