import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import type { IdParams } from "@/lib/params";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { requireEmployeeAccess, requireUser } from "@/server/auth/session";
import { getEvaluation } from "@/server/services/evaluation";
import { toEvaluationData } from "@/features/evaluation/types";
import { EvaluationSheet } from "@/features/evaluation/evaluation-sheet";
import { EvaluationEditor } from "@/features/evaluation/evaluation-editor";
import { ReopenEvaluationButton } from "@/features/evaluation/evaluation-buttons";

export const metadata: Metadata = { title: "التقييم الرسمي الشهري" };

export default async function EvaluationPage({ params }: { params: IdParams }) {
  const { id } = await params;
  await requireUser();
  const evaluation = await getEvaluation(id);
  if (!evaluation) notFound();
  const user = await requireEmployeeAccess(evaluation.employeeId);
  const data = toEvaluationData(evaluation);
  const canEdit = hasPermission(user, PERMISSIONS.PERFORMANCE_REVIEW);
  const canApprove = hasPermission(user, PERMISSIONS.PERFORMANCE_APPROVE);
  const editing = canEdit && data.status === "DRAFT";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`التقييم الرسمي — ${data.employeeName}`}
        description={`${monthLabel(data.year, data.month)} · ${data.status === "APPROVED" ? `معتمد ${formatDateTimeAr(evaluation.approvedAt)}` : "مسودة"}`}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={`/performance/evaluations?year=${data.year}&month=${data.month}`}>
                <ArrowRight /> التقييمات
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/print/evaluations/${id}?print=1`} target="_blank">
                <Printer /> طباعة / PDF
              </Link>
            </Button>
            {data.status === "APPROVED" && canApprove && <ReopenEvaluationButton evaluationId={id} />}
          </>
        }
      />
      <Card>
        <CardContent>{editing ? <EvaluationEditor data={data} canApprove={canApprove} /> : <EvaluationSheet data={data} />}</CardContent>
      </Card>
    </div>
  );
}
