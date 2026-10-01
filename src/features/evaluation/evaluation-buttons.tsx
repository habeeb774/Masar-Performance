"use client";

import { useRouter } from "next/navigation";
import { ClipboardPlus, LockOpen } from "lucide-react";
import { createEvaluationAction, reopenEvaluationAction } from "@/actions/evaluation";
import { useServerAction } from "@/hooks/use-server-action";
import { Button } from "@/components/ui/button";

export function CreateEvaluationButton({ employeeId, year, month }: { employeeId: string; year: number; month: number }) {
  const router = useRouter();
  const create = useServerAction(createEvaluationAction, { onSuccess: (d) => d && router.push(`/performance/evaluations/${d.id}`) });
  return (
    <Button size="sm" disabled={create.pending} onClick={() => create.run(employeeId, year, month)}>
      <ClipboardPlus /> إنشاء التقييم
    </Button>
  );
}

export function ReopenEvaluationButton({ evaluationId }: { evaluationId: string }) {
  const router = useRouter();
  const reopen = useServerAction(reopenEvaluationAction, { onSuccess: () => router.refresh() });
  return (
    <Button
      variant="outline"
      disabled={reopen.pending}
      onClick={() => {
        const why = prompt("سبب إعادة فتح التقييم المعتمد:");
        if (why?.trim()) reopen.run(evaluationId, why);
      }}
    >
      <LockOpen /> إعادة فتح للتعديل
    </Button>
  );
}
