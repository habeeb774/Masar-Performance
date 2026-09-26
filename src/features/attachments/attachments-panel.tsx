"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, FileImage, FileArchive, FileSpreadsheet, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatNumber } from "@/lib/num";
import { formatDateTimeAr } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type AttachmentEntity = "DAILY_TASK" | "AD_HOC_TASK" | "WEEKLY_REPORT" | "MONTHLY_REPORT" | "MONTHLY_GOAL";

export interface AttachmentItem {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  uploaderName: string;
  createdAt: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf,text/plain,text/csv,application/zip";

export function formatBytes(n: number) {
  if (n < 1024) return `${formatNumber(n)} بايت`;
  if (n < 1024 * 1024) return `${formatNumber(n / 1024, 1)} ك.ب`;
  return `${formatNumber(n / (1024 * 1024), 1)} م.ب`;
}

function FileIcon({ mime }: { mime: string }) {
  const cls = "size-4 shrink-0 text-muted-foreground";
  if (mime.startsWith("image/")) return <FileImage className={cls} />;
  if (mime.includes("zip")) return <FileArchive className={cls} />;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return <FileSpreadsheet className={cls} />;
  return <FileText className={cls} />;
}

/**
 * Files attached to a task / report / goal. When `initial` is omitted the list
 * is fetched from `/api/attachments` (used inside lazily opened sheets).
 */
export function AttachmentsPanel({
  entityType,
  entityId,
  initial,
  currentUserId,
  canManage = false,
  canUpload = true,
  className,
}: {
  entityType: AttachmentEntity;
  entityId: string;
  initial?: AttachmentItem[];
  currentUserId: string;
  /** TASKS_ASSIGN holders may delete any file */
  canManage?: boolean;
  canUpload?: boolean;
  className?: string;
}) {
  const [items, setItems] = useState<AttachmentItem[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<AttachmentItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/attachments?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`, { cache: "no-store" });
      const body = (await res.json()) as { items?: AttachmentItem[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "تعذر تحميل المرفقات");
      setError(null);
      setItems(body.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المرفقات");
    }
  }, [entityType, entityId]);

  useEffect(() => {
    // fetching from the attachments API is a real external sync; state is only set after the await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initial) void load();
  }, [initial, load]);

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("حجم الملف يتجاوز 5 ميجابايت");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("entityType", entityType);
      fd.set("entityId", entityId);
      fd.set("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { item?: AttachmentItem; error?: string };
      if (!res.ok || !body.item) throw new Error(body.error ?? "تعذر رفع الملف");
      setItems((prev) => [body.item!, ...(prev ?? [])]);
      toast.success("تم رفع الملف");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الملف");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      const res = await fetch(`/api/attachments/${deleting.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "تعذر حذف الملف");
      setItems((prev) => (prev ?? []).filter((i) => i.id !== deleting.id));
      toast.success("تم حذف الملف");
      setDeleting(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حذف الملف");
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Paperclip className="size-4 text-muted-foreground" />
          المرفقات {items && items.length > 0 && <span className="text-xs font-normal text-muted-foreground">({items.length})</span>}
        </p>
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button size="sm" variant="outline" className="no-print" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Spinner /> : <Upload />} رفع ملف
            </Button>
          </>
        )}
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
          <span>{error}</span>
          <Button size="xs" variant="outline" onClick={() => void load()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : items === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          لا توجد مرفقات. الحد الأقصى للملف 5 ميجابايت (صور، PDF، مستندات Office، نصوص، CSV، ZIP).
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2">
              <FileIcon mime={f.mimeType} />
              <div className="min-w-0 flex-1">
                <a href={`/api/attachments/${f.id}`} className="block truncate text-sm font-medium hover:underline" dir="auto">
                  {f.fileName}
                </a>
                <p className="truncate text-[11px] text-muted-foreground">
                  {formatBytes(f.size)} · {f.uploaderName} · {formatDateTimeAr(new Date(f.createdAt))}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" asChild aria-label="تنزيل" className="no-print">
                <a href={`/api/attachments/${f.id}`}>
                  <Download />
                </a>
              </Button>
              {(f.uploadedById === currentUserId || canManage) && (
                <Button size="icon-sm" variant="ghost" className="no-print text-danger hover:bg-danger-soft hover:text-danger" aria-label="حذف" onClick={() => setDeleting(f)}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المرفق؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف الملف &quot;{deleting?.fileName}&quot; نهائيًا.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyDelete}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              {busyDelete && <Spinner />} حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
