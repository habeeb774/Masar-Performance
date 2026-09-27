import type { Metadata } from "next";
import Link from "next/link";
import { Award, CheckCircle2, ChevronDown, ListChecks, ThumbsUp, TrendingUp, UserX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { ProgressBar } from "@/components/shared/progress-bar";
import type { SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { aggregateScores } from "@/lib/kpi/engine";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth/session";
import { getLatestApprovedReviewId, getPerformanceHistory, getReviewDetail, type KpiResultRow } from "@/server/queries/performance";
import { getEmployeeBatches } from "@/server/queries/batches";
import { pct } from "@/lib/notion/batches";
import { acknowledgeReviewAction } from "@/actions/performance";
import { PerformanceHistory } from "@/features/performance/performance-history";
import { KpiResultsTable } from "@/features/performance/kpi-results-table";
import { ReviewScoreSummary } from "@/features/performance/review-summary";
import { RatingBadge, ratingTone, scoreTextClass } from "@/features/performance/rating-badge";

export const metadata: Metadata = { title: "أدائي" };

function commitmentScore(results: KpiResultRow[]): number | null {
  const list = results.filter((r) => r.category === "COMMITMENT").map((r) => ({ ...r, category: "PRODUCTIVITY" as const }));
  return aggregateScores(list).productivityScore;
}

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
  const sp = await searchParams;
  const range = int(sp.range, 6) === 12 ? 12 : 6;
  const [history, latestId] = await Promise.all([getPerformanceHistory(user.employeeId, range, true), getLatestApprovedReviewId(user.employeeId)]);
  const latest = latestId ? await getReviewDetail(latestId) : null;
  const review = latest?.review;

  if (!latest || !review) {
    return (
      <div className="space-y-6">
        <PageHeader title="أدائي" />
        <EmptyState
          icon={Award}
          title="لم يُعتمد تقييمك بعد"
          description="تظهر نسبك هنا بعد أن يعتمد مديرك تقييم الشهر. حتى ذلك الحين، تابع أهدافك وأنجزها من «خطتي»."
          action={
            <Button size="sm" asChild>
              <Link href="/my-plan">افتح خطتي</Link>
            </Button>
          }
        />
        {history.length > 0 && (
          <PerformanceHistory rows={history} range={range} basePath="/my-performance" reviewHref={(id) => `/performance/reviews/${id}`} />
        )}
      </div>
    );
  }

  const batches = await getEmployeeBatches(user.employeeId, review.year, review.month);
  const monthKeys = new Map((batches?.month ?? []).map((b) => [b.key, b.label]));
  const q = (batches?.month ?? []).reduce((a, b) => ({ approved: a.approved + b.quality.approved, firstPass: a.firstPass + b.quality.firstPass, reworked: a.reworked + b.quality.reworked }), { approved: 0, firstPass: 0, reworked: 0 });
  const sentBack = (batches?.quality ?? []).filter((r) => monthKeys.has(r.batch) && r.rejections > 0).sort((a, b) => b.rejections - a.rejections);

  const tone = ratingTone(review.ratingColor);
  const scores = [
    { label: "الإنتاجية", hint: "كم أنجزت من أهدافك", value: review.productivityScore },
    { label: "الجودة", hint: "جودة ما سلّمته", value: review.qualityScore },
    { label: "الالتزام", hint: "التزامك بالمواعيد", value: commitmentScore(latest.results) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أداؤك — ${monthLabel(review.year, review.month)}`}
        actions={
          review.status === "APPROVED" ? (
            <ActionButton action={acknowledgeReviewAction.bind(null, review.id)} confirm={{ title: "تأكيد الاطلاع على التقييم؟", description: "سيُسجل أنك اطلعت على تقييم هذا الشهر ونتيجته.", confirmLabel: "اطلعت" }}>
              <CheckCircle2 /> اطلعت على التقييم
            </ActionButton>
          ) : undefined
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            النتيجة العامة <span className={cn("font-bold tabular-nums", scoreTextClass[tone])}>{formatNumber(review.finalScore, 0)}</span> من 100
          </span>
          <RatingBadge label={review.ratingLabel} color={review.ratingColor} />
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        {scores.map((s) => (
          <Card key={s.label} className="gap-0 py-5">
            <CardContent className="space-y-3 px-5">
              <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
              <p className="text-4xl font-extrabold tabular-nums">{formatPct(s.value, 0)}</p>
              <ProgressBar value={s.value ?? 0} />
              <p className="text-xs text-muted-foreground">{s.value === null ? "لا يوجد ما يُقاس هذا الشهر" : s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
          تفاصيل إضافية
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t p-4">
          <p className="text-xs text-muted-foreground">
            اعتمد في {formatDateTimeAr(review.approvedAt)}
            {review.approvedBy ? ` بواسطة ${review.approvedBy}` : ""}
            {review.acknowledgedAt ? ` · اطلعت عليه في ${formatDateTimeAr(review.acknowledgedAt)}` : ""}
          </p>

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              { title: "ملاحظات المدير", icon: ListChecks, value: review.managerNotes },
              { title: "نقاط القوة", icon: ThumbsUp, value: review.strengths },
              { title: "فرص التحسين", icon: TrendingUp, value: review.improvements },
            ].map((b) => (
              <Card key={b.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <b.icon className="size-4 text-muted-foreground" /> {b.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-line">{b.value ?? <span className="text-muted-foreground">لا توجد</span>}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {batches && monthKeys.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">جودة الصور</CardTitle>
                <CardDescription>من دفعات {monthLabel(review.year, review.month)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  {[
                    ["اعتُمدت من أول مراجعة", q.approved > 0 ? formatPct(pct(q.firstPass, q.approved)) : "—"],
                    ["صور معتمدة", formatNumber(q.approved)],
                    ["احتاجت تحسين", formatNumber(q.reworked)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-muted/40 p-3">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                {sentBack.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b">
                          <th className="py-2 text-start font-medium">المنتج</th>
                          <th className="py-2 text-start font-medium">الدفعة</th>
                          <th className="py-2 text-center font-medium">مرات الإرسال</th>
                          <th className="py-2 text-center font-medium">مرات طلب التحسين</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {sentBack.map((r, i) => (
                          <tr key={`${r.batch}-${r.title}-${i}`}>
                            <td className="max-w-48 py-2 pe-2 break-words">{r.title}</td>
                            <td className="py-2 pe-2 whitespace-nowrap">{monthKeys.get(r.batch) ?? r.batch}</td>
                            <td className="py-2 text-center tabular-nums">{formatNumber(r.submissions)}</td>
                            <td className="py-2 text-center tabular-nums">{formatNumber(r.rejections)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <ReviewScoreSummary
            autoScore={review.autoScore}
            adjustment={review.managerAdjustment}
            adjustmentReason={review.adjustmentReason}
            finalScore={review.finalScore}
            productivityScore={review.productivityScore}
            qualityScore={review.qualityScore}
            ratingLabel={review.ratingLabel}
            ratingColor={review.ratingColor}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">تفصيل مؤشرات الأداء</CardTitle>
              <CardDescription>كيف تم احتساب نتيجتك — اضغط السهم لعرض التفاصيل</CardDescription>
            </CardHeader>
            <CardContent>
              <KpiResultsTable results={latest.results} canEdit={false} />
            </CardContent>
          </Card>

          <PerformanceHistory rows={history} range={range} basePath="/my-performance" reviewHref={(id) => `/performance/reviews/${id}`} />
        </div>
      </details>
    </div>
  );
}
