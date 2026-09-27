import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { IdParams } from "@/lib/params";
import { requireEmployeeAccess, requireUser } from "@/server/auth/session";
import { formatDateAr, formatDateTimeAr, monthLabel } from "@/lib/dates";
import { getWeeklyReport } from "@/server/queries/reports";
import { NoteBlock, ReportHeaderCard, ReportSection, WeeklyReportBody } from "@/features/reports/report-body";
import { PrintTrigger } from "@/features/reports/print-trigger";

export const metadata: Metadata = { title: "طباعة التقرير الأسبوعي" };

export default async function PrintWeeklyReportPage({ params }: { params: IdParams }) {
  const { id } = await params;
  await requireUser();
  const report = await getWeeklyReport(id);
  if (!report) notFound();
  await requireEmployeeAccess(report.employeeId);
  const c = report.content;
  const period = c.week.index
    ? `الفترة ${c.week.index} · ${formatDateAr(report.weekStart)} – ${formatDateAr(report.weekEnd)} (خطة ${monthLabel(c.week.year, c.week.month)})`
    : `${formatDateAr(report.weekStart)} – ${formatDateAr(report.weekEnd)}`;

  return (
    <div className="space-y-4">
      <PrintTrigger />
      <ReportHeaderCard
        kind="weekly"
        employeeName={report.employeeName}
        jobTitle={report.jobTitle}
        period={period}
        status={report.status}
        meta={[
          { label: "تاريخ الإرسال", value: formatDateTimeAr(report.submittedAt) },
          { label: "تاريخ المراجعة", value: formatDateTimeAr(report.reviewedAt) },
        ]}
      />
      {report.managerComment && <NoteBlock label={report.status === "RETURNED" ? "سبب الإعادة" : "تعليق المدير"} value={report.managerComment} tone="primary" />}
      <WeeklyReportBody content={c} />
      <ReportSection title="ملاحظات الموظف">
        <div className="grid grid-cols-2 gap-3">
          <NoteBlock label="أبرز الإنجازات" value={report.highlights} />
          <NoteBlock label="أسباب عدم الإنجاز" value={report.blockers} />
          <NoteBlock label="المرحّل للأسبوع القادم" value={report.carryOver} />
          <NoteBlock label="ملاحظات عامة" value={report.employeeNotes} />
        </div>
      </ReportSection>
    </div>
  );
}
