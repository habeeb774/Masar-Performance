import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/action";
import { activeRatingBands, reviewForExport } from "@/server/services/performance";
import { buildDuties, exportFileName, type ExportCategory, type ExportDuty } from "@/lib/performance-export";
import { num } from "@/lib/num";
import { renderPerformanceWorkbook } from "./performance-xlsx";

const FINAL = ["APPROVED", "ACKNOWLEDGED"];

/** Read-only: builds the HR workbook for one employee and month from stored data. */
export async function buildEmployeePerformanceFile(employeeId: string, year: number, month: number) {
  const employee = await db.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { fullName: true, jobTitle: { select: { name: true } }, department: { select: { name: true, parent: { select: { name: true } } } } },
  });
  const department = employee.department ? [employee.department.name, employee.department.parent?.name].filter(Boolean).join(" / ") : "—";
  const ratingBands = await activeRatingBands();

  // The official monthly evaluation is the single source of truth for HR: same
  // duties, weights, achieved/target and final score the manager approved.
  const evaluation = await db.performanceEvaluation.findFirst({
    where: { employeeId, year, month },
    include: { duties: { orderBy: { sortOrder: "asc" }, include: { indicators: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (evaluation) {
    const duties: ExportDuty[] = evaluation.duties.map((d) => ({
      title: d.title,
      weight: num(d.weight),
      rows: d.indicators.map((i) => ({ name: i.title, indicator: i.description ?? i.title, note: i.notes ?? "", achieved: num(i.achieved), target: num(i.target), weight: num(i.weight) })),
    }));
    if (duties.length === 0) throw new UserError(`لا توجد مؤشرات أداء لـ ${employee.fullName} في هذا الشهر`);
    const computed = num(evaluation.computedScore);
    const buffer = await renderPerformanceWorkbook(
      {
        employeeName: employee.fullName,
        jobTitle: employee.jobTitle?.name ?? "—",
        department,
        year,
        month,
        draftNote: evaluation.status === "APPROVED" ? null : "مسودة — التقييم لم يُعتمد بعد",
        adjustment: evaluation.overrideScore === null ? 0 : num(evaluation.overrideScore) - computed,
        adjustmentReason: evaluation.overrideReason,
        managerNotes: evaluation.managerNotes,
        ratingBands,
      },
      duties,
    );
    return { fileName: exportFileName(employee.fullName, year, month), buffer, employeeName: employee.fullName, finalScore: num(evaluation.finalScore) };
  }

  // no official evaluation yet: preliminary workbook from the KPI review
  const data = await reviewForExport(employeeId, year, month);

  const goals = (data.ctx.plan?.goals ?? [])
    .filter((g) => g.status !== "CANCELLED")
    .map((g) => ({ name: g.name, dutyName: g.dutyName, category: g.category, unit: g.unit, target: num(g.targetValue), achieved: num(g.achievedValue), status: g.status }));
  const adHoc = data.ctx.adHoc
    .filter((t) => t.includeInEvaluation && t.status !== "CANCELLED")
    .map((t) => ({ title: t.title, status: t.status, progress: t.progress, weight: num(t.weight) }));
  const duties = buildDuties(
    data.results.map((r) => ({ ...r, category: r.category as ExportCategory })),
    goals,
    adHoc,
  );
  if (duties.length === 0) throw new UserError(`لا توجد مؤشرات أداء لـ ${employee.fullName} في هذا الشهر`);

  const buffer = await renderPerformanceWorkbook(
    {
      employeeName: employee.fullName,
      jobTitle: employee.jobTitle?.name ?? "—",
      department,
      year,
      month,
      draftNote: data.preview ? "تقييم أولي — لم يُحسب التقييم الشهري بعد" : data.status && !FINAL.includes(data.status) ? "مسودة — التقييم لم يُعتمد بعد" : null,
      adjustment: data.adjustment,
      adjustmentReason: data.adjustmentReason,
      managerNotes: data.managerNotes,
      ratingBands,
    },
    duties,
  );
  return { fileName: exportFileName(employee.fullName, year, month), buffer, employeeName: employee.fullName, finalScore: null as number | null };
}
