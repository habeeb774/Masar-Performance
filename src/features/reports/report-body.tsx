import { dutyOf, groupByDuty } from "@/lib/duties";
import { AlertTriangle, CheckCircle2, Clock3, Hourglass, RotateCcw, Target, ThumbsUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { formatDateAr } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { GOAL_STATUS_LABELS, NOTION_STATUS_LABELS, REPORT_STATUS_LABELS, TASK_SOURCE_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import type { MonthlyReportContent, ReportBatchLine, ReportGoalLine, ReportTaskLine, ReportTotals, WeeklyReportContent } from "@/lib/report-types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
//  Building blocks
// ---------------------------------------------------------------------------

export function ReportSection({
  title,
  count,
  children,
  className,
  action,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={cn("report-section gap-3 break-inside-avoid-page", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          {title}
          {count !== undefined && <span className="ms-1.5 text-sm font-normal text-muted-foreground">({count})</span>}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{children}</p>;
}

export function BulletList({ items, empty, tone = "neutral" }: { items: string[]; empty: string; tone?: "neutral" | "success" | "warning" }) {
  if (items.length === 0) return <EmptyLine>{empty}</EmptyLine>;
  const dot = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-muted-foreground";
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", dot)} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function NoteBlock({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | null | undefined;
  tone?: "neutral" | "primary" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "primary" && "border-primary/30 bg-primary/5",
        tone === "warning" && "border-warning/30 bg-warning-soft",
      )}
    >
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
      {value ? <p className="text-sm whitespace-pre-wrap">{value}</p> : <p className="text-xs text-muted-foreground">—</p>}
    </div>
  );
}

export function ReportHeaderCard({
  kind,
  employeeName,
  jobTitle,
  period,
  status,
  meta,
}: {
  kind: "weekly" | "monthly";
  employeeName: string;
  jobTitle: string | null;
  period: string;
  status: string;
  meta: { label: string; value: string }[];
}) {
  return (
    <Card className="report-section gap-0 py-4">
      <CardContent className="flex flex-col gap-4 px-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{kind === "weekly" ? "التقرير الأسبوعي" : "التقرير الشهري"}</p>
          <h2 className="mt-1 text-lg font-bold">{employeeName}</h2>
          <p className="text-sm text-muted-foreground">
            {jobTitle ?? "—"} · {period}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {meta.map((m) => (
            <div key={m.label} className="text-xs">
              <p className="text-muted-foreground">{m.label}</p>
              <p className="font-medium">{m.value}</p>
            </div>
          ))}
          <EnumBadge map={REPORT_STATUS_LABELS} value={status} className="text-sm" />
        </div>
      </CardContent>
    </Card>
  );
}

export function KpiTiles({ totals }: { totals: ReportTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="الإنجاز الموزون"
        value={formatPct(totals.weightedProgress)}
        icon={Target}
        tone="primary"
        footer={<ProgressBar value={totals.weightedProgress} size="sm" />}
      />
      <StatCard
        label="أهداف مكتملة"
        value={`${formatNumber(totals.completedGoals)} / ${formatNumber(totals.goalsCount)}`}
        icon={CheckCircle2}
        tone="success"
      />
      <StatCard
        label="معتمد"
        value={formatNumber(totals.approved)}
        icon={ThumbsUp}
        tone="success"
        hint={totals.worked ? `من ${formatNumber(totals.worked)} عنصر` : undefined}
      />
      <StatCard label="بانتظار الاعتماد" value={formatNumber(totals.pendingApproval)} icon={Hourglass} tone="pending" />
      <StatCard
        label="يحتاج تحسين"
        value={formatNumber(totals.needsRevision)}
        icon={RotateCcw}
        tone={totals.needsRevision ? "warning" : "neutral"}
        hint={totals.reworkCount ? `إعادة عمل ${formatNumber(totals.reworkCount)}` : undefined}
      />
      <StatCard
        label="نسبة الاعتماد"
        value={formatPct(totals.approvalRate)}
        icon={Clock3}
        tone="info"
        hint={totals.revisionRate !== null ? `نسبة إعادة العمل ${formatPct(totals.revisionRate)}` : undefined}
      />
    </div>
  );
}

function BreakdownChips({ goal }: { goal: ReportGoalLine }) {
  const b = goal.breakdown;
  if (!b) return null;
  const chips: { label: string; value: number; tone: "success" | "pending" | "danger" | "info" | "blocked" | "neutral" | "warning" }[] = [
    { label: "مكتمل", value: b.completed, tone: "success" },
    { label: "بانتظار الاعتماد", value: b.pendingApproval, tone: "pending" },
    { label: "يحتاج تحسين", value: b.needsRevision, tone: "danger" },
    { label: "قيد التنفيذ", value: b.inProgress, tone: "info" },
    { label: "معلق", value: b.blocked, tone: "blocked" },
    { label: "إعادة عمل", value: b.reworkCount, tone: "warning" },
  ];
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips
        .filter((c) => c.value > 0)
        .map((c) => (
          <StatusBadge key={c.label} tone={c.tone} dot={false} className="text-[11px]">
            {c.label} {formatNumber(c.value)}
          </StatusBadge>
        ))}
      {b.worked > 0 && <span className="text-[11px] text-muted-foreground">عمل على {formatNumber(b.worked)}</span>}
    </div>
  );
}

export function GoalsTable({ goals }: { goals: ReportGoalLine[] }) {
  if (goals.length === 0) return <EmptyLine>لا توجد أهداف في هذه الفترة.</EmptyLine>;
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-start text-xs">الهدف</TableHead>
            <TableHead className="text-start text-xs">المستهدف</TableHead>
            <TableHead className="text-start text-xs">المنجز</TableHead>
            <TableHead className="min-w-36 text-start text-xs">نسبة الإنجاز</TableHead>
            <TableHead className="text-start text-xs">الحالة</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupByDuty(goals, dutyOf).flatMap((group, _i, groups) => [
            ...(groups.length > 1
              ? [
                  <TableRow key={`duty:${group.duty}`} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={5} className="py-1.5 text-xs font-semibold">
                      {group.duty}
                    </TableCell>
                  </TableRow>,
                ]
              : []),
            ...group.items.map((g) => (
              <TableRow key={g.goalId} className="break-inside-avoid">
                <TableCell className="py-2.5 align-top whitespace-normal">
                  <span className="font-medium">{g.name}</span>
                  <BreakdownChips goal={g} />
                </TableCell>
                <TableCell className="align-top tabular-nums">
                  {formatNumber(g.target, 2)} <span className="text-xs text-muted-foreground">{g.unit}</span>
                </TableCell>
                <TableCell className="align-top tabular-nums">{formatNumber(g.achieved, 2)}</TableCell>
                <TableCell className="align-top">
                  <ProgressBar value={g.progressPct} showLabel size="sm" />
                </TableCell>
                <TableCell className="align-top">
                  <EnumBadge map={GOAL_STATUS_LABELS} value={g.status} />
                </TableCell>
              </TableRow>
            )),
          ])}
        </TableBody>
      </Table>
    </div>
  );
}

export function TaskLinesTable({
  tasks,
  empty,
  showReason = false,
  showSource = false,
}: {
  tasks: ReportTaskLine[];
  empty: string;
  showReason?: boolean;
  showSource?: boolean;
}) {
  if (tasks.length === 0) return <EmptyLine>{empty}</EmptyLine>;
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-start text-xs">المهمة</TableHead>
            <TableHead className="text-start text-xs">التاريخ</TableHead>
            <TableHead className="text-start text-xs">الموعد</TableHead>
            <TableHead className="text-start text-xs">الإنجاز</TableHead>
            <TableHead className="text-start text-xs">الحالة</TableHead>
            <TableHead className="text-start text-xs">{showReason ? "سبب التأخير" : "ملاحظات"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t, i) => (
            <TableRow key={`${t.id}-${i}`} className="break-inside-avoid">
              <TableCell className="py-2.5 whitespace-normal">
                <span className="font-medium">{t.title}</span>
                {showSource && (
                  <StatusBadge tone={t.source === "AD_HOC_TASK" ? "primary" : "neutral"} dot={false} className="ms-1.5 text-[11px]">
                    {TASK_SOURCE_LABELS[t.source as keyof typeof TASK_SOURCE_LABELS] ?? t.source}
                  </StatusBadge>
                )}
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap">{formatDateAr(t.date)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{formatDateAr(t.deadline)}</TableCell>
              <TableCell className="text-xs tabular-nums whitespace-nowrap">
                {t.target > 0 ? `${formatNumber(t.achieved)} / ${formatNumber(t.target)}` : `${formatNumber(t.progress)}%`}
              </TableCell>
              <TableCell>
                <EnumBadge map={TASK_STATUS_LABELS} value={t.status} />
              </TableCell>
              <TableCell className="max-w-64 text-xs whitespace-normal text-muted-foreground">
                {showReason ? (t.delayReason ?? <span className="text-warning">لم يُذكر سبب</span>) : (t.notes ?? "—")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function BatchesSection({ batches }: { batches: ReportBatchLine[] | undefined }) {
  if (!batches?.length) return null;
  return (
    <ReportSection title="الدفعات" count={batches.length}>
      <div className="grid gap-3 md:grid-cols-2">
        {batches.map((b) => (
          <div key={b.label} className="rounded-lg border p-3 break-inside-avoid">
            <p className="text-sm font-semibold">
              {b.label} <span className="font-normal text-muted-foreground">— المستهدف: {formatNumber(b.total)} منتج</span>
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {[
                ["الصور المعتمدة", b.imagesApproved],
                ["تمت الإضافة للمتجر", b.added],
                ["تحتاج تحسين", b.needsImprovement],
                ["بانتظار الاعتماد", b.waiting],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={cn("font-medium tabular-nums", label === "تحتاج تحسين" && Number(value) > 0 && "text-danger")}>{formatNumber(Number(value))}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 space-y-2">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">نسبة إنجاز الصور</p>
                <ProgressBar value={b.imagesPct} showLabel size="sm" />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">نسبة إضافة المنتجات</p>
                <ProgressBar value={b.addedPct} showLabel size="sm" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
//  Weekly
// ---------------------------------------------------------------------------

export function WeeklyReportBody({ content }: { content: WeeklyReportContent }) {
  return (
    <div className="space-y-4">
      <KpiTiles totals={content.totals} />
      <ReportSection title="أهداف الأسبوع" count={content.goals.length}>
        <GoalsTable goals={content.goals} />
      </ReportSection>
      <BatchesSection batches={content.batches} />
      <div className="grid gap-4 xl:grid-cols-2">
        <ReportSection title="المهام اليدوية" count={content.manualTasks.length}>
          <TaskLinesTable tasks={content.manualTasks} empty="لا توجد مهام يدوية هذا الأسبوع." />
        </ReportSection>
        <ReportSection title="التكليفات المستجدة" count={content.adHocTasks.length}>
          <TaskLinesTable tasks={content.adHocTasks} empty="لا توجد تكليفات مستجدة هذا الأسبوع." />
        </ReportSection>
      </div>
      <ReportSection
        title="المعوقات والتأخير"
        count={content.delayedTasks.length}
        action={content.delayedTasks.length > 0 ? <AlertTriangle className="size-4 text-danger" /> : undefined}
      >
        <TaskLinesTable tasks={content.delayedTasks} empty="لا توجد معوقات أو مهام متأخرة." showReason showSource />
      </ReportSection>
      <div className="grid gap-4 md:grid-cols-2">
        <ReportSection title="ما أُنجز">
          <BulletList items={content.autoHighlights} empty="لا توجد إنجازات مكتملة بعد." tone="success" />
        </ReportSection>
        <ReportSection title="لم يكتمل — أولويات الأسبوع القادم">
          <BulletList items={content.autoCarryOver} empty="لا يوجد ما يُرحّل." tone="warning" />
        </ReportSection>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Monthly
// ---------------------------------------------------------------------------

export function MonthlyReportBody({ content }: { content: MonthlyReportContent }) {
  const statusKeys = Object.keys(NOTION_STATUS_LABELS) as (keyof typeof NOTION_STATUS_LABELS)[];
  return (
    <div className="space-y-4">
      <KpiTiles totals={content.totals} />
      <ReportSection title="الأهداف الشهرية" count={content.goals.length}>
        <GoalsTable goals={content.goals} />
      </ReportSection>
      <BatchesSection batches={content.batches} />

      <ReportSection title="الإنجاز حسب الأسابيع" count={content.weeks.length}>
        {content.weeks.length === 0 ? (
          <EmptyLine>لا توجد أسابيع مولّدة لهذه الخطة.</EmptyLine>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {content.weeks.map((w) => (
              <div key={w.index} className="rounded-lg border p-3 break-inside-avoid">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">الفترة {w.index}</span>
                  {w.reportStatus ? (
                    <EnumBadge map={REPORT_STATUS_LABELS} value={w.reportStatus} />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">بلا تقرير</span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDateAr(w.start)} – {formatDateAr(w.end)}
                </p>
                <ProgressBar value={w.progressPct} showLabel size="sm" className="mt-2" />
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="ملخص مراحل Notion خلال الشهر" count={content.stageSummary.length}>
        {content.stageSummary.length === 0 ? (
          <EmptyLine>لا توجد مراحل Notion مرتبطة بأهداف هذا الموظف.</EmptyLine>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start text-xs">المرحلة</TableHead>
                  <TableHead className="text-start text-xs">الحالات</TableHead>
                  <TableHead className="text-start text-xs">أعيد للتحسين</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {content.stageSummary.map((s) => (
                  <TableRow key={`${s.dataSourceName}:${s.stageKey}`} className="break-inside-avoid">
                    <TableCell className="py-2.5 whitespace-normal">
                      <p className="font-medium">{s.label}</p>
                      <p className="text-[11px] text-muted-foreground">{s.dataSourceName}</p>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {statusKeys
                          .filter((k) => (s.counts[k] ?? 0) > 0)
                          .map((k) => (
                            <StatusBadge key={k} tone={NOTION_STATUS_LABELS[k].tone} dot={false} className="text-[11px]">
                              {NOTION_STATUS_LABELS[k].label} {formatNumber(s.counts[k] ?? 0)}
                            </StatusBadge>
                          ))}
                        {Object.values(s.counts).every((v) => !v) && <span className="text-xs text-muted-foreground">لا حركة</span>}
                      </div>
                    </TableCell>
                    <TableCell className={cn("tabular-nums", s.revisionEvents > 0 && "font-semibold text-danger")}>
                      {formatNumber(s.revisionEvents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ReportSection>

      <ReportSection title="التكليفات المستجدة" count={content.adHocTasks.length}>
        <TaskLinesTable tasks={content.adHocTasks} empty="لا توجد تكليفات مستجدة هذا الشهر." />
      </ReportSection>
      <div className="grid gap-4 xl:grid-cols-2">
        <ReportSection title="المهام المتأخرة" count={content.delayedTasks.length}>
          <TaskLinesTable tasks={content.delayedTasks} empty="لا توجد مهام متأخرة." showReason showSource />
        </ReportSection>
        <ReportSection title="المهام الملغاة" count={content.cancelledTasks.length}>
          <TaskLinesTable tasks={content.cancelledTasks} empty="لا توجد مهام ملغاة." showSource />
        </ReportSection>
      </div>
      <ReportSection title="الإنجازات المهمة (تلقائي)">
        <BulletList items={content.autoHighlights} empty="لا توجد إنجازات مكتملة بعد." tone="success" />
      </ReportSection>
      <ReportSection title="ملاحظات التقارير الأسبوعية" count={content.weeklyNotes.length}>
        {content.weeklyNotes.length === 0 ? (
          <EmptyLine>لا توجد ملاحظات أسبوعية.</EmptyLine>
        ) : (
          <div className="space-y-3">
            {content.weeklyNotes.map((n) => (
              <div key={n.week} className="rounded-lg border p-3 break-inside-avoid">
                <p className="mb-2 text-sm font-semibold">الفترة {n.week}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <NoteBlock label="أبرز الإنجازات" value={n.highlights} />
                  <NoteBlock label="أسباب عدم الإنجاز" value={n.blockers} />
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportSection>
    </div>
  );
}
