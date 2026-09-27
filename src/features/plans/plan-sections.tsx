import Link from "next/link";
import { Archive, ArrowLeft, CalendarDays, CheckCheck, CheckCircle2, MessageSquareWarning, PlayCircle, RefreshCw, RotateCcw, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState, KeyValue } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { ActionButton } from "@/components/shared/action-button";
import { approvePlanAction, ensureWeeksAction, returnPlanAction, setPlanStatusAction, submitPlanAction } from "@/actions/plans";
import { formatDateAr, formatDateTimeAr, monthLabel } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { PLAN_STATUS_LABELS, REPORT_STATUS_LABELS, WEEKLY_PLAN_STATUS_LABELS } from "@/lib/labels";
import type { AuthUser } from "@/server/auth/session";
import { canResolveOverrides, unhealthySourceIds } from "@/server/services/manual";
import type { ManualAccess } from "./goal-achievement";
import type { PlanGoalRow } from "./types";
import { weekProgress, weekWorkDays, type PlanDetail } from "@/server/queries/plans";

export function planCapabilities(user: AuthUser, plan: { employeeId: string; status: string }) {
  const isOwner = plan.employeeId === user.employeeId;
  const canManage = hasPermission(user, PERMISSIONS.PLANS_MANAGE);
  const canApprove = hasPermission(user, PERMISSIONS.PLANS_APPROVE);
  const early = plan.status === "DRAFT" || plan.status === "SUBMITTED";
  const canEdit = canManage || (isOwner && plan.status === "DRAFT");
  const distributable = plan.status === "APPROVED" || plan.status === "IN_PROGRESS";
  return {
    isOwner,
    canManage,
    canApprove,
    canEdit,
    canDelete: canEdit && early,
    canCancel: canManage && !early,
    canDistribute: distributable && (canManage || (isOwner && hasPermission(user, PERMISSIONS.PLANS_DISTRIBUTE_OWN))),
  };
}

/** Who may enter achievement by hand on this plan, and which automatic sources are currently not updating. */
export async function manualAccess(user: AuthUser, plan: { employeeId: string; status: string }, goals: PlanGoalRow[]): Promise<ManualAccess> {
  const running = plan.status === "APPROVED" || plan.status === "IN_PROGRESS";
  const ids = [...new Set(goals.filter((g) => g.auto && g.status !== "CANCELLED" && g.notionDataSourceId).map((g) => g.notionDataSourceId!))];
  const unhealthy = running && ids.length ? await unhealthySourceIds(ids).catch(() => new Set<string>()) : new Set<string>();
  const cap = planCapabilities(user, plan);
  return { running, canUpdate: cap.isOwner || cap.canManage, canManage: cap.canManage, canResolve: canResolveOverrides(user), unhealthySources: [...unhealthy] };
}

/** First running automatic goal whose source is not updating. */
export function firstSyncIssue(goals: PlanGoalRow[], access: ManualAccess) {
  return access.running ? goals.find((g) => g.auto && g.status !== "CANCELLED" && g.notionDataSourceId && access.unhealthySources.includes(g.notionDataSourceId)) : undefined;
}

/** Workflow buttons for the plan's current status. */
export function PlanWorkflowActions({ plan, user }: { plan: Pick<PlanDetail, "id" | "status" | "employeeId" | "weeklyPlans">; user: AuthUser }) {
  const cap = planCapabilities(user, plan);
  const buttons: React.ReactNode[] = [];
  if (plan.status === "DRAFT" && (cap.isOwner || cap.canManage)) {
    buttons.push(
      <ActionButton key="submit" action={submitPlanAction.bind(null, plan.id)} confirm={{ title: "إرسال الخطة للاعتماد؟", description: "لن يتمكن الموظف من تعديل الأهداف بعد الإرسال." }}>
        <Send /> إرسال للاعتماد
      </ActionButton>,
    );
  }
  if ((plan.status === "SUBMITTED" || (plan.status === "DRAFT" && !cap.isOwner)) && cap.canApprove) {
    buttons.push(
      <ActionButton
        key="approve"
        variant={plan.status === "DRAFT" ? "outline" : "default"}
        action={approvePlanAction.bind(null, plan.id)}
        confirm={{ title: "اعتماد الخطة", description: "سيتم توليد أسابيع الشهر واقتراح توزيع الأهداف عليها.", confirmLabel: "اعتماد" }}
        reason={{ label: "ملاحظات للموظف (اختياري)" }}
      >
        <CheckCircle2 /> {plan.status === "DRAFT" ? "اعتماد مباشر" : "اعتماد"}
      </ActionButton>,
    );
  }
  if (plan.status === "SUBMITTED" && cap.canApprove) {
    buttons.push(
      <ActionButton key="return" variant="outline" action={returnPlanAction.bind(null, plan.id)} reason={{ label: "سبب الإعادة للموظف", required: true }} confirm={{ title: "إعادة الخطة للتعديل", confirmLabel: "إعادة" }}>
        <Undo2 /> إعادة للتعديل
      </ActionButton>,
    );
  }
  if (cap.canManage) {
    if (plan.status === "APPROVED") {
      buttons.push(
        <ActionButton key="start" variant="outline" action={setPlanStatusAction.bind(null, plan.id, "IN_PROGRESS")}>
          <PlayCircle /> بدء التنفيذ
        </ActionButton>,
      );
    }
    if (plan.status === "APPROVED" || plan.status === "IN_PROGRESS") {
      buttons.push(
        <ActionButton key="complete" variant="outline" action={setPlanStatusAction.bind(null, plan.id, "COMPLETED")} confirm={{ title: "تعليم الخطة كمكتملة؟" }}>
          <CheckCheck /> إكمال الخطة
        </ActionButton>,
      );
      if (plan.weeklyPlans.length === 0) {
        buttons.push(
          <ActionButton key="weeks" variant="outline" action={ensureWeeksAction.bind(null, plan.id)}>
            <RefreshCw /> توليد الأسابيع
          </ActionButton>,
        );
      }
    }
    if (plan.status === "COMPLETED") {
      buttons.push(
        <ActionButton key="reopen" variant="outline" action={setPlanStatusAction.bind(null, plan.id, "IN_PROGRESS")} confirm={{ title: "إعادة فتح الخطة؟" }}>
          <RotateCcw /> إعادة فتح
        </ActionButton>,
        <ActionButton key="archive" variant="outline" action={setPlanStatusAction.bind(null, plan.id, "ARCHIVED")} confirm={{ title: "أرشفة الخطة؟", description: "تُستخدم الأرشفة للخطط المنتهية والمغلقة." }}>
          <Archive /> أرشفة
        </ActionButton>,
      );
    }
  }
  if (buttons.length === 0) return null;
  return <div className="flex flex-wrap items-center gap-2">{buttons}</div>;
}

/** Plan meta: employee, month, status, dates and weighted progress. */
export function PlanSummaryCard({ plan, progress, approvedByName }: { plan: PlanDetail; progress: number; approvedByName?: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ملخص الخطة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">الإنجاز الموزون</span>
          </div>
          <ProgressBar value={progress} showLabel size="lg" />
        </div>
        <div className="divide-y">
          <KeyValue label="الموظف">{plan.employee.fullName}</KeyValue>
          <KeyValue label="المسمى الوظيفي">{plan.employee.jobTitle?.name ?? "—"}</KeyValue>
          <KeyValue label="الشهر">{monthLabel(plan.year, plan.month)}</KeyValue>
          <KeyValue label="الحالة">
            <EnumBadge map={PLAN_STATUS_LABELS} value={plan.status} />
          </KeyValue>
          <KeyValue label="القالب">{plan.template?.name ?? "بدون قالب"}</KeyValue>
          <KeyValue label="تاريخ الإرسال">{formatDateTimeAr(plan.submittedAt)}</KeyValue>
          <KeyValue label="تاريخ الاعتماد">{formatDateTimeAr(plan.approvedAt)}</KeyValue>
          {approvedByName && <KeyValue label="اعتمدها">{approvedByName}</KeyValue>}
        </div>
      </CardContent>
    </Card>
  );
}

export function ManagerNotes({ notes, returned }: { notes: string | null; returned?: boolean }) {
  if (!notes) return null;
  return (
    <Alert className={returned ? "border-warning/40 bg-warning-soft/40" : undefined}>
      <MessageSquareWarning />
      <AlertTitle>{returned ? "أعاد المدير الخطة للتعديل" : "ملاحظات المدير"}</AlertTitle>
      <AlertDescription className="whitespace-pre-line">{notes}</AlertDescription>
    </Alert>
  );
}

/** Weeks of the plan with dates, status and weekly weighted progress. */
export function WeeksOverview({ plan, workDays, distributeHref, weekHref }: { plan: PlanDetail; workDays: number[]; distributeHref?: string; weekHref?: (weekId: string) => string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">أسابيع الخطة</CardTitle>
        {distributeHref && plan.weeklyPlans.length > 0 && (
          <Button variant="outline" size="sm" asChild>
            <Link href={distributeHref}>
              التوزيع الأسبوعي <ArrowLeft />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {plan.weeklyPlans.length === 0 ? (
          <EmptyState icon={CalendarDays} title="لم تتولد الأسابيع بعد" description="تتولد أسابيع العمل تلقائيًا عند اعتماد الخطة." className="py-6" />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {plan.weeklyPlans.map((w) => {
              const progress = weekProgress(w);
              const body = (
                <div className="h-full rounded-lg border p-3 transition-colors hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">الأسبوع {w.weekIndex}</span>
                    <EnumBadge map={WEEKLY_PLAN_STATUS_LABELS} value={w.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateAr(w.startDate)} – {formatDateAr(w.endDate)} · {formatNumber(weekWorkDays(w.startDate, w.endDate, workDays).length)} أيام عمل
                  </p>
                  <ProgressBar value={progress} showLabel size="sm" className="mt-2.5" />
                  {w.report && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      التقرير: <EnumBadge map={REPORT_STATUS_LABELS} value={w.report.status} />
                    </p>
                  )}
                  {w.varianceNote && <p className="mt-2 line-clamp-2 text-xs text-warning">مبرر الفرق: {w.varianceNote}</p>}
                </div>
              );
              return weekHref ? (
                <Link key={w.id} href={weekHref(w.id)} className="block">
                  {body}
                </Link>
              ) : (
                <div key={w.id}>{body}</div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
