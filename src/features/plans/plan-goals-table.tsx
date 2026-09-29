"use client";

import { dutyOf, groupByDuty } from "@/lib/duties";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Check, CheckCircle2, ChevronDown, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, NotionSyncedTag } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { ActionButton } from "@/components/shared/action-button";
import { cancelGoalAction, deleteGoalAction, updateGoalAction } from "@/actions/plans";
import { useServerAction } from "@/hooks/use-server-action";
import { formatDateAr, formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { DATE_BASIS_LABELS } from "@/lib/notion/filter-rule";
import { DISTRIBUTION_MODE_LABELS, GOAL_SOURCE_LABELS, GOAL_STATUS_LABELS, GOAL_TYPE_LABELS, KPI_CATEGORY_LABELS, PRIORITY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { NotionSourceOption, TestPeriod } from "@/features/goals/types";
import { GoalForm, goalFormDefaults } from "./goal-form";
import { NotionBreakdownGrid, NotionQualityGrid } from "./notion-breakdown";
import { GoalAchievementControls, type ManualAccess } from "./goal-achievement";
import type { PlanGoalRow } from "./types";

export function WeightTotalBadge({ goals }: { goals: { weight: number; status: string }[] }) {
  const total = Math.round(goals.filter((g) => g.status !== "CANCELLED").reduce((a, g) => a + g.weight, 0) * 100) / 100;
  const ok = Math.abs(total - 100) < 0.01;
  return (
    <StatusBadge tone={ok ? "success" : "warning"}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
      مجموع الأوزان {formatNumber(total, 2)}%
    </StatusBadge>
  );
}

/**
 * Monthly goals of a plan with add / edit / delete / cancel and an expandable
 * Notion breakdown per goal.
 */
export function PlanGoalsTable({
  planId,
  employeeId,
  goals,
  sources,
  testPeriod,
  dates,
  canEdit,
  canDelete,
  canCancel,
}: {
  planId: string;
  employeeId: string;
  goals: PlanGoalRow[];
  sources: NotionSourceOption[];
  testPeriod: TestPeriod;
  dates: { start: string; end: string };
  canEdit: boolean;
  canDelete: boolean;
  canCancel: boolean;
}) {
  const [editing, setEditing] = useState<PlanGoalRow | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openForm = (goal?: PlanGoalRow) => {
    setEditing(goal);
    setFormOpen(true);
  };
  const hasActions = canEdit || canDelete || canCancel;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">الأهداف الشهرية ({goals.filter((g) => g.status !== "CANCELLED").length})</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <WeightTotalBadge goals={goals} />
          {canEdit && (
            <Button size="sm" onClick={() => openForm()}>
              <Plus /> إضافة هدف
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <EmptyState icon={Target} title="لا توجد أهداف في هذه الخطة" description={canEdit ? "أضف الأهداف الشهرية ومستهدفاتها وأوزانها." : undefined} />
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table className="min-w-[1000px]">
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="text-start text-xs">الهدف</TableHead>
                  <TableHead className="text-start text-xs">النوع / المصدر</TableHead>
                  <TableHead className="text-start text-xs">المستهدف</TableHead>
                  <TableHead className="text-start text-xs">المنجز</TableHead>
                  <TableHead className="w-40 text-start text-xs">التقدم</TableHead>
                  <TableHead className="text-start text-xs">الوزن</TableHead>
                  <TableHead className="text-start text-xs">الأولوية</TableHead>
                  <TableHead className="text-start text-xs">التسليم</TableHead>
                  <TableHead className="text-start text-xs">الحالة</TableHead>
                  {hasActions && <TableHead className="text-end text-xs">إجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((g) => {
                  const cancelled = g.status === "CANCELLED";
                  const canExpand = g.auto;
                  const open = expanded.has(g.id);
                  return (
                    <Fragment key={g.id}>
                      <TableRow className={cn(cancelled && "opacity-60")}>
                        <TableCell className="py-2.5">
                          {canExpand && (
                            <Button variant="ghost" size="icon-xs" onClick={() => toggle(g.id)} aria-label="تفاصيل Notion" aria-expanded={open}>
                              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="max-w-64 py-2.5 text-start whitespace-normal">
                          <p className={cn("font-medium", cancelled && "line-through")}>{g.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <EnumBadge map={KPI_CATEGORY_LABELS} value={g.category} />
                            <EnumBadge map={DISTRIBUTION_MODE_LABELS} value={g.distributionMode} />
                            {g.isAdHoc && <StatusBadge tone="primary">مستجد</StatusBadge>}
                          </div>
                          {g.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.description}</p>}
                        </TableCell>
                        <TableCell className="py-2.5 text-start">
                          <p className="text-xs">{GOAL_TYPE_LABELS[g.goalType]}</p>
                          <div className="mt-1">{g.auto ? <NotionSyncedTag /> : <span className="text-xs text-muted-foreground">{g.source === "NOTION" ? "يدوي" : GOAL_SOURCE_LABELS[g.source]}</span>}</div>
                        </TableCell>
                        <TableCell className="py-2.5 text-start tabular-nums">
                          {formatNumber(g.targetValue, 2)} <span className="text-xs text-muted-foreground">{g.unit}</span>
                        </TableCell>
                        <TableCell className="py-2.5 text-start tabular-nums">{formatNumber(g.achievedValue, 2)}</TableCell>
                        <TableCell className="py-2.5">
                          <ProgressBar value={g.progressPct} showLabel size="sm" />
                        </TableCell>
                        <TableCell className="py-2.5 text-start tabular-nums">{formatNumber(g.weight, 2)}%</TableCell>
                        <TableCell className="py-2.5 text-start">
                          <EnumBadge map={PRIORITY_LABELS} value={g.priority} />
                        </TableCell>
                        <TableCell className="py-2.5 text-start text-xs">{formatDateAr(g.dueDate)}</TableCell>
                        <TableCell className="py-2.5 text-start">
                          <EnumBadge map={GOAL_STATUS_LABELS} value={g.status} />
                        </TableCell>
                        {hasActions && (
                          <TableCell className="py-2.5 text-end">
                            <div className="flex justify-end gap-0.5">
                              {canEdit && !cancelled && (
                                <Button variant="ghost" size="icon-sm" onClick={() => openForm(g)} aria-label="تعديل الهدف">
                                  <Pencil />
                                </Button>
                              )}
                              {canDelete && (
                                <ActionButton
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-destructive"
                                  aria-label="حذف الهدف"
                                  action={deleteGoalAction.bind(null, g.id)}
                                  confirm={{ title: `حذف الهدف "${g.name}"؟`, description: "سيُحذف الهدف وتوزيعاته نهائيًا.", confirmLabel: "حذف", destructive: true }}
                                >
                                  <Trash2 />
                                </ActionButton>
                              )}
                              {canCancel && !cancelled && (
                                <ActionButton
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-warning"
                                  aria-label="إلغاء الهدف"
                                  title="إلغاء الهدف"
                                  action={cancelGoalAction.bind(null, g.id)}
                                  confirm={{ title: `إلغاء الهدف "${g.name}"`, description: "يُستبعد الهدف من حساب الإنجاز الموزون مع بقاء سجله.", confirmLabel: "إلغاء الهدف", destructive: true }}
                                  reason={{ label: "سبب الإلغاء", required: true }}
                                >
                                  <Ban />
                                </ActionButton>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      {canExpand && open && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={hasActions ? 11 : 10} className="p-3 whitespace-normal">
                            {g.breakdown ? (
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span>
                                    {g.notionDataSourceName ?? "قاعدة Notion"}
                                    {g.notionFilter?.stageKey && <> · المرحلة: {g.notionFilter.stageKey}</>}
                                    {g.notionFilter && <> · {DATE_BASIS_LABELS[g.notionFilter.dateBasis]}</>}
                                  </span>
                                  <span>آخر احتساب: {g.lastComputedAt ? formatDateTimeAr(new Date(g.lastComputedAt)) : "—"}</span>
                                </div>
                                <p className="text-xs font-semibold">الإنتاجية</p>
                                <NotionBreakdownGrid breakdown={g.breakdown} />
                                <p className="text-xs font-semibold">الجودة</p>
                                <NotionQualityGrid breakdown={g.breakdown} className="max-w-xl" />
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">لم يُحتسب الإنجاز من Notion بعد — يتم الاحتساب بعد اعتماد الخطة ومع كل مزامنة.</p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {canEdit && (
        <GoalForm
          open={formOpen}
          onOpenChange={setFormOpen}
          planId={planId}
          goal={editing}
          sources={sources}
          testPeriod={testPeriod}
          employeeId={employeeId}
          dates={dates}
        />
      )}
    </Card>
  );
}

const qty = (v: number) => formatNumber(v, v % 1 ? 2 : 0);

function goalState(goal: PlanGoalRow, today: string): "done" | "late" | null {
  if (goal.status === "COMPLETED") return "done";
  if (goal.status === "AT_RISK" || (goal.dueDate && goal.dueDate < today)) return "late";
  return null;
}

/** Compact, reusable disclosure for the optional details of any monthly goal. */
function GoalDescription({ description }: { description: string }) {
  const parts = description
    .split(/\r?\n(?=\s*\d+[.)]\s*)/)
    .map((part) => part.trim())
    .filter(Boolean);
  const numbered = parts.length > 1 && parts.slice(1).every((part) => /^\d+[.)]\s*/.test(part));
  const intro = numbered ? parts[0] : null;
  const items = numbered ? parts.slice(1).map((part) => part.replace(/^\d+[.)]\s*/, "").trim()) : [];

  return (
    <details className="mt-1.5 text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
        عرض التفاصيل
      </summary>
      <div className="mt-2 rounded-lg bg-muted/30 px-3 py-2.5 leading-6">
        <p className="mb-1 text-xs font-semibold text-foreground">تفاصيل الهدف</p>
        {intro && <p className="whitespace-pre-wrap">{intro}</p>}
        {numbered ? (
          <ol className="list-decimal space-y-0.5 ps-5">
            {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
          </ol>
        ) : (
          <p className="whitespace-pre-wrap">{description}</p>
        )}
      </div>
    </details>
  );
}

function SimpleGoalRow({ goal, today, dates, canEdit, access }: { goal: PlanGoalRow; today: string; dates: { start: string; end: string }; canEdit: boolean; access?: ManualAccess }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(goal.targetValue));
  const { run, pending } = useServerAction(updateGoalAction, {
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
  });
  const state = goalState(goal, today);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const base = goalFormDefaults(goal, dates);
    run(goal.id, {
      ...base,
      ...(goal.source === "NOTION" ? {} : { notionDataSourceId: null, notionFilter: null }),
      name: name.trim(),
      targetValue: Number(target) || 0,
    });
  };

  if (editing) {
    return (
      <li className="py-3">
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-48 space-y-1">
            <span className="text-xs text-muted-foreground">الهدف</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required disabled={pending} />
          </label>
          <label className="w-28 space-y-1">
            <span className="text-xs text-muted-foreground">المستهدف ({goal.unit})</span>
            <Input type="number" min={0} step="any" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} required disabled={pending} />
          </label>
          <div className="flex gap-1">
            <Button type="submit" size="icon" disabled={pending || !name.trim()} aria-label="حفظ">
              {pending ? <Spinner /> : <Check />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label="إلغاء التعديل"
              onClick={() => {
                setName(goal.name);
                setTarget(String(goal.targetValue));
                setEditing(false);
              }}
            >
              <X />
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="space-y-1.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{goal.name}</span>
          {state === "done" && <StatusBadge tone="success">تم</StatusBadge>}
          {state === "late" && <StatusBadge tone="warning">متأخر</StatusBadge>}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums">
          <span className="font-semibold">{qty(goal.achievedValue)}</span>
          <span className="text-muted-foreground">
            / {qty(goal.targetValue)} {goal.unit}
          </span>
          {canEdit && (
            <Button variant="ghost" size="icon-sm" className="ms-1 text-muted-foreground" onClick={() => setEditing(true)} aria-label={`تعديل الهدف «${goal.name}» ومستهدفه`} title="تعديل الهدف والمستهدف">
              <Pencil />
            </Button>
          )}
        </span>
      </div>
      {goal.description?.trim() && <GoalDescription description={goal.description.trim()} />}
      <ProgressBar value={goal.progressPct} showLabel size="sm" />
      {access && <GoalAchievementControls goal={goal} access={access} />}
    </li>
  );
}

/** Plain goal list for the plan page: name, target, achieved, progress, and a status word only when it matters. */
export function PlanGoalsSummary({
  goals,
  today,
  dates,
  canEdit,
  access,
}: {
  goals: PlanGoalRow[];
  today: string;
  dates: { start: string; end: string };
  canEdit: boolean;
  access?: ManualAccess;
}) {
  const active = goals.filter((g) => g.status !== "CANCELLED");
  if (active.length === 0) return <EmptyState icon={Target} title="لا توجد أهداف في هذه الخطة" className="py-6" />;
  const groups = groupByDuty(active, dutyOf);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.duty}>
          {groups.length > 1 && <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{group.duty}</h3>}
          <ul className="divide-y">
            {group.items.map((g) => (
              <SimpleGoalRow key={`${g.id}:${g.name}:${g.targetValue}:${g.achievedValue}`} goal={g} today={today} dates={dates} canEdit={canEdit} access={access} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
