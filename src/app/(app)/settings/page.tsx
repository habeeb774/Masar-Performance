import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import { SETTINGS_ANY_OF, visibleSettingsSections, type SettingsIcon } from "@/features/settings/settings-sections";
import { SETTINGS_ICONS } from "@/features/settings/settings-icons";
import { formatNumber } from "@/lib/num";

export const metadata: Metadata = { title: "الإعدادات" };

export default async function SettingsPage() {
  const user = await requirePermission(...SETTINGS_ANY_OF);
  const sections = visibleSettingsSections(user);

  const [company, departments, sections_, jobTitles, activeJobTitles, roles, permissions, kpiTemplates, activeKpis, scale, users, activeUsers] = await Promise.all([
    db.company.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true, timezone: true } }),
    db.department.count({ where: { type: "ADMINISTRATION" } }),
    db.department.count({ where: { type: "SECTION" } }),
    db.jobTitle.count(),
    db.jobTitle.count({ where: { isActive: true } }),
    db.role.count(),
    db.permission.count(),
    db.kpiTemplate.count(),
    db.kpiTemplate.count({ where: { isActive: true } }),
    db.performanceRatingScale.findFirst({ where: { isActive: true }, select: { name: true, _count: { select: { bands: true } } } }),
    db.user.count(),
    db.user.count({ where: { status: "ACTIVE" } }),
  ]);

  const stats: Record<SettingsIcon, string> = {
    overview: "",
    company: company ? `${company.name} — ${company.timezone}` : "لم تُضبط بعد",
    departments: `${formatNumber(departments)} إدارة · ${formatNumber(sections_)} قسم`,
    jobTitles: `${formatNumber(jobTitles)} مسمى (${formatNumber(activeJobTitles)} نشط)`,
    roles: `${formatNumber(roles)} دور`,
    permissions: `${formatNumber(permissions)} صلاحية × ${formatNumber(roles)} دور`,
    kpis: `${formatNumber(kpiTemplates)} مؤشر (${formatNumber(activeKpis)} نشط)`,
    ratingScale: scale ? `${scale.name} — ${formatNumber(scale._count.bands)} فئات` : "لا يوجد سلم نشط",
    users: `${formatNumber(users)} مستخدم (${formatNumber(activeUsers)} نشط)`,
  };

  return (
    <>
      <PageHeader title="الإعدادات" description="إعدادات الشركة والهيكل التنظيمي والصلاحيات وسلم التقييم" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => {
          const Icon = SETTINGS_ICONS[s.icon];
          return (
            <Link key={s.href} href={s.href} className="group block h-full">
              <Card className="h-full gap-0 py-4 transition-colors group-hover:border-primary/40 group-hover:bg-accent/30">
                <CardContent className="flex h-full flex-col gap-3 px-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25 ring-inset">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                    </div>
                    <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
                  </div>
                  <p className="mt-auto rounded-md bg-muted/60 px-2.5 py-1.5 text-xs font-medium tabular-nums">{stats[s.icon]}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
