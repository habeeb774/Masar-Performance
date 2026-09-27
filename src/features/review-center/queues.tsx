import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Inbox, MessageSquare, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/shared/action-button";
import { EmptyState, NotionSyncedTag, SectionTitle } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Pager } from "@/components/shared/url-filters";
import { approvePlanAction, approveWeeklyVarianceAction } from "@/actions/plans";
import { commentMonthlyReportAction, commentWeeklyReportAction, reviewMonthlyReportAction, reviewWeeklyReportAction } from "@/actions/reports";
import { NOTION_STATUS_LABELS } from "@/lib/labels";
import { formatDateAr, formatDateTimeAr, monthLabel } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import type { ReviewProduct } from "@/server/queries/batches";
import type { getBatchReviewQueue, getMonthlyReportsQueue, getNotionQueue, getPlansQueue, getWeeklyReportsQueue } from "@/server/queries/review-center";

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

function QueueList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y rounded-lg border">{children}</ul>;
}

function QueueRow({ href, title, meta, actions }: { href: string; title: string; meta: React.ReactNode; actions: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <Link href={href} className="block font-medium hover:underline">
          {title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{meta}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
    </li>
  );
}

function Calm({ title, description }: { title: string; description: string }) {
  return <EmptyState icon={CheckCircle2} title={title} description={description} />;
}

function ProgressMeta({ value }: { value: number | null }) {
  if (value === null) return null;
  return <ProgressBar value={value} showLabel size="sm" className="w-32" />;
}

type BoundAction = (reason?: string) => ReturnType<typeof commentWeeklyReportAction>;

/** Server actions are pre-bound (`.bind`) so they can cross into the client button. */
function ReportDecisionButtons({ subject, approve, comment }: { subject: string; approve: BoundAction; comment: BoundAction }) {
  return (
    <>
      <ActionButton size="sm" action={approve} confirm={{ title: `اعتماد ${subject}؟`, confirmLabel: "اعتماد" }}>
        <CheckCircle2 /> اعتماد
      </ActionButton>
      <ActionButton
        size="sm"
        variant="outline"
        action={comment}
        confirm={{
          title: `ملاحظة على ${subject}`,
          description: "تصل الملاحظة للموظف فورًا، ويبقى التقرير هنا حتى تعتمده.",
          confirmLabel: "حفظ الملاحظة",
        }}
        reason={{
          label: "الملاحظة",
          required: true,
          placeholder: "اكتب ملاحظتك للموظف…",
        }}
      >
        <MessageSquare /> ملاحظة
      </ActionButton>
    </>
  );
}

export function WeeklyReportsQueue({ rows, canApprove }: { rows: Awaited<ReturnType<typeof getWeeklyReportsQueue>>; canApprove: boolean }) {
  if (rows.length === 0) return <Calm title="لا توجد تقارير أسبوعية بانتظارك" description="تظهر هنا التقارير فور إرسالها من الموظفين." />;
  return (
    <QueueList>
      {rows.map((r) => {
        const subject = `تقرير ${r.employee} الأسبوعي — الأسبوع ${r.weekIndex}`;
        return (
          <QueueRow
            key={r.id}
            href={`/reports/weekly/${r.id}`}
            title={subject}
            meta={
              <>
                <span>
                  {formatDateAr(r.weekStart)} – {formatDateAr(r.weekEnd)}
                </span>
                <ProgressMeta value={r.progress} />
                {r.submittedAt && <span title={formatDateTimeAr(r.submittedAt)}>أُرسل {sinceDays(r.submittedAt)}</span>}
                {r.hasBlockers && <StatusBadge tone="warning">معوقات</StatusBadge>}
                {r.commented && <StatusBadge tone="info">أُرسلت ملاحظة</StatusBadge>}
              </>
            }
            actions={
              canApprove ? (
                <ReportDecisionButtons
                  subject={subject}
                  approve={reviewWeeklyReportAction.bind(null, r.id, {
                    decision: "APPROVE",
                  })}
                  comment={commentWeeklyReportAction.bind(null, r.id)}
                />
              ) : (
                <OpenLink href={`/reports/weekly/${r.id}`} />
              )
            }
          />
        );
      })}
    </QueueList>
  );
}

export function MonthlyReportsQueue({ rows, canApprove }: { rows: Awaited<ReturnType<typeof getMonthlyReportsQueue>>; canApprove: boolean }) {
  if (rows.length === 0) return <Calm title="لا توجد تقارير شهرية بانتظارك" description="تظهر هنا التقارير الشهرية بعد إرسالها في نهاية الشهر." />;
  return (
    <QueueList>
      {rows.map((r) => {
        const subject = `تقرير ${r.employee} الشهري — ${monthLabel(r.year, r.month)}`;
        return (
          <QueueRow
            key={r.id}
            href={`/reports/monthly/${r.id}`}
            title={subject}
            meta={
              <>
                <ProgressMeta value={r.progress} />
                {r.submittedAt && <span title={formatDateTimeAr(r.submittedAt)}>أُرسل {sinceDays(r.submittedAt)}</span>}
                {r.commented && <StatusBadge tone="info">أُرسلت ملاحظة</StatusBadge>}
              </>
            }
            actions={
              canApprove ? (
                <ReportDecisionButtons
                  subject={subject}
                  approve={reviewMonthlyReportAction.bind(null, r.id, {
                    decision: "APPROVE",
                  })}
                  comment={commentMonthlyReportAction.bind(null, r.id)}
                />
              ) : (
                <OpenLink href={`/reports/monthly/${r.id}`} />
              )
            }
          />
        );
      })}
    </QueueList>
  );
}

function OpenLink({ href, label = "فتح" }: { href: string; label?: string }) {
  return (
    <Button size="sm" variant="ghost" asChild>
      <Link href={href}>
        {label} <ArrowLeft />
      </Link>
    </Button>
  );
}

export function PlansQueue({ data, canApprove }: { data: Awaited<ReturnType<typeof getPlansQueue>>; canApprove: boolean }) {
  if (data.plans.length === 0 && data.variance.length === 0) {
    return <Calm title="لا توجد خطط بانتظارك" description="تظهر هنا خطط الموظفين الشهرية فور إرسالها للاعتماد." />;
  }
  return (
    <div className="space-y-6">
      {data.plans.length > 0 && (
        <section>
          <SectionTitle>الخطط الشهرية ({data.plans.length})</SectionTitle>
          <QueueList>
            {data.plans.map((p) => {
              const month = monthLabel(p.year, p.month);
              const weightOff = Math.abs(p.totalWeight - 100) > 0.01;
              return (
                <QueueRow
                  key={p.id}
                  href={`/monthly-plans/${p.id}`}
                  title={`خطة ${p.employee} — ${month}`}
                  meta={
                    <>
                      <span className="tabular-nums">{formatNumber(p.goals)} أهداف</span>
                      {weightOff && <StatusBadge tone="warning">مجموع الأوزان {formatNumber(p.totalWeight, 2)}%</StatusBadge>}
                      {p.submittedAt && <span title={formatDateTimeAr(p.submittedAt)}>أُرسلت {sinceDays(p.submittedAt)}</span>}
                    </>
                  }
                  actions={
                    <>
                      {canApprove && (
                        <ActionButton
                          size="sm"
                          action={approvePlanAction.bind(null, p.id)}
                          confirm={{
                            title: `اعتماد خطة ${p.employee} لشهر ${month}؟`,
                            description: "تُوزَّع الأسابيع تلقائيًا بعد الاعتماد.",
                            confirmLabel: "اعتماد",
                          }}
                          reason={{ label: "ملاحظة للموظف (اختياري)" }}
                        >
                          <CheckCircle2 /> اعتماد
                        </ActionButton>
                      )}
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/monthly-plans/${p.id}`}>
                          <Pencil /> تعديل
                        </Link>
                      </Button>
                    </>
                  }
                />
              );
            })}
          </QueueList>
        </section>
      )}

      {data.variance.length > 0 && (
        <section>
          <SectionTitle>فروق التوزيع الأسبوعي ({data.variance.length})</SectionTitle>
          <QueueList>
            {data.variance.map((v) => (
              <QueueRow
                key={v.planId}
                href={`/weekly-plans?plan=${v.planId}`}
                title={`توزيع ${v.employee} الأسبوعي — ${monthLabel(v.year, v.month)}`}
                meta={
                  <>
                    <span className="tabular-nums">الأسابيع {v.weeks.join("، ")}</span>
                    {v.note && <span className="max-w-md truncate">المبرر: {v.note}</span>}
                  </>
                }
                actions={
                  <>
                    {canApprove && (
                      <ActionButton
                        size="sm"
                        action={approveWeeklyVarianceAction.bind(null, v.planId)}
                        confirm={{
                          title: `اعتماد توزيع ${v.employee} الأسبوعي؟`,
                          confirmLabel: "اعتماد",
                        }}
                      >
                        <CheckCircle2 /> اعتماد
                      </ActionButton>
                    )}
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/weekly-plans?plan=${v.planId}`}>
                        <Pencil /> تعديل
                      </Link>
                    </Button>
                  </>
                }
              />
            ))}
          </QueueList>
        </section>
      )}
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
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium hover:underline"
                        >
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

function BatchProducts({ summary, products }: { summary: string; products: ReviewProduct[] }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-sm">{summary}</span>
        <span className="shrink-0 text-xs font-medium text-primary">مراجعة</span>
      </summary>
      <ul className="divide-y border-t bg-muted/20">
        {products.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 p-3 ps-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">{p.title}</p>
              <p className="text-xs text-muted-foreground" title={formatDateTimeAr(new Date(p.since))}>
                {sinceDays(new Date(p.since))}
              </p>
              {p.note && (
                <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="mt-0.5 size-3 shrink-0" />
                  <span className="break-words">{p.note}</span>
                </p>
              )}
            </div>
            {p.url && (
              <Button variant="outline" size="sm" asChild className="self-start sm:self-center">
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  فتح في Notion <ExternalLink />
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function BatchReviewQueue({ groups }: { groups: Awaited<ReturnType<typeof getBatchReviewQueue>> }) {
  if (groups.length === 0)
    return <EmptyState icon={CheckCircle2} title="لا توجد صور بانتظار اعتمادك" description="تُحدَّث هذه القائمة مع كل مزامنة من Notion." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NotionSyncedTag />
        <span className="text-xs text-muted-foreground">الاعتماد يتم في Notion</span>
      </div>
      <QueueList>
        {groups.flatMap((g) => [
          g.waiting.length > 0 && (
            <li key={`${g.label}-waiting`}>
              <BatchProducts summary={`${g.label} — ${formatNumber(g.waiting.length)} صور تحتاج اعتماد`} products={g.waiting} />
            </li>
          ),
          g.edited.length > 0 && (
            <li key={`${g.label}-edited`}>
              <BatchProducts summary={`${g.label} — ${formatNumber(g.edited.length)} منتجات تم تعديل صورها وتحتاج إعادة مراجعة`} products={g.edited} />
            </li>
          ),
        ])}
      </QueueList>
    </div>
  );
}
