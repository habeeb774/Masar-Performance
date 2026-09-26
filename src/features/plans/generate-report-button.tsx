"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { generateWeeklyReportAction } from "@/actions/reports";

/** Generate (or regenerate) the weekly report, then open it. */
export function GenerateReportButton({ weeklyPlanId, exists }: { weeklyPlanId: string; exists: boolean }) {
  const router = useRouter();
  return (
    <ActionButton<{ id: string }>
      variant={exists ? "outline" : "default"}
      action={generateWeeklyReportAction.bind(null, weeklyPlanId)}
      refresh={false}
      confirm={exists ? { title: "إعادة توليد التقرير الأسبوعي؟", description: "تُحدّث أرقام التقرير من بيانات الأسبوع الحالية." } : undefined}
      onDone={(d) => {
        if (d?.id) router.push(`/reports/weekly/${d.id}`);
        else router.refresh();
      }}
    >
      <FileText /> {exists ? "تحديث التقرير الأسبوعي" : "توليد التقرير الأسبوعي"}
    </ActionButton>
  );
}
