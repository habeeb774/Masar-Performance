"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerAction } from "@/hooks/use-server-action";
import { addCommentAction, deleteCommentAction, listCommentsAction } from "@/actions/comments";
import { formatDateTimeAr } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type CommentEntity =
  | "MONTHLY_PLAN"
  | "MONTHLY_GOAL"
  | "DAILY_TASK"
  | "AD_HOC_TASK"
  | "WEEKLY_REPORT"
  | "MONTHLY_REPORT"
  | "PERFORMANCE_REVIEW";

export interface CommentItem {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("");
}

/**
 * Discussion thread on an entity. Pass `initial` from the server; when it is
 * omitted (lazy sheets) the list is fetched through a server action.
 */
export function CommentsThread({
  entityType,
  entityId,
  initial,
  currentUserId,
  className,
}: {
  entityType: CommentEntity;
  entityId: string;
  initial?: CommentItem[];
  currentUserId: string;
  className?: string;
}) {
  const [items, setItems] = useState<CommentItem[] | null>(initial ?? null);
  const [body, setBody] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const add = useServerAction(addCommentAction, {
    silent: true,
    onSuccess: (c) => {
      if (c) setItems((prev) => [...(prev ?? []), c]);
      setBody("");
    },
  });
  const del = useServerAction(deleteCommentAction);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    listCommentsAction(entityType, entityId)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setItems(r.data ?? []);
        else setLoadError(r.error);
      })
      .catch(() => !cancelled && setLoadError("تعذر تحميل التعليقات"));
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, initial]);

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    void add.run(entityType, entityId, text);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquare className="size-4 text-muted-foreground" />
        التعليقات {items && items.length > 0 && <span className="text-xs font-normal text-muted-foreground">({items.length})</span>}
      </p>

      {loadError ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">{loadError}</p>
      ) : items === null ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-2/3" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">لا توجد تعليقات بعد. ابدأ النقاش.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(c.authorName)}</span>
              <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{c.authorName}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground">{formatDateTimeAr(new Date(c.createdAt))}</span>
                    {c.authorId === currentUserId && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="no-print text-muted-foreground hover:text-danger"
                        aria-label="حذف التعليق"
                        disabled={del.pending}
                        onClick={() => del.run(c.id).then((r) => r.ok && setItems((prev) => (prev ?? []).filter((x) => x.id !== c.id)))}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap break-words" dir="auto">
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="no-print space-y-2">
        <Textarea
          rows={2}
          value={body}
          maxLength={2000}
          placeholder="اكتب تعليقًا…"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{body.length}/2000 — Ctrl+Enter للإرسال</span>
          <Button size="sm" onClick={submit} disabled={add.pending || !body.trim()}>
            {add.pending ? <Spinner /> : <Send />} إرسال
          </Button>
        </div>
      </div>
    </div>
  );
}
