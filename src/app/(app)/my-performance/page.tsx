import type { Metadata } from "next";
import Link from "next/link";
import { Award, ChevronDown, Printer, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/shared/page";
import type { SearchParams } from "@/lib/params";
import { str } from "@/lib/params";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { num } from "@/lib/num";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { can, requirePermission } from "@/server/auth/session";
import { getEvaluation } from "@/server/services/evaluation";
import { toEvaluationData } from "@/features/evaluation/types";
import { EvaluationSummary } from "@/features/evaluation/evaluation-summary";
import { EvaluationSheet, fmt } from "@/features/evaluation/evaluation-sheet";

export const metadata: Metadata = { title: "أدائي" };

/**
 * «أدائي»: the employee's approved official evaluations — the same number the manager approved.
 * Drafts stay hidden until approval; details sit behind «عرض التفاصيل».
 */
export default async function MyPerformancePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.PERFORMANCE_VIEW_OWN);
  if (!user.employeeId) {
    const canManageEmployees = can(user, PERMISSIONS.EMPLOYEES_MANAGE);
    return (
      <>
        <PageHeader title="أدائي" />
        <EmptyState
          icon={UserX}
          title="حسابك غير مرتبط بملف موظف"
          description={canManageEmployees ? "اربط حسابك بملف موظف من صفحة الموظفين ليظهر أداؤك هنا." : "اطلب من مدير النظام ربط حسابك بملف موظف ليظهر أداؤك هنا."}
          action={
            canManageEmployees ? (
              <Button size="sm" asChild>
                <Link href="/employees">الموظفون</Link>
              </Button>
            ) : undefined
          }
        />
      </>
    );
  }

  const approved = await db.performanceEvaluation.findMany({
    where: { employeeId: user.employeeId, status: "APPROVED" },
    select: { id: true, year: true, month: true, finalScore: true, ratingLabel: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 12,
  });
  if (approved.length === 0) {
    return (
      <>
        <PageHeader title="أدائي" />
        <EmptyState icon={Award} title="لا يوجد تقييم معتمد بعد" description="يظهر تقييمك الشهري هنا بعد أن يعتمده مديرك." />
      </>
    );
  }

  const sp = await searchParams;
  const selectedId = approved.some((e) => e.id === str(sp.id)) ? str(sp.id)! : approved[0].id;
  const evaluation = (await getEvaluation(selectedId))!;
  const data = toEvaluationData(evaluation);

  return (
    <div className="space-y-4">
      <PageHeader
        title="أدائي"
        description={`تقييم ${monthLabel(data.year, data.month)} — اعتمد ${formatDateTimeAr(evaluation.approvedAt)}`}
        actions={
          <Button variant="ghost" asChild>
            <Link href={`/print/evaluations/${data.id}?print=1`} target="_blank">
              <Printer /> طباعة
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          <EvaluationSummary data={data} />
          {data.managerNotes && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">ملاحظات المدير</p>
              <p className="whitespace-pre-wrap">{data.managerNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
          عرض التفاصيل
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t p-4">
          <EvaluationSheet data={{ ...data, managerNotes: null }} />
        </div>
      </details>

      {approved.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">الأشهر السابقة</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {approved.map((e) => (
              <li key={e.id}>
                <Link href={`/my-performance?id=${e.id}`} className={cn("flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-accent/40", e.id === selectedId && "bg-accent/30 font-medium")}>
                  <span>{monthLabel(e.year, e.month)}</span>
                  <span className="tabular-nums">
                    {fmt(num(e.finalScore))} · {e.ratingLabel ?? "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
