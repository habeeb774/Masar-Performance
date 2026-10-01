import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { IdParams } from "@/lib/params";
import { requireEmployeeAccess, requireUser } from "@/server/auth/session";
import { getEvaluation } from "@/server/services/evaluation";
import { toEvaluationData } from "@/features/evaluation/types";
import { EvaluationSheet } from "@/features/evaluation/evaluation-sheet";
import { PrintTrigger } from "@/features/reports/print-trigger";

export const metadata: Metadata = { title: "طباعة التقييم الشهري" };

/** Same order as the manager's sheet: header, the four duties, final result and rating. */
export default async function PrintEvaluationPage({ params }: { params: IdParams }) {
  const { id } = await params;
  await requireUser();
  const evaluation = await getEvaluation(id);
  if (!evaluation) notFound();
  await requireEmployeeAccess(evaluation.employeeId);
  return (
    <div className="space-y-4">
      <PrintTrigger />
      <EvaluationSheet data={toEvaluationData(evaluation)} />
    </div>
  );
}
