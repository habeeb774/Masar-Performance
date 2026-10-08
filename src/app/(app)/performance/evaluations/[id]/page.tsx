import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronDown, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import type { IdParams } from "@/lib/params";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { formatDateTimeAr } from "@/lib/dates";
import { requireEmployeeAccess, requireUser } from "@/server/auth/session";
import { getEvaluation } from "@/server/services/evaluation";
import { toEvaluationData } from "@/features/evaluation/types";
import { EvaluationSheet } from "@/features/evaluation/evaluation-sheet";
import { EvaluationEditor } from "@/features/evaluation/evaluation-editor";
import { ApproveEvaluationButton, ReopenEvaluationButton } from "@/features/evaluation/evaluation-buttons";
import { EvaluationSummary } from "@/features/evaluation/evaluation-summary";

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
        title="التقييم الشهري"
        description={data.status === "APPROVED" ? `معتمد ${formatDateTimeAr(evaluation.approvedAt)}` : "بانتظار الاعتماد"}
        actions={
          <Button variant="ghost" asChild>
            <Link href={`/employees/${evaluation.employeeId}`}>
              <ArrowRight /> صفحة الموظف
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-5">
          <EvaluationSummary data={data} />
          {/* one primary action; the rest stay secondary */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {data.status === "DRAFT" && canApprove && data.validation.length === 0 && <ApproveEvaluationButton evaluationId={id} label="اعتماد" />}
            {data.status === "APPROVED" && canApprove && <ReopenEvaluationButton evaluationId={id} />}
            <Button variant="ghost" asChild>
              <Link href={`/print/evaluations/${id}?print=1`} target="_blank">
                <Printer /> طباعة
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <a href={`/api/export/performance?employee=${evaluation.employeeId}&year=${data.year}&month=${data.month}`}>
                <FileSpreadsheet /> تصدير للموارد البشرية
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
      <details className="group rounded-xl border bg-card" open={editing && data.validation.length > 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
          عرض التفاصيل
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t p-4">{editing ? <EvaluationEditor data={data} canApprove={false} /> : <EvaluationSheet data={data} />}</div>
      </details>
    </div>
  );
}
