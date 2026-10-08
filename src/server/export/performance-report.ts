import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/action";
import { activeRatingBands } from "@/server/services/performance";
import { createEvaluation, getEvaluation } from "@/server/services/evaluation";
import { exportFileName, type ExportDuty } from "@/lib/performance-export";
import { num } from "@/lib/num";
import { renderPerformanceWorkbook } from "./performance-xlsx";

const stripDutyPrefix = (title: string) => title.replace(/^الواجب\s+[^:：]+[:：]\s*/u, "").trim();

/**
 * Read-only HR export.
 *
 * IMPORTANT: the official monthly PerformanceEvaluation is the single source of truth.
 * Do not rebuild HR Excel from the legacy KPI review, because that can use different
 * goals/weights/targets and produce a different final score than the manager-approved
 * monthly evaluation.
 */
export async function buildEmployeePerformanceFile(employeeId: string, year: number, month: number) {
  const employee = await db.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { fullName: true, jobTitle: { select: { name: true } }, department: { select: { name: true, parent: { select: { name: true } } } } },
  });

  const created = await createEvaluation(null, employeeId, year, month);
  const evaluation = await getEvaluation(created.id);
  if (!evaluation) throw new UserError(`تعذر إنشاء تقييم ${employee.fullName} لهذا الشهر`);

  const duties: ExportDuty[] = evaluation.duties.map((duty) => ({
    title: stripDutyPrefix(duty.title),
    weight: num(duty.weight),
    rows: duty.indicators.map((indicator) => ({
      name: indicator.title,
      indicator: indicator.description ?? indicator.title,
      note: indicator.notes ?? "",
      achieved: num(indicator.achieved),
      target: num(indicator.target),
      weight: num(indicator.weight),
    })),
  }));

  if (duties.length === 0 || duties.every((d) => d.rows.length === 0)) {
    throw new UserError(`لا توجد مؤشرات في التقييم الرسمي لـ ${employee.fullName} في هذا الشهر`);
  }

  const department = employee.department ? [employee.department.name, employee.department.parent?.name].filter(Boolean).join(" / ") : "—";
  const computed = num(evaluation.computedScore);
  const final = num(evaluation.finalScore);
  const adjustment = evaluation.overrideScore !== null ? final - computed : 0;

  const buffer = await renderPerformanceWorkbook(
    {
      employeeName: employee.fullName,
      jobTitle: employee.jobTitle?.name ?? "—",
      department,
      year,
      month,
      draftNote: evaluation.status === "APPROVED" ? null : "مسودة — التقييم الرسمي لم يُعتمد بعد",
      adjustment,
      adjustmentReason: evaluation.overrideReason,
      managerNotes: evaluation.managerNotes,
      ratingBands: await activeRatingBands(),
    },
    duties,
  );

  return { fileName: exportFileName(employee.fullName, year, month), buffer, employeeName: employee.fullName, finalScore: final };
}
