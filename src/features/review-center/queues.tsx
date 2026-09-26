import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/shared/action-button";
import { EmptyState, NotionSyncedTag, SectionTitle } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { Pager } from "@/components/shared/url-filters";
import { approvePlanAction, approveWeeklyVarianceAction } from "@/actions/plans";
import { reviewMonthlyReportAction, reviewWeeklyReportAction } from "@/actions/reports";
import { NOTION_STATUS_LABELS, REPORT_STATUS_LABELS } from "@/lib/labels";
import { formatDateAr, formatDateTimeAr, monthLabel } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import type { getMonthlyReportsQueue, getNotionQueue, getPlansQueue, getWeeklyReportsQueue } from "@/server/queries/review-center";

function sinceDays(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "اليوم";
  if (days === 1) return "منذ يوم";
  if (days === 2) return "منذ يومين";
  return `منذ ${days} أيام`;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border">{children}</div>;
}

export function WeeklyReportsQueue({ rows, canApprove }: { rows: Awaited<ReturnType<typeof getWeeklyReportsQueue>>; canApprove: boolean }) {
  if (rows.length === 0) return <EmptyState icon={FileText} title="لا توجد تقارير أسبوعية بانتظار المراجعة" />;
  return (
    <Wrap>
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="text-start">الموظف</TableHead>
            <TableHead className="text-start">الأسبوع</TableHead>
            <TableHead className="text-start">الحالة</TableHead>
            <TableHead className="text-start">أُرسل</TableHead>
            <TableHead className="text-end">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium">{r.employee}</div>
                <div className="text-xs text-muted-foreground">{r.jobTitle ?? "—"}</div>
              </TableCell>
              <TableCell className="text-sm">
                الأسبوع {r.weekIndex}
                <div className="text-xs text-muted-foreground">
                  {formatDateAr(r.weekStart)} – {formatDateAr(r.weekEnd)}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <EnumBadge map={REPORT_STATUS_LABELS} value={r.status} />
                  {r.hasBlockers && <StatusBadge tone="warning">معوقات</StatusBadge>}
                </div>
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{r.submittedAt ? `${formatDateTimeAr(r.submittedAt)} · ${sinceDays(r.submittedAt)}` : "—"}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1.5">
                  {canApprove && (
                    <ActionButton size="sm" variant="outline" action={reviewWeeklyReportAction.bind(null, r.id, { decision: "APPROVE" })} confirm={{ title: `اعتماد تقرير ${r.employee} للأسبوع ${r.weekIndex}؟`, confirmLabel: "اعتماد" }}>
                      <CheckCircle2 /> اعتماد
                    </ActionButton>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/reports/weekly/${r.id}`}>
                      فتح <ArrowLeft />
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Wrap>
  );
}

export function MonthlyReportsQueue({ rows, canApprove }: { rows: Awaited<ReturnType<typeof getMonthlyReportsQueue>>; canApprove: boolean }) {
  if (rows.length === 0) return <EmptyState icon={FileText} title="لا توجد تقارير شهرية بانتظار المراجعة" />;
  return (
    <Wrap>
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="text-start">الموظف</TableHead>
            <TableHead className="text-start">الشهر</TableHead>
            <TableHead className="text-start">الحالة</TableHead>
            <TableHead className="text-start">أُرسل</TableHead>
            <TableHead className="text-end">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium">{r.employee}</div>
                <div className="text-xs text-muted-foreground">{r.jobTitle ?? "—"}</div>
              </TableCell>
              <TableCell className="text-sm">{monthLabel(r.year, r.month)}</TableCell>
              <TableCell>
                <EnumBadge map={REPORT_STATUS_LABELS} value={r.status} />
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{r.submittedAt ? `${formatDateTimeAr(r.submittedAt)} · ${sinceDays(r.submittedAt)}` : "—"}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1.5">
                  {canApprove && (
                    <ActionButton size="sm" variant="outline" action={reviewMonthlyReportAction.bind(null, r.id, { decision: "APPROVE" })} confirm={{ title: `اعتماد التقرير الشهري لـ ${r.employee}؟`, confirmLabel: "اعتماد" }}>
                      <CheckCircle2 /> اعتماد
                    </ActionButton>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/reports/monthly/${r.id}`}>
                      فتح <ArrowLeft />
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Wrap>
  );
}

export function PlansQueue({ data, canApprove }: { data: Awaited<ReturnType<typeof getPlansQueue>>; canApprove: boolean }) {
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>خطط شهرية بانتظار الاعتماد ({data.plans.length})</SectionTitle>
        {data.plans.length === 0 ? (
          <EmptyState icon={Inbox} title="لا توجد خطط شهرية بانتظار الاعتماد" className="py-6" />
        ) : (
          <Wrap>
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-start">الموظف</TableHead>
                  <TableHead className="text-start">الشهر</TableHead>
                  <TableHead className="text-start">الأهداف</TableHead>
                  <TableHead className="text-start">مجموع الأوزان</TableHead>
                  <TableHead className="text-start">أُرسلت</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.employee}</div>
                      <div className="text-xs text-muted-foreground">{p.jobTitle ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm">{monthLabel(p.year, p.month)}</TableCell>
                    <TableCell className="tabular-nums">{formatNumber(p.goals)}</TableCell>
                    <TableCell>
                      <span className={cn("tabular-nums", Math.abs(p.totalWeight - 100) > 0.01 && "font-semibold text-warning")}>{formatNumber(p.totalWeight, 2)}%</span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{p.submittedAt ? `${formatDateTimeAr(p.submittedAt)} · ${sinceDays(p.submittedAt)}` : "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        {canApprove && (
                          <ActionButton
                            size="sm"
                            variant="outline"
                            action={approvePlanAction.bind(null, p.id)}
                            confirm={{ title: `اعتماد خطة ${p.employee} لشهر ${monthLabel(p.year, p.month)}؟`, description: "سيتم توليد الأسابيع تلقائيًا بعد الاعتماد.", confirmLabel: "اعتماد" }}
                            reason={{ label: "ملاحظات للموظف (اختياري)" }}
                          >
                            <CheckCircle2 /> اعتماد
                          </ActionButton>
                        )}
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/monthly-plans/${p.id}`}>
                            فتح <ArrowLeft />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Wrap>
        )}
      </section>

      <section>
        <SectionTitle>فروق توزيع أسبوعي بانتظار الاعتماد ({data.variance.length})</SectionTitle>
        {data.variance.length === 0 ? (
          <EmptyState icon={Inbox} title="لا توجد فروق توزيع بانتظار الاعتماد" className="py-6" />
        ) : (
          <Wrap>
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-start">الموظف</TableHead>
                  <TableHead className="text-start">الشهر</TableHead>
                  <TableHead className="text-start">الأسابيع</TableHead>
                  <TableHead className="min-w-48 text-start">مبرر الفرق</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.variance.map((v) => (
                  <TableRow key={v.planId}>
                    <TableCell className="font-medium">{v.employee}</TableCell>
                    <TableCell className="text-sm">{monthLabel(v.year, v.month)}</TableCell>
                    <TableCell className="text-sm tabular-nums">{v.weeks.join("، ")}</TableCell>
                    <TableCell className="max-w-72 text-xs whitespace-normal text-muted-foreground">{v.note ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        {canApprove && (
                          <ActionButton size="sm" variant="outline" action={approveWeeklyVarianceAction.bind(null, v.planId)} confirm={{ title: `اعتماد توزيع ${v.employee} الأسبوعي؟`, confirmLabel: "اعتماد" }}>
                            <CheckCircle2 /> اعتماد
                          </ActionButton>
                        )}
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/weekly-plans?plan=${v.planId}`}>
                            فتح <ArrowLeft />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Wrap>
        )}
      </section>
    </div>
  );
}

export function NotionQueue({ data, emptyTitle }: { data: Awaited<ReturnType<typeof getNotionQueue>>; emptyTitle: string }) {
  if (data.total === 0) return <EmptyState icon={Inbox} title={emptyTitle} description="تُحدَّث هذه القائمة مع كل مزامنة من Notion." />;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <NotionSyncedTag />
        <span className="text-xs text-muted-foreground">الأقدم أولًا · للقراءة فقط</span>
      </div>
      {data.groups.map((g) => (
        <section key={g.label}>
          <SectionTitle>
            {g.label} <span className="text-sm font-normal text-muted-foreground">({g.items.length})</span>
          </SectionTitle>
          <Wrap>
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-start">العنصر</TableHead>
                  <TableHead className="text-start">الدفعة</TableHead>
                  <TableHead className="text-start">كود المنتج</TableHead>
                  <TableHead className="text-start">الموظف</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="text-start">منذ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="max-w-80 whitespace-normal">
                      {it.url ? (
                        <a href={it.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                          {it.title} <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                        </a>
                      ) : (
                        <span className="font-medium">{it.title}</span>
                      )}
                      <div className="text-xs text-muted-foreground">{it.dataSource}</div>
                    </TableCell>
                    <TableCell className="text-sm">{it.batch ?? "—"}</TableCell>
                    <TableCell className="text-sm" dir="ltr">
                      {it.productCode ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{it.employee ?? <span className="text-muted-foreground">غير محدد</span>}</TableCell>
                    <TableCell>
                      <EnumBadge map={NOTION_STATUS_LABELS} value={it.status} />
                      {it.rawValues.length > 0 && <div className="mt-0.5 text-[11px] text-muted-foreground">{it.rawValues.join("، ")}</div>}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground" title={formatDateTimeAr(it.since)}>
                      {sinceDays(it.since)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Wrap>
        </section>
      ))}
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}
