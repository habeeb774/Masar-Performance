"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { deleteGoalTemplateAction } from "@/actions/org";

/** Delete a goal template (with confirmation), optionally navigating afterwards. */
export function DeleteTemplateButton({ id, name, redirectTo, compact = false }: { id: string; name: string; redirectTo?: string; compact?: boolean }) {
  const router = useRouter();
  return (
    <ActionButton
      variant={compact ? "ghost" : "destructive"}
      size={compact ? "icon-sm" : "default"}
      className={compact ? "text-destructive" : undefined}
      aria-label="حذف القالب"
      action={deleteGoalTemplateAction.bind(null, id)}
      confirm={{ title: `حذف قالب "${name}"؟`, description: "لن تتأثر الخطط التي أُنشئت منه سابقًا.", confirmLabel: "حذف", destructive: true }}
      refresh={!redirectTo}
      onDone={() => {
        if (redirectTo) {
          router.push(redirectTo);
          router.refresh();
        }
      }}
    >
      <Trash2 />
      {!compact && "حذف"}
    </ActionButton>
  );
}
