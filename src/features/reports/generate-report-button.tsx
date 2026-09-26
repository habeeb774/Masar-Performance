"use client";

import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { generateMonthlyReportAction, generateWeeklyReportAction } from "@/actions/reports";

const generate = (kind: "weekly" | "monthly", id: string) => (kind === "weekly" ? generateWeeklyReportAction(id) : generateMonthlyReportAction(id));

/** Generate (or refresh) a report draft, then open it. */
export function GenerateReportButton({
  kind,
  sourceId,
  label,
  size = "default",
  variant = "default",
}: {
  kind: "weekly" | "monthly";
  /** weeklyPlanId or monthlyPlanId */
  sourceId: string;
  label: string;
  size?: "default" | "sm";
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const { run, pending } = useServerAction((id: string) => generate(kind, id), {
    onSuccess: (data) => {
      if (data?.id) router.push(`/reports/${kind}/${data.id}`);
    },
  });
  return (
    <Button size={size} variant={variant} disabled={pending} onClick={() => run(sourceId)}>
      {pending ? <Spinner /> : <FilePlus2 />} {label}
    </Button>
  );
}
