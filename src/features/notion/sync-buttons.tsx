"use client";

import { RefreshCw, RotateCcw, Repeat } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { retrySyncAction, syncNowAction } from "@/actions/notion";

type Size = "sm" | "default" | "xs";

/** "مزامنة الآن" — incremental sync from the stored cursor. */
export function SyncNowButton({ dataSourceId, size = "sm", disabled }: { dataSourceId: string; size?: Size; disabled?: boolean }) {
  return (
    <ActionButton size={size} variant="outline" disabled={disabled} action={() => syncNowAction(dataSourceId)} successMessage="تمت المزامنة">
      <RefreshCw /> مزامنة الآن
    </ActionButton>
  );
}

/** "مزامنة كاملة" — ignores the cursor and re-reads every page (confirm first). */
export function FullSyncButton({ dataSourceId, size = "sm", disabled, label = "مزامنة كاملة" }: { dataSourceId: string; size?: Size; disabled?: boolean; label?: string }) {
  return (
    <ActionButton
      size={size}
      variant="ghost"
      disabled={disabled}
      action={() => syncNowAction(dataSourceId, true)}
      confirm={{
        title: "تشغيل مزامنة كاملة؟",
        description: "سيتم تجاهل مؤشر آخر مزامنة وإعادة قراءة جميع صفحات القاعدة من Notion. قد تستغرق العملية عدة دقائق للقواعد الكبيرة، وتُستكمل تلقائيًا في الجولات التالية إذا تجاوزت الوقت المسموح.",
        confirmLabel: "بدء المزامنة الكاملة",
      }}
    >
      <Repeat /> {label}
    </ActionButton>
  );
}

export function RetrySyncButton({ logId, size = "xs" }: { logId: string; size?: Size }) {
  return (
    <ActionButton size={size} variant="outline" action={() => retrySyncAction(logId)} successMessage="تمت إعادة المحاولة">
      <RotateCcw /> إعادة المحاولة
    </ActionButton>
  );
}
