import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageSquareQuote } from "lucide-react";
import type { IdParams } from "@/lib/params";
import { requireEmployeeAccess, requireUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { getMonthlyReport } from "@/server/queries/reports";
import { listAttachments, listComments } from "@/server/queries/tasks";
import { PageHeader } from "@/components/shared/page";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MonthlyReportBody, NoteBlock, ReportHeaderCard, ReportSection } from "@/features/reports/report-body";
import { ReportToolbar } from "@/features/reports/report-toolbar";
import { GeneratedTextBlock } from "@/features/reports/generated-text-block";
import { ManagerNotesEditor, ReportOwnerPanel, ReportReviewPanel } from "@/features/reports/report-actions";
import { AttachmentsPanel } from "@/features/attachments/attachments-panel";
import { CommentsThread } from "@/features/comments/comments-thread";

export const metadata: Metadata = { title: "التقرير الشهري" };

export default async function MonthlyReportPage({ params }: { params: IdParams }) {
  const { id } = await params;
  const me = await requireUser();
  const report = await getMonthlyReport(id);
  if (!report) notFound();
  const user = await requireEmployeeAccess(report.employeeId);
  const [attachments, comments] = await Promise.all([listAttachments("MONTHLY_REPORT", id), listComments("MONTHLY_REPORT", id)]);

  const isOwner = report.employeeId === me.employeeId;
  const editable = isOwner && (report.status === "DRAFT" || report.status === "RETURNED");
  const isReviewer = !isOwner && hasPermission(user, PERMISSIONS.REPORTS_REVIEW);
  const canReview = isReviewer && (report.status === "SUBMITTED" || report.status === "REVIEWED");
  const period = monthLabel(report.year, report.month);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`التقرير الشهري — ${report.employeeName}`}
        description={period}
        actions={
          <ReportToolbar
            backHref={isOwner ? "/my-reports" : "/reports/monthly"}
            backLabel={isOwner ? "تقاريري" : "التقارير الشهرية"}
            printHref={`/print/reports/monthly/${id}`}
          />
        }
      />

      <ReportHeaderCard
        kind="monthly"
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

      {report.managerNotes && (
        <Alert className={report.status === "RETURNED" ? "border-warning/40 bg-warning-soft" : "border-primary/30 bg-primary/5"}>
          <MessageSquareQuote />
          <AlertTitle>{report.status === "RETURNED" ? "أعاد المدير التقرير — الملاحظات" : "ملاحظات المدير"}</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap text-foreground">{report.managerNotes}</AlertDescription>
        </Alert>
      )}

      {editable && (
        <ReportOwnerPanel
          kind="monthly"
          reportId={id}
          returned={report.status === "RETURNED"}
          notes={[
            { key: "highlights", label: "أبرز إنجازات الشهر", value: report.highlights, placeholder: "أهم ما تحقق خلال الشهر" },
            { key: "employeeNotes", label: "ملاحظاتي", value: report.employeeNotes, placeholder: "تحديات، اقتراحات، أو توضيحات للأرقام" },
          ]}
        />
      )}
      {canReview && <ReportReviewPanel kind="monthly" reportId={id} existingComment={report.managerNotes} />}
      {isReviewer && !canReview && <ManagerNotesEditor reportId={id} value={report.managerNotes} />}

      {!editable && (
        <ReportSection title="ملاحظات الموظف">
          <div className="grid gap-3 md:grid-cols-2">
            <NoteBlock label="أبرز إنجازات الشهر" value={report.highlights} />
            <NoteBlock label="ملاحظات الموظف" value={report.employeeNotes} />
          </div>
        </ReportSection>
      )}

      <MonthlyReportBody content={report.content} />

      <GeneratedTextBlock text={report.generatedText} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <AttachmentsPanel entityType="MONTHLY_REPORT" entityId={id} initial={attachments} currentUserId={me.id} canManage={hasPermission(user, PERMISSIONS.TASKS_ASSIGN)} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CommentsThread entityType="MONTHLY_REPORT" entityId={id} initial={comments} currentUserId={me.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
