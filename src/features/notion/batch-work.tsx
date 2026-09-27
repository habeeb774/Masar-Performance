import { ExternalLink } from "lucide-react";
import type { ProductNeedingWork } from "@/server/queries/batches";
import { formatNumber } from "@/lib/num";

const MAX = 5;

export function BatchWorkNow({ needsImprovement, readyToAdd }: { needsImprovement: ProductNeedingWork[]; readyToAdd: number }) {
  if (needsImprovement.length === 0 && readyToAdd === 0) return null;
  const shown = needsImprovement.slice(0, MAX);
  const rest = needsImprovement.length - shown.length;
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-semibold">يحتاج عملك الآن</p>
      <ul className="space-y-1 text-sm">
        {needsImprovement.length > 0 && (
          <li>
            <span className="font-semibold text-warning tabular-nums">{formatNumber(needsImprovement.length)}</span> صور تحتاج تحسين
          </li>
        )}
        {readyToAdd > 0 && (
          <li>
            <span className="font-semibold tabular-nums">{formatNumber(readyToAdd)}</span> منتجات جاهزة للإضافة للمتجر
          </li>
        )}
      </ul>
      {shown.length > 0 && (
        <ul className="space-y-2">
          {shown.map((p) => (
            <li key={p.id} className="rounded-lg bg-muted/40 p-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-medium break-words">{p.title}</span>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                    فتح في Notion <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              {p.note && <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">ملاحظة المدير: {p.note}</p>}
            </li>
          ))}
          {rest > 0 && <li className="text-xs text-muted-foreground">+{formatNumber(rest)}</li>}
        </ul>
      )}
    </div>
  );
}
