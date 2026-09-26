import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { CheckCircle2, History, ListChecks, MessageSquareText, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { KeyValue, PageHeader } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import type { IdParams } from "@/lib/params";
import { canAccessEmployee, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { REVIEW_STATUS_LABELS } from "@/lib/labels";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { getReviewDetail } from "@/server/queries/performance";
import { acknowledgeReviewAction, approveReviewAction } from "@/actions/performance";
import { KpiResultsTable } from "@/features/performance/kpi-results-table";
import { ReviewAdjustForm } from "@/features/performance/review-adjust-form";
import { CalculateReviewButton } from "@/features/performance/review-actions";
import { ReviewAuditTrail, ReviewScoreSummary } from "@/features/performance/review-summary";

export const metadata: Metadata = { title: "تفاصيل التقييم" };

export default async function ReviewDetailPage({ params }: { params: IdParams }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getReviewDetail(id);
  if (!data) notFound();
  const { review, employee } = data;

  const isOwner = review.employeeId === user.employeeId;
  const approvedState = review.status === "APPROVED" || review.status === "ACKNOWLEDGED";
  const isManager =
    (hasPermission(user, PERMISSIONS.PERFORMANCE_REVIEW) || hasPermission(user, PERMISSIONS.PERFORMANCE_APPROVE)) &&
    canAccessEmployee(user, review.employeeId);
  if (!isManager && !(isOwner && approvedState)) forbidden();

  // a manager may view their own review, but never edit or approve it
  const canEdit = isManager && !isOwner && hasPermission(user, PERMISSIONS.PERFORMANCE_REVIEW) && !approvedState;
  const canApprove = isManager && !isOwner && hasPermission(user, PERMISSIONS.PERFORMANCE_APPROVE) && ["CALCULATED", "MANAGER_REVIEW"].includes(review.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`تقييم ${employee.fullName} — ${monthLabel(review.year, review.month)}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {employee.jobTitle ?? "بدون مسمى"} {employee.department ? `· ${employee.department}` : ""}
            <EnumBadge map={REVIEW_STATUS_LABELS} value={review.status} />
          </span>
        }
        actions={
          <>
            {isManager && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/employees/${employee.id}`}>
                  <UserRound /> ملف الموظف
                </Link>
              </Button>
            )}
            {canEdit && <CalculateReviewButton employeeId={employee.id} year={review.year} month={review.month} hasReview />}
            {canApprove && (
              <ActionButton
                size="sm"
                action={approveReviewAction.bind(null, review.id)}
                confirm={{ title: "اعتماد التقييم؟", description: "بعد الاعتماد لا يمكن تعديل النتائج أو إعادة الحساب، وسيتم إشعار الموظف.", confirmLabel: "اعتماد" }}
              >
                <CheckCircle2 /> اعتماد التقييم
              </ActionButton>
            )}
            {isManager && !canApprove && !approvedState && hasPermission(user, PERMISSIONS.PERFORMANCE_APPROVE) && (
              <Button size="sm" disabled title={isOwner ? "لا يمكنك اعتماد تقييمك الشخصي" : "احسب التقييم أولًا"}>
                <CheckCircle2 /> اعتماد التقييم
              </Button>
            )}
            {isOwner && review.status === "APPROVED" && (
              <ActionButton size="sm" action={acknowledgeReviewAction.bind(null, review.id)} confirm={{ title: "تأكيد الاطلاع على التقييم؟", confirmLabel: "اطلعت" }}>
                <CheckCircle2 /> اطلعت على التقييم
              </ActionButton>
            )}
          </>
        }
      />

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
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4 text-muted-foreground" /> نتائج مؤشرات الأداء
          </CardTitle>
          <CardDescription>اضغط السهم لعرض تفاصيل احتساب كل مؤشر. التعديلات اليدوية تبقى محفوظة عند إعادة الحساب.</CardDescription>
        </CardHeader>
        <CardContent>
          <KpiResultsTable results={data.results} canEdit={canEdit} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="size-4 text-muted-foreground" /> مراجعة المدير
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <ReviewAdjustForm
                reviewId={review.id}
                autoScore={review.autoScore}
                initial={{
                  adjustment: review.managerAdjustment,
                  reason: review.adjustmentReason,
                  managerNotes: review.managerNotes,
                  strengths: review.strengths,
                  improvements: review.improvements,
                }}
              />
            ) : (
              <div className="space-y-4 text-sm">
                {[
                  { label: "ملاحظات المدير", value: review.managerNotes },
                  { label: "نقاط القوة", value: review.strengths },
                  { label: "فرص التحسين", value: review.improvements },
                ].map((b) => (
                  <div key={b.label}>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{b.label}</p>
                    <p className="whitespace-pre-line">{b.value ?? "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">معلومات التقييم</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <KeyValue label="المدير المباشر">{employee.manager ?? "—"}</KeyValue>
            <KeyValue label="تاريخ الحساب">{formatDateTimeAr(review.calculatedAt)}</KeyValue>
            <KeyValue label="اعتمده">{review.approvedBy ?? "—"}</KeyValue>
            <KeyValue label="تاريخ الاعتماد">{formatDateTimeAr(review.approvedAt)}</KeyValue>
            <KeyValue label="اطلاع الموظف">{formatDateTimeAr(review.acknowledgedAt)}</KeyValue>
            {review.planId && isManager && (
              <KeyValue label="الخطة الشهرية">
                <Link href={`/monthly-plans/${review.planId}`} className="text-primary hover:underline">
                  عرض الخطة
                </Link>
              </KeyValue>
            )}
          </CardContent>
        </Card>
      </div>

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-muted-foreground" /> سجل التعديلات
            </CardTitle>
            <CardDescription>كل عمليات الحساب والتعديل والاعتماد على هذا التقييم، الأحدث أولًا</CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewAuditTrail entries={data.audit} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
