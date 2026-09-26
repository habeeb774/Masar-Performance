import type { Metadata } from "next";
import Link from "next/link";
import { Award, CheckCircle2, ListChecks, ThumbsUp, TrendingUp, UserX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import type { SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { PERMISSIONS } from "@/lib/permissions";
import { REVIEW_STATUS_LABELS } from "@/lib/labels";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { requirePermission } from "@/server/auth/session";
import { getLatestApprovedReviewId, getPerformanceHistory, getReviewDetail } from "@/server/queries/performance";
import { acknowledgeReviewAction } from "@/actions/performance";
import { PerformanceHistory } from "@/features/performance/performance-history";
import { KpiResultsTable } from "@/features/performance/kpi-results-table";
import { ReviewScoreSummary } from "@/features/performance/review-summary";

export const metadata: Metadata = { title: "أدائي" };

export default async function MyPerformancePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.PERFORMANCE_VIEW_OWN);
  if (!user.employeeId) {
    return (
      <>
        <PageHeader title="أدائي" />
        <EmptyState icon={UserX} title="حسابك غير مرتبط بملف موظف" description="اطلب من مدير النظام ربط حسابك بملف موظف لعرض تقييماتك." />
      </>
    );
  }
  const sp = await searchParams;
  const range = int(sp.range, 6) === 12 ? 12 : 6;
  const [history, latestId] = await Promise.all([getPerformanceHistory(user.employeeId, range, true), getLatestApprovedReviewId(user.employeeId)]);
  const latest = latestId ? await getReviewDetail(latestId) : null;
  const review = latest?.review;

  return (
    <div className="space-y-6">
      <PageHeader title="أدائي" description="تقييماتك الشهرية المعتمدة وسجل إنجازك" />

      {!latest || !review ? (
        <EmptyState icon={Award} title="لا يوجد تقييم معتمد بعد" description="يظهر تقييمك هنا بعد أن يعتمده مديرك. يمكنك متابعة إنجازك الحالي من خطة الشهر." action={<Button size="sm" asChild><Link href="/my-month">خطة الشهر</Link></Button>} />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="size-4 text-primary" /> آخر تقييم معتمد — {monthLabel(review.year, review.month)}
                </CardTitle>
                <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                  <EnumBadge map={REVIEW_STATUS_LABELS} value={review.status} />
                  <span>اعتمد في {formatDateTimeAr(review.approvedAt)}{review.approvedBy ? ` بواسطة ${review.approvedBy}` : ""}</span>
                  {review.acknowledgedAt && <span>· اطلعت عليه في {formatDateTimeAr(review.acknowledgedAt)}</span>}
                </CardDescription>
              </div>
              {review.status === "APPROVED" && (
                <ActionButton action={acknowledgeReviewAction.bind(null, review.id)} confirm={{ title: "تأكيد الاطلاع على التقييم؟", description: "سيُسجل أنك اطلعت على تقييم هذا الشهر ونتيجته.",confirmLabel: "اطلعت" }}>
                  <CheckCircle2 /> اطلعت على التقييم
                </ActionButton>
              )}
            </CardHeader>
          </Card>

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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">تفصيل مؤشرات الأداء</CardTitle>
              <CardDescription>كيف تم احتساب نتيجتك — اضغط السهم لعرض التفاصيل</CardDescription>
            </CardHeader>
            <CardContent>
              <KpiResultsTable results={latest.results} canEdit={false} />
            </CardContent>
          </Card>
        </>
      )}

      <PerformanceHistory rows={history} range={range} basePath="/my-performance" reviewHref={(id) => `/performance/reviews/${id}`} />
    </div>
  );
}
