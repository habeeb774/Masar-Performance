import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { MonthPicker } from "@/components/shared/url-filters";
import type { SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { PLAN_STATUS_LABELS, REVIEW_STATUS_LABELS } from "@/lib/labels";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { requirePermission } from "@/server/auth/session";
import { currentMonth, getReviewsList } from "@/server/queries/performance";
import { RatingBadge } from "@/features/performance/rating-badge";
import { CalculateAllButton, CalculateReviewButton } from "@/features/performance/review-actions";

export const metadata: Metadata = { title: "التقييمات الشهرية" };

export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.PERFORMANCE_REVIEW, PERMISSIONS.PERFORMANCE_APPROVE);
  const sp = await searchParams;
  const now = await currentMonth();
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);
  const rows = await getReviewsList(user, year, month);
  const canCalculate = hasPermission(user, PERMISSIONS.PERFORMANCE_REVIEW);

  const calculated = rows.filter((r) => r.reviewId).length;
  const approved = rows.filter((r) => r.reviewStatus === "APPROVED" || r.reviewStatus === "ACKNOWLEDGED").length;
  const withPlan = rows.filter((r) => r.planId).length;
  const scored = rows.filter((r) => r.finalScore !== null);
  const avgFinal = scored.length ? scored.reduce((a, r) => a + (r.finalScore ?? 0), 0) / scored.length : null;

  return (
    <>
      <PageHeader
        title="التقييمات الشهرية"
        description={`حساب ومراجعة واعتماد تقييمات الموظفين لشهر ${monthLabel(year, month)}`}
        actions={
          <>
            <MonthPicker year={year} month={month} />
            {canCalculate && <CalculateAllButton year={year} month={month} />}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="الموظفون" value={formatNumber(rows.length)} icon={Users} hint={`${withPlan} لديهم خطة`} />
        <StatCard label="تقييمات محسوبة" value={formatNumber(calculated)} icon={ClipboardList} tone="info" />
        <StatCard label="تقييمات معتمدة" value={formatNumber(approved)} icon={ClipboardList} tone="success" />
        <StatCard label="متوسط النتيجة النهائية" value={avgFinal === null ? "—" : formatNumber(avgFinal, 1)} tone="primary" />
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={Users} title="لا يوجد موظفون في نطاقك" description="تظهر هنا تقييمات الموظفين النشطين الذين لديهم مسمى وظيفي." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-start">الموظف</TableHead>
                    <TableHead className="text-start">الخطة</TableHead>
                    <TableHead className="text-start">حالة التقييم</TableHead>
                    <TableHead className="text-start">الآلية</TableHead>
                    <TableHead className="text-start">التعديل</TableHead>
                    <TableHead className="text-start">النهائية</TableHead>
                    <TableHead className="text-start">التقدير</TableHead>
                    <TableHead className="text-start">تاريخ الحساب</TableHead>
                    <TableHead className="text-end">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const locked = r.reviewStatus === "APPROVED" || r.reviewStatus === "ACKNOWLEDGED";
                    return (
                      <TableRow key={r.employeeId}>
                        <TableCell>
                          <Link href={`/employees/${r.employeeId}`} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{r.jobTitle}</div>
                        </TableCell>
                        <TableCell>
                          {r.planStatus ? (
                            <Link href={`/monthly-plans/${r.planId}`}>
                              <EnumBadge map={PLAN_STATUS_LABELS} value={r.planStatus} />
                            </Link>
                          ) : (
                            <StatusBadge tone="warning">بدون خطة</StatusBadge>
                          )}
                        </TableCell>
                        <TableCell>{r.reviewStatus ? <EnumBadge map={REVIEW_STATUS_LABELS} value={r.reviewStatus} /> : <span className="text-xs text-muted-foreground">لم يُحسب</span>}</TableCell>
                        <TableCell className="tabular-nums">{r.autoScore === null ? "—" : formatNumber(r.autoScore, 2)}</TableCell>
                        <TableCell className="tabular-nums" dir="ltr">
                          {r.adjustment === null || r.adjustment === 0 ? "—" : `${r.adjustment > 0 ? "+" : ""}${formatNumber(r.adjustment, 2)}`}
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums">{r.finalScore === null ? "—" : formatNumber(r.finalScore, 2)}</TableCell>
                        <TableCell>
                          <RatingBadge label={r.ratingLabel} color={r.ratingColor} />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{r.calculatedAt ? formatDateTimeAr(new Date(r.calculatedAt)) : "—"}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1.5">
                            {canCalculate && !locked && (
                              <CalculateReviewButton employeeId={r.employeeId} year={year} month={month} hasReview={!!r.reviewId} disabled={!r.planId && !r.reviewId} title={!r.planId ? "لا توجد خطة لهذا الشهر" : undefined} />
                            )}
                            {r.reviewId && (
                              <Button size="sm" variant="ghost" asChild>
                                <Link href={`/performance/reviews/${r.reviewId}`}>
                                  التفاصيل <ArrowLeft />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
