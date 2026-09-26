import Link from "next/link";
import { History, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { GroupedBarChart, TrendChart } from "@/components/charts/charts";
import { formatNumber, formatPct } from "@/lib/num";
import { REVIEW_STATUS_LABELS } from "@/lib/labels";
import type { HistoryRow } from "@/server/queries/performance";
import { RatingBadge } from "./rating-badge";

/**
 * Employee performance history (table + charts). Shared by /employees/[id]
 * and /my-performance. `basePath` keeps other query params when toggling range.
 */
export function PerformanceHistory({
  rows,
  range,
  basePath,
  reviewHref,
}: {
  rows: HistoryRow[];
  range: 6 | 12;
  basePath: string;
  /** link to the review detail (omit to hide links) */
  reviewHref?: (reviewId: string) => string;
}) {
  const hasAny = rows.some((r) => r.planId || r.reviewId);
  const chartRows = rows.map((r) => ({
    label: r.label,
    finalScore: r.finalScore,
    productivity: r.productivity,
    quality: r.quality,
    achievement: r.achievement,
  }));
  const tableRows = [...rows].reverse();
  const sep = basePath.includes("?") ? "&" : "?";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-muted-foreground" /> سجل الأداء الشهري
          </CardTitle>
          <CardDescription>الإنجاز = التقدم الموزون لأهداف الخطة، والجودة = درجة الجودة في التقييم أو نسبة الاعتماد من Notion</CardDescription>
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-0.5">
          {([6, 12] as const).map((n) => (
            <Button key={n} size="sm" variant={range === n ? "secondary" : "ghost"} asChild>
              <Link href={`${basePath}${sep}range=${n}`} scroll={false}>
                آخر {n} أشهر
              </Link>
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasAny ? (
          <EmptyState icon={History} title="لا يوجد سجل أداء بعد" description="سيظهر السجل بعد إنشاء الخطط الشهرية وحساب التقييمات." />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">اتجاه النتيجة والإنتاجية والجودة</p>
                <TrendChart
                  data={chartRows}
                  series={[
                    { key: "finalScore", label: "النتيجة النهائية" },
                    { key: "productivity", label: "الإنتاجية" },
                    { key: "quality", label: "الجودة" },
                  ]}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">الإنجاز مقابل الجودة لكل شهر</p>
                <GroupedBarChart
                  data={chartRows}
                  xKey="label"
                  series={[
                    { key: "achievement", label: "الإنجاز %" },
                    { key: "quality", label: "الجودة %" },
                  ]}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-start">الشهر</TableHead>
                    <TableHead className="text-start">الأهداف</TableHead>
                    <TableHead className="min-w-36 text-start">نسبة الإنجاز</TableHead>
                    <TableHead className="text-start">الجودة</TableHead>
                    <TableHead className="text-start">النتيجة النهائية</TableHead>
                    <TableHead className="text-start">التقدير</TableHead>
                    <TableHead className="min-w-48 text-start">ملاحظات المدير</TableHead>
                    <TableHead className="min-w-48 text-start">أبرز الإنجازات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {r.reviewId && reviewHref ? (
                          <Link href={reviewHref(r.reviewId)} className="hover:underline">
                            {r.label}
                          </Link>
                        ) : (
                          r.label
                        )}
                        {r.reviewStatus && (
                          <div className="mt-0.5">
                            <EnumBadge map={REVIEW_STATUS_LABELS} value={r.reviewStatus} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{r.planId ? formatNumber(r.goalsCount) : "—"}</TableCell>
                      <TableCell>{r.achievement === null ? <span className="text-muted-foreground">بدون خطة</span> : <ProgressBar value={r.achievement} showLabel size="sm" />}</TableCell>
                      <TableCell className="tabular-nums">{formatPct(r.quality)}</TableCell>
                      <TableCell className="font-semibold tabular-nums">{r.finalScore === null ? "—" : formatNumber(r.finalScore, 1)}</TableCell>
                      <TableCell>
                        <RatingBadge label={r.ratingLabel} color={r.ratingColor} />
                      </TableCell>
                      <TableCell className="max-w-64 text-xs whitespace-normal text-muted-foreground">{r.managerNotes ?? "—"}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal">
                        {r.topAchievements.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <ul className="space-y-0.5 text-xs">
                            {r.topAchievements.slice(0, 4).map((g) => (
                              <li key={g} className="flex items-center gap-1">
                                <Trophy className="size-3 shrink-0 text-success" /> {g}
                              </li>
                            ))}
                            {r.topAchievements.length > 4 && <li className="text-muted-foreground">+ {r.topAchievements.length - 4} أخرى</li>}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
