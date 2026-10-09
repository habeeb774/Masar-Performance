"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";
import { applyQuickUpdateAction, interpretQuickUpdateAction, type QuickUpdatePreview } from "@/actions/quick-update";
import { useServerAction } from "@/hooks/use-server-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/num";

/**
 * «ماذا أنجزت؟» — the employee says it in their own words; the system finds the task,
 * shows what it understood, and records it in one tap.
 */
export function QuickUpdate() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<QuickUpdatePreview | null>(null);
  // shown at once, so the employee never wonders whether it was saved while the page refreshes
  const [saved, setSaved] = useState<string | null>(null);
  const understand = useServerAction(interpretQuickUpdateAction, { silent: true, onSuccess: (p) => p && setPreview(p) });
  const apply = useServerAction(applyQuickUpdateAction, {
    silent: true,
    onSuccess: () => {
      setText("");
      setPreview(null);
      router.refresh();
    },
  });
  const save = (taskId: string, kind = preview?.kind ?? "add") => {
    const option = preview?.options.find((o) => o.taskId === taskId);
    const title = option?.title ?? preview?.openTitles.find((t) => t.taskId === taskId)?.title ?? "";
    apply.run(taskId, kind, preview?.amount ?? null).then((r) => {
      if (!r.ok) return;
      setSaved(
        option && option.target > 0
          ? `سُجّل: ${title} — ${formatNumber(option.to)} من ${formatNumber(option.target)}${option.to >= option.target ? " · اكتملت" : ""}`
          : `سُجّل: ${title}`,
      );
    });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 2) understand.run(text);
        }}
      >
        <Input value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setSaved(null); }} placeholder="ماذا أنجزت؟ مثال: أضفت 5 منتجات جديدة" aria-label="ماذا أنجزت؟" className="h-11 text-base" />
        <Button type="submit" size="lg" disabled={understand.pending || text.trim().length < 2}>
          <Sparkles /> سجّل
        </Button>
      </form>

      {saved && !preview && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" /> {saved}
        </p>
      )}

      {preview && preview.options.length > 0 && (
        <ul className="space-y-2">
          {preview.options.map((o, i) => (
            <li key={o.taskId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
              <p className="min-w-0 text-sm">
                {preview.kind === "complete" ? "إكمال" : preview.kind === "set" ? "تعديل المجموع في" : `إضافة ${formatNumber(preview.amount ?? 0)} إلى`} <span className="font-semibold">{o.title}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {o.target > 0 ? `${formatNumber(o.from)} ← ${formatNumber(o.to)} من ${formatNumber(o.target)} ${o.unit}` : "تُسجل مكتملة"}
                  {o.target > 0 && o.to >= o.target && " · تكتمل المهمة"}
                </span>
              </p>
              <Button size="sm" variant={i === 0 ? "default" : "outline"} disabled={apply.pending} onClick={() => save(o.taskId)}>
                <CheckCircle2 /> {preview.options.length > 1 ? "هذه" : "تأكيد"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {preview && preview.options.length === 0 && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">لم أعرف أي مهمة تقصد — اختر منها:</p>
          <div className="flex flex-wrap gap-2">
            {preview.openTitles.map((t) => (
              <Button key={t.taskId} size="sm" variant="outline" disabled={apply.pending || (preview.amount === null && preview.kind !== "complete")} onClick={() => save(t.taskId)}>
                {t.title}
              </Button>
            ))}
          </div>
          {preview.amount === null && preview.kind !== "complete" && <p className="text-xs text-muted-foreground">اكتب العدد أيضًا، مثل: «أضفت 3».</p>}
        </div>
      )}
    </div>
  );
}
