"use client";

import { Fragment, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, NotionSyncedTag } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { ActionButton } from "@/components/shared/action-button";
import { cancelGoalAction, deleteGoalAction } from "@/actions/plans";
import { formatDateAr, formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { DATE_BASIS_LABELS } from "@/lib/notion/filter-rule";
import { GOAL_SOURCE_LABELS, GOAL_STATUS_LABELS, GOAL_TYPE_LABELS, KPI_CATEGORY_LABELS, PRIORITY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { NotionSourceOption, TestPeriod } from "@/features/goals/types";
import { GoalForm } from "./goal-form";
import { NotionBreakdownGrid, NotionQualityGrid } from "./notion-breakdown";
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
                  const canExpand = g.source === "NOTION";
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
                            {g.isAdHoc && <StatusBadge tone="primary">مستجد</StatusBadge>}
                          </div>
                          {g.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.description}</p>}
                        </TableCell>
                        <TableCell className="py-2.5 text-start">
                          <p className="text-xs">{GOAL_TYPE_LABELS[g.goalType]}</p>
                          <div className="mt-1">{g.source === "NOTION" ? <NotionSyncedTag /> : <span className="text-xs text-muted-foreground">{GOAL_SOURCE_LABELS[g.source]}</span>}</div>
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
