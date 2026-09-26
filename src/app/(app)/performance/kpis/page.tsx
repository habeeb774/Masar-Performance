import type { Metadata } from "next";
import { Eye } from "lucide-react";
import { PageHeader } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/session";
import { getKpiConfig } from "@/server/queries/performance";
import { KpiAssignmentsSection, KpiTemplatesSection } from "@/features/performance/kpi-config";

export const metadata: Metadata = { title: "مؤشرات الأداء" };

export default async function KpisPage() {
  const user = await requirePermission(PERMISSIONS.KPI_MANAGE, PERMISSIONS.PERFORMANCE_REVIEW);
  const canManage = hasPermission(user, PERMISSIONS.KPI_MANAGE);
  const config = await getKpiConfig();

  return (
    <div className="space-y-6">
      <PageHeader
        title="مؤشرات الأداء (KPI)"
        description="المؤشرات التي يُحسب بها التقييم الشهري آليًا وأوزانها لكل وظيفة"
        actions={
          !canManage && (
            <StatusBadge tone="neutral">
              <Eye className="size-3" /> عرض فقط
            </StatusBadge>
          )
        }
      />
      <KpiTemplatesSection templates={config.templates} stageKeys={config.stageKeys} canManage={canManage} />
      <KpiAssignmentsSection assignments={config.assignments} templates={config.templates} jobTitles={config.jobTitles} canManage={canManage} />
    </div>
  );
}
