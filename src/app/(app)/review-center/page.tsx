import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import type { SearchParams } from "@/lib/params";
import { int, str } from "@/lib/params";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import {
  ensureTeamReports,
  getMonthlyReportsQueue,
  getBatchReviewQueue,
  getEvaluationsQueue,
  getNotionQueue,
  getPlansQueue,
  getReviewCenterCounts,
  getWeeklyReportsQueue,
  REVIEW_TABS,
  type ReviewTab,
} from "@/server/queries/review-center";
import { EvaluationsQueue } from "@/features/review-center/evaluations-queue";
import { BatchReviewQueue, MonthlyReportsQueue, NotionQueue, PlansQueue, WeeklyReportsQueue } from "@/features/review-center/queues";

export const metadata: Metadata = { title: "بانتظارك" };

const TAB_LABELS: Record<ReviewTab, string> = {
  evaluations: "التقييمات",
  batches: "منتجات Notion",
  weekly: "التقارير الأسبوعية",
  monthly: "التقارير الشهرية",
  plans: "الخطط",
  pending: "Notion · بانتظار الاعتماد",
  images: "اعتماد الصور",
  content: "اعتماد المحتوى",
  revision: "تحتاج تحسين",
};

const NOTION_EMPTY: Record<"pending" | "images" | "content" | "revision", string> = {
  pending: "لا توجد عناصر بانتظار الاعتماد",
  images: "لا توجد صور بانتظار الاعتماد",
  content: "لا يوجد محتوى بانتظار الاعتماد",
  revision: "لا توجد عناصر تحتاج تحسين",
};

export default async function ReviewCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.REVIEW_CENTER);
  const sp = await searchParams;
  const raw = str(sp.tab);
  const page = int(sp.page, 1, 1, 10_000);
  const canApproveReports = hasPermission(user, PERMISSIONS.REPORTS_REVIEW);
  const canApprovePlans = hasPermission(user, PERMISSIONS.PLANS_APPROVE);

  after(() => ensureTeamReports(user).catch((e) => console.error("[review-center] auto report generation failed", e)));

  const counts = await getReviewCenterCounts(user);
  // open on the first section that actually needs a decision
  const tab: ReviewTab = raw && (REVIEW_TABS as readonly string[]).includes(raw) ? (raw as ReviewTab) : (REVIEW_TABS.find((t) => counts[t] > 0) ?? "evaluations");
  let body: React.ReactNode;
  if (tab === "evaluations") body = <EvaluationsQueue rows={await getEvaluationsQueue(user)} canApprove={hasPermission(user, PERMISSIONS.PERFORMANCE_APPROVE)} />;
  else if (tab === "batches") body = <BatchReviewQueue groups={await getBatchReviewQueue(user)} />;
  else if (tab === "weekly") body = <WeeklyReportsQueue rows={await getWeeklyReportsQueue(user)} canApprove={canApproveReports} />;
  else if (tab === "monthly") body = <MonthlyReportsQueue rows={await getMonthlyReportsQueue(user)} canApprove={canApproveReports} />;
  else if (tab === "plans") body = <PlansQueue data={await getPlansQueue(user)} canApprove={canApprovePlans} />;
  else body = <NotionQueue data={await getNotionQueue(user, tab, page)} emptyTitle={NOTION_EMPTY[tab]} />;

  return (
    <>
      <PageHeader title="بانتظارك" description="كل ما يحتاج موافقتك أو ملاحظتك في مكان واحد." />
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1" aria-label="أقسام المراجعة">
        {REVIEW_TABS.map((t) => (
          <Fragment key={t}>
            {(t === "batches") && <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-border" />}
            <Link
              href={`/review-center?tab=${t}`}
              aria-current={t === tab ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                t === tab && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {TAB_LABELS[t]}
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[11px] tabular-nums",
                  t === tab ? "bg-primary-foreground/20" : counts[t] > 0 ? "bg-pending-soft text-pending" : "bg-muted",
                )}
              >
                {counts[t]}
              </span>
            </Link>
          </Fragment>
        ))}
      </nav>
      <Card>
        <CardContent>{body}</CardContent>
      </Card>
    </>
  );
}
