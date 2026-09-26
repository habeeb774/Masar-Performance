import type { Metadata } from "next";
import Link from "next/link";
import { LayoutTemplate, Pencil, Plus } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber, num } from "@/lib/num";
import { GOAL_TYPE_LABELS, type GoalTypeKey } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeleteTemplateButton } from "@/features/goals/delete-template-button";

export const metadata: Metadata = { title: "قوالب الأهداف" };

export default async function GoalTemplatesPage() {
  await requirePermission(PERMISSIONS.GOAL_TEMPLATES_MANAGE);
  const [templates, jobTitles] = await Promise.all([
    db.goalTemplate.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: {
        items: { orderBy: { sortOrder: "asc" }, select: { name: true, weight: true, source: true, goalType: true } },
        _count: { select: { plans: true } },
      },
    }),
    db.jobTitle.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
  ]);

  const groups = [
    ...jobTitles.map((j) => ({ key: j.id, title: j.name, jobTitleId: j.id, templates: templates.filter((t) => t.jobTitleId === j.id) })),
    { key: "general", title: "قوالب عامة (بدون مسمى وظيفي)", jobTitleId: null as string | null, templates: templates.filter((t) => !t.jobTitleId) },
  ].filter((g) => g.templates.length > 0 || (g.jobTitleId && jobTitles.find((j) => j.id === g.jobTitleId)?.isActive));

  return (
    <>
      <PageHeader
        title="قوالب الأهداف"
        description="أهداف شهرية جاهزة لكل مسمى وظيفي تُنسخ تلقائيًا عند إنشاء خطة الموظف."
        actions={
          <Button asChild>
            <Link href="/goals/new">
              <Plus /> قالب جديد
            </Link>
          </Button>
        }
      />
      {templates.length === 0 && jobTitles.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="لا توجد قوالب بعد" description="أنشئ قالبًا لكل مسمى وظيفي لتسريع إعداد الخطط الشهرية." action={<Button asChild size="sm"><Link href="/goals/new">إنشاء قالب</Link></Button>} />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key}>
              <SectionTitle
                action={
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={group.jobTitleId ? `/goals/new?jobTitle=${group.jobTitleId}` : "/goals/new"}>
                      <Plus /> قالب لهذا المسمى
                    </Link>
                  </Button>
                }
              >
                {group.title}
              </SectionTitle>
              {group.templates.length === 0 ? (
                <EmptyState icon={LayoutTemplate} title="لا يوجد قالب لهذا المسمى" description="بدون قالب ستُنشأ الخطط فارغة وتُضاف الأهداف يدويًا." className="py-6" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.templates.map((t) => {
                    const total = Math.round(t.items.reduce((a, i) => a + num(i.weight), 0) * 100) / 100;
                    const notionCount = t.items.filter((i) => i.source === "NOTION").length;
                    return (
                      <Card key={t.id} className="gap-3">
                        <CardHeader className="gap-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base leading-snug">
                              <Link href={`/goals/${t.id}`} className="hover:underline">
                                {t.name}
                              </Link>
                            </CardTitle>
                            <StatusBadge tone={t.isActive ? "success" : "neutral"}>{t.isActive ? "نشط" : "غير نشط"}</StatusBadge>
                          </div>
                          {t.description && <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex flex-wrap gap-1.5">
                            <StatusBadge tone="info" dot={false}>
                              {formatNumber(t.items.length)} بند
                            </StatusBadge>
                            <StatusBadge tone={Math.abs(total - 100) < 0.01 ? "success" : "warning"} dot={false}>
                              الأوزان {formatNumber(total, 2)}%
                            </StatusBadge>
                            {notionCount > 0 && (
                              <StatusBadge tone="neutral" dot={false}>
                                {formatNumber(notionCount)} من Notion
                              </StatusBadge>
                            )}
                            <StatusBadge tone="neutral" dot={false}>
                              استُخدم في {formatNumber(t._count.plans)} خطة
                            </StatusBadge>
                          </div>
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {t.items.slice(0, 4).map((i, idx) => (
                              <li key={idx} className="flex items-center justify-between gap-2">
                                <span className="truncate">{i.name}</span>
                                <span className="shrink-0 tabular-nums">
                                  {GOAL_TYPE_LABELS[i.goalType as GoalTypeKey]} · {formatNumber(num(i.weight), 2)}%
                                </span>
                              </li>
                            ))}
                            {t.items.length > 4 && <li>و{formatNumber(t.items.length - 4)} بنود أخرى…</li>}
                          </ul>
                        </CardContent>
                        <CardFooter className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                          <span className="text-[11px] text-muted-foreground">آخر تحديث {formatDateTimeAr(t.updatedAt)}</span>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/goals/${t.id}`}>
                                <Pencil /> تعديل
                              </Link>
                            </Button>
                            <DeleteTemplateButton id={t.id} name={t.name} compact />
                          </div>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
