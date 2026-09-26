import { ArrowLeft, Bot, Gauge, ShieldCheck, Sparkles, UserPen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/shared/progress-bar";
import { EmptyState } from "@/components/shared/page";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { cn } from "@/lib/utils";
import { AUDIT_ACTION_LABELS } from "@/server/audit";
import { RatingBadge, ratingTone, scoreTextClass } from "./rating-badge";

/** Auto score → manager adjustment → final score, with productivity vs quality. */
export function ReviewScoreSummary({
  autoScore,
  adjustment,
  adjustmentReason,
  finalScore,
  productivityScore,
  qualityScore,
  ratingLabel,
  ratingColor,
}: {
  autoScore: number;
  adjustment: number;
  adjustmentReason: string | null;
  finalScore: number;
  productivityScore: number | null;
  qualityScore: number | null;
  ratingLabel: string | null;
  ratingColor: string | null;
}) {
  const tone = ratingTone(ratingColor);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div className="rounded-xl border bg-muted/30 p-4 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Bot className="size-3.5" /> النتيجة الآلية
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{formatNumber(autoScore, 2)}</p>
            <p className="text-[11px] text-muted-foreground">من مؤشرات الأداء</p>
          </div>
          <ArrowLeft className="mx-auto hidden size-5 text-muted-foreground sm:block" />
          <div className="rounded-xl border bg-muted/30 p-4 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
              <UserPen className="size-3.5" /> تعديل المدير
            </p>
            <p className={cn("mt-1 text-3xl font-bold tabular-nums", adjustment > 0 ? "text-success" : adjustment < 0 ? "text-danger" : "")} dir="ltr">
              {adjustment > 0 ? "+" : ""}
              {formatNumber(adjustment, 2)}
            </p>
            <p className="line-clamp-2 text-[11px] text-muted-foreground" title={adjustmentReason ?? undefined}>
              {adjustmentReason ?? "بدون تعديل"}
            </p>
          </div>
          <ArrowLeft className="mx-auto hidden size-5 text-muted-foreground sm:block" />
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" /> النتيجة النهائية
            </p>
            <p className={cn("mt-1 text-4xl font-extrabold tabular-nums", scoreTextClass[tone])}>{formatNumber(finalScore, 2)}</p>
            <div className="mt-1">
              <RatingBadge label={ratingLabel} color={ratingColor} />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Gauge className="size-4 text-muted-foreground" /> الإنتاجية مقابل الجودة
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">الإنتاجية</span>
              <span className="font-medium tabular-nums">{formatPct(productivityScore, 1)}</span>
            </div>
            <ProgressBar value={productivityScore ?? 0} />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">الجودة</span>
              <span className="font-medium tabular-nums">{formatPct(qualityScore, 1)}</span>
            </div>
            <ProgressBar value={qualityScore ?? 0} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  autoScore: "النتيجة الآلية",
  final: "النتيجة النهائية",
  finalScore: "النتيجة النهائية",
  managerAdjustment: "التعديل اليدوي",
  score: "الدرجة",
  rate: "نسبة التحقق",
  rating: "التقدير",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "آلي";
  if (typeof v === "number") return formatNumber(v, 2);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  return JSON.stringify(v);
}

function Changes({ before, after }: { before: unknown; after: unknown }) {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (keys.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5">
      {keys.map((k) => (
        <li key={k} className="tabular-nums">
          <span className="text-muted-foreground">{FIELD_LABELS[k] ?? k}: </span>
          {k in b && (
            <>
              <span className="line-through decoration-muted-foreground/60">{fmt(b[k])}</span> <span className="text-muted-foreground">←</span>{" "}
            </>
          )}
          <span className="font-medium">{k in a ? fmt(a[k]) : "—"}</span>
        </li>
      ))}
    </ul>
  );
}

export interface AuditEntry {
  id: string;
  action: string;
  target: string | null;
  user: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: Date;
}

export function ReviewAuditTrail({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <EmptyState icon={ShieldCheck} title="لا توجد عمليات مسجلة بعد" className="py-6" />;
  return (
    <ol className="relative space-y-4 border-s ps-5">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -start-[25px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" aria-hidden />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-medium">{AUDIT_ACTION_LABELS[e.action] ?? e.action}</span>
            {e.target && <span className="text-muted-foreground">— {e.target}</span>}
            <span className="text-xs text-muted-foreground">
              بواسطة {e.user} · {formatDateTimeAr(e.createdAt)}
            </span>
          </div>
          <div className="mt-1 text-xs">
            <Changes before={e.before} after={e.after} />
          </div>
          {e.reason && <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs">السبب: {e.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
