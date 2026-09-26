import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotionSyncedTag } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { formatDateAr, formatDateTimeAr } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { DATE_BASIS_LABELS } from "@/lib/notion/filter-rule";
import { GOAL_SOURCE_LABELS, GOAL_STATUS_LABELS, GOAL_TYPE_LABELS, KPI_CATEGORY_LABELS, PRIORITY_LABELS } from "@/lib/labels";
import { NotionBreakdownGrid, NotionQualityGrid } from "./notion-breakdown";
import type { PlanGoalRow } from "./types";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2.5 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Full detail of one monthly goal: progress, numbers, and Notion productivity vs quality. */
export function GoalDetailCard({ goal, today }: { goal: PlanGoalRow; today: string }) {
  const remaining = Math.max(goal.targetValue - goal.achievedValue, 0);
  const overdue = goal.dueDate && goal.dueDate < today && goal.status !== "COMPLETED" && goal.status !== "CANCELLED";
  return (
    <Card className={goal.status === "CANCELLED" ? "opacity-60" : undefined}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{goal.name}</CardTitle>
          <EnumBadge map={GOAL_STATUS_LABELS} value={goal.status} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <EnumBadge map={KPI_CATEGORY_LABELS} value={goal.category} />
          <EnumBadge map={PRIORITY_LABELS} value={goal.priority} />
          <StatusBadge tone="neutral" dot={false}>
            {GOAL_TYPE_LABELS[goal.goalType]} · الوزن {formatNumber(goal.weight, 2)}%
          </StatusBadge>
          {goal.source === "NOTION" ? <NotionSyncedTag /> : <StatusBadge tone="neutral" dot={false}>{GOAL_SOURCE_LABELS[goal.source]}</StatusBadge>}
        </div>
        {goal.description && <p className="text-xs text-muted-foreground">{goal.description}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <ProgressBar value={goal.progressPct} showLabel size="lg" />
        <div className="grid grid-cols-3 gap-2">
          <Metric label="المستهدف" value={`${formatNumber(goal.targetValue, 2)} ${goal.unit}`} />
          <Metric label="المنجز" value={formatNumber(goal.achievedValue, 2)} />
          <Metric label="المتبقي" value={formatNumber(remaining, 2)} />
        </div>
        <p className={`flex items-center gap-1.5 text-xs ${overdue ? "text-danger" : "text-muted-foreground"}`}>
          <CalendarClock className="size-3.5" />
          {formatDateAr(goal.startDate)} – {formatDateAr(goal.dueDate)} {overdue && "· تجاوز موعد التسليم"}
        </p>
        {goal.source === "NOTION" &&
          (goal.breakdown ? (
            <div className="space-y-3 border-t pt-3">
              <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {goal.notionDataSourceName ?? "Notion"}
                  {goal.notionFilter && ` · ${goal.notionFilter.stageKey} · ${DATE_BASIS_LABELS[goal.notionFilter.dateBasis]}`}
                </span>
                <span>آخر احتساب {goal.lastComputedAt ? formatDateTimeAr(new Date(goal.lastComputedAt)) : "—"}</span>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold">الإنتاجية</p>
                <NotionBreakdownGrid breakdown={goal.breakdown} className="lg:grid-cols-4" />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold">الجودة</p>
                <NotionQualityGrid breakdown={goal.breakdown} />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  الاعتماد {formatPct(goal.breakdown.approvalRate)} من العناصر المراجعة · أُعيد {formatNumber(goal.breakdown.reworkCount)} عنصر للتحسين خلال الفترة.
                </p>
              </div>
            </div>
          ) : (
            <p className="border-t pt-3 text-xs text-muted-foreground">لم يُحتسب الإنجاز من Notion بعد.</p>
          ))}
      </CardContent>
    </Card>
  );
}
