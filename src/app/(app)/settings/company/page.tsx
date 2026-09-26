import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page";
import { CompanyForm } from "@/features/settings/company-form";

export const metadata: Metadata = { title: "بيانات الشركة" };

export default async function CompanySettingsPage() {
  await requirePermission(PERMISSIONS.ORG_MANAGE);
  const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader title="بيانات الشركة" description="تُستخدم هذه الإعدادات في تقسيم الأسابيع، أيام العمل، ومواعيد تسليم الخطط والتقارير" />
      <CompanyForm
        initial={{
          name: company?.name ?? "",
          legalName: company?.legalName ?? "",
          timezone: company?.timezone ?? "Asia/Riyadh",
          weekStartDay: company?.weekStartDay ?? 6,
          workDays: company?.workDays ?? [6, 0, 1, 2, 3],
          planSubmissionDeadlineDay: company?.planSubmissionDeadlineDay ?? 3,
          weeklyReportDueDays: company?.weeklyReportDueDays ?? 1,
        }}
      />
    </>
  );
}
