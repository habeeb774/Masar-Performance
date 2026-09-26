import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { IdParams } from "@/lib/params";
import { requireEmployeeAccess, requireUser } from "@/server/auth/session";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { getMonthlyReport } from "@/server/queries/reports";
import { MonthlyReportBody, NoteBlock, ReportHeaderCard, ReportSection } from "@/features/reports/report-body";
import { PrintTrigger } from "@/features/reports/print-trigger";

export const metadata: Metadata = { title: "طباعة التقرير الشهري" };

export default async function PrintMonthlyReportPage({ params }: { params: IdParams }) {
  const { id } = await params;
  await requireUser();
  const report = await getMonthlyReport(id);
  if (!report) notFound();
  await requireEmployeeAccess(report.employeeId);

  return (
    <div className="space-y-4">
      <PrintTrigger />
      <ReportHeaderCard
        kind="monthly"
        employeeName={report.employeeName}
        jobTitle={report.jobTitle}
        period={monthLabel(report.year, report.month)}
        status={report.status}
        meta={[
          { label: "تاريخ الإرسال", value: formatDateTimeAr(report.submittedAt) },
          { label: "تاريخ المراجعة", value: formatDateTimeAr(report.reviewedAt) },
        ]}
      />
      {report.managerNotes && <NoteBlock label="ملاحظات المدير" value={report.managerNotes} tone="primary" />}
      <MonthlyReportBody content={report.content} />
      <ReportSection title="ملاحظات الموظف">
        <div className="grid grid-cols-2 gap-3">
          <NoteBlock label="أبرز إنجازات الشهر" value={report.highlights} />
          <NoteBlock label="ملاحظات الموظف" value={report.employeeNotes} />
        </div>
      </ReportSection>
    </div>
  );
}
