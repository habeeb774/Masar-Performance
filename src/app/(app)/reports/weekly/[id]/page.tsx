import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageSquareQuote } from "lucide-react";
import type { IdParams } from "@/lib/params";
import { requireEmployeeAccess, requireUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDateAr, formatDateTimeAr, monthLabel } from "@/lib/dates";
import { getWeeklyReport } from "@/server/queries/reports";
import { listAttachments, listComments } from "@/server/queries/tasks";
import { PageHeader } from "@/components/shared/page";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NoteBlock, ReportHeaderCard, ReportSection, WeeklyReportBody } from "@/features/reports/report-body";
import { ReportToolbar } from "@/features/reports/report-toolbar";
import { GeneratedTextBlock } from "@/features/reports/generated-text-block";
import { ReportOwnerPanel, ReportReviewPanel } from "@/features/reports/report-actions";
import { AttachmentsPanel } from "@/features/attachments/attachments-panel";
import { CommentsThread } from "@/features/comments/comments-thread";

export const metadata: Metadata = { title: "التقرير الأسبوعي" };

export default async function WeeklyReportPage({ params }: { params: IdParams }) {
  const { id } = await params;
  const me = await requireUser();
  const report = await getWeeklyReport(id);
  if (!report) notFound();
  const user = await requireEmployeeAccess(report.employeeId);
  const [attachments, comments] = await Promise.all([listAttachments("WEEKLY_REPORT", id), listComments("WEEKLY_REPORT", id)]);

  const c = report.content;
  const isOwner = report.employeeId === me.employeeId;
  const editable = isOwner && (report.status === "DRAFT" || report.status === "RETURNED");
  const canReview = !isOwner && hasPermission(user, PERMISSIONS.REPORTS_REVIEW) && (report.status === "SUBMITTED" || report.status === "REVIEWED");
  const period = c.week.index
    ? `الفترة ${c.week.index} · ${formatDateAr(report.weekStart)} – ${formatDateAr(report.weekEnd)} (خطة ${monthLabel(c.week.year, c.week.month)})`
    : `${formatDateAr(report.weekStart)} – ${formatDateAr(report.weekEnd)}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`التقرير الأسبوعي — ${report.employeeName}`}
        description={period}
        actions={
          <ReportToolbar
            backHref={isOwner ? "/my-reports" : "/reports/weekly"}
            backLabel={isOwner ? "تقاريري" : "التقارير الأسبوعية"}
            printHref={`/print/reports/weekly/${id}`}
          />
        }
      />

      <ReportHeaderCard
        kind="weekly"
        employeeName={report.employeeName}
        jobTitle={report.jobTitle}
        period={period}
        status={report.status}
        meta={[
          { label: "آخر تحديث للأرقام", value: formatDateTimeAr(report.generatedAt) },
          { label: "تاريخ الإرسال", value: formatDateTimeAr(report.submittedAt) },
          { label: "تاريخ المراجعة", value: report.reviewedAt ? `${formatDateTimeAr(report.reviewedAt)}${report.reviewerName ? ` — ${report.reviewerName}` : ""}` : "—" },
        ]}
      />

      {report.managerComment && (
        <Alert className={report.status === "RETURNED" ? "border-warning/40 bg-warning-soft" : "border-primary/30 bg-primary/5"}>
          <MessageSquareQuote />
          <AlertTitle>{report.status === "RETURNED" ? "أعاد المدير التقرير — السبب" : "تعليق المدير"}</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap text-foreground">{report.managerComment}</AlertDescription>
        </Alert>
      )}

      {editable && (
        <ReportOwnerPanel
          kind="weekly"
          reportId={id}
          returned={report.status === "RETURNED"}
          notes={[
            { key: "highlights", label: "أبرز الإنجازات", value: report.highlights, placeholder: "ما أهم ما أنجزته هذا الأسبوع؟" },
            { key: "blockers", label: "أسباب عدم الإنجاز", value: report.blockers, placeholder: "ما الذي أخّر أو منع الإنجاز؟" },
            { key: "carryOver", label: "المرحّل للأسبوع القادم", value: report.carryOver, placeholder: "مهام ستنقل للأسبوع القادم" },
            { key: "employeeNotes", label: "ملاحظات عامة", value: report.employeeNotes },
          ]}
        />
      )}
      {canReview && <ReportReviewPanel kind="weekly" reportId={id} existingComment={report.managerComment} />}

      {!editable && (
        <ReportSection title="ملاحظات الموظف">
          <div className="grid gap-3 md:grid-cols-2">
            <NoteBlock label="أبرز الإنجازات" value={report.highlights} />
            <NoteBlock label="أسباب عدم الإنجاز" value={report.blockers} tone={report.blockers ? "warning" : "neutral"} />
            <NoteBlock label="المرحّل للأسبوع القادم" value={report.carryOver} />
            <NoteBlock label="ملاحظات عامة" value={report.employeeNotes} />
          </div>
        </ReportSection>
      )}

      <WeeklyReportBody content={c} />

      <GeneratedTextBlock text={report.generatedText} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <AttachmentsPanel entityType="WEEKLY_REPORT" entityId={id} initial={attachments} currentUserId={me.id} canManage={hasPermission(user, PERMISSIONS.TASKS_ASSIGN)} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CommentsThread entityType="WEEKLY_REPORT" entityId={id} initial={comments} currentUserId={me.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
