"use client";

import { HR_RATING_BANDS } from "@/lib/kpi/rating-scale";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDownWideNarrow, Info, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { saveRatingScaleAction } from "@/actions/performance";
import { ratingScaleSchema } from "@/lib/validation";
import { resolveRating } from "@/lib/kpi/engine";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import { RATING_COLOR_LABELS, RATING_COLORS, ratingColorClasses } from "./rating-colors";

interface Band {
  label: string;
  minScore: number;
  maxScore: number;
  color: string;
}

interface BandDraft {
  uid: number;
  label: string;
  minScore: string;
  maxScore: string;
  color: string;
}

const DEFAULT_BANDS: Band[] = HR_RATING_BANDS.map((b) => ({ ...b }));

let uidSeq = 0;
const toDrafts = (bands: Band[]): BandDraft[] =>
  bands.map((b) => ({ uid: ++uidSeq, label: b.label, minScore: String(b.minScore), maxScore: String(b.maxScore), color: b.color }));

const parseNum = (v: string) => (v.trim() === "" ? NaN : Number(v));

interface Hint {
  tone: "warning" | "info";
  text: string;
}

/** Overlap / gap / coverage hints. Resolution picks the band with the highest minScore ≤ score. */
function analyze(bands: Band[]): Hint[] {
  const hints: Hint[] = [];
  if (bands.length === 0) return hints;
  const asc = [...bands].sort((a, b) => a.minScore - b.minScore);
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1];
    const cur = asc[i];
    if (cur.minScore === prev.minScore) {
      hints.push({ tone: "warning", text: `الفئتان «${prev.label}» و«${cur.label}» لهما نفس الحد الأدنى (${formatNumber(cur.minScore, 2)}) — ستُستخدم واحدة منهما فقط.` });
    } else if (cur.minScore <= prev.maxScore) {
      hints.push({
        tone: "warning",
        text: `تداخل بين «${prev.label}» (حتى ${formatNumber(prev.maxScore, 2)}) و«${cur.label}» (من ${formatNumber(cur.minScore, 2)}) — الدرجات في منطقة التداخل تُصنف «${cur.label}».`,
      });
    } else if (cur.minScore - prev.maxScore > 1) {
      hints.push({
        tone: "info",
        text: `فجوة بين ${formatNumber(prev.maxScore, 2)} و${formatNumber(cur.minScore, 2)} — الدرجات فيها تُصنف «${prev.label}».`,
      });
    }
  }
  if (asc[0].minScore > 0) {
    hints.push({ tone: "info", text: `الدرجات الأقل من ${formatNumber(asc[0].minScore, 2)} تُصنف ضمن أدنى فئة «${asc[0].label}».` });
  }
  const top = asc[asc.length - 1];
  if (Math.max(...asc.map((b) => b.maxScore)) < 100) {
    hints.push({ tone: "info", text: `أعلى حد في السلم أقل من 100 — الدرجات الأعلى تُصنف «${top.label}».` });
  }
  return hints;
}

export function RatingScaleEditor({
  scaleId,
  isActive,
  initialName,
  initialBands,
}: {
  scaleId: string | null;
  isActive: boolean;
  initialName: string;
  initialBands: Band[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [drafts, setDrafts] = useState<BandDraft[]>(() => toDrafts(initialBands.length ? initialBands : DEFAULT_BANDS));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("85");
  const { run, pending } = useServerAction(saveRatingScaleAction, { onSuccess: () => router.refresh() });

  const bands: Band[] = useMemo(
    () =>
      drafts
        .map((d) => ({ label: d.label.trim(), minScore: parseNum(d.minScore), maxScore: parseNum(d.maxScore), color: d.color }))
        .filter((b) => b.label && Number.isFinite(b.minScore) && Number.isFinite(b.maxScore)),
    [drafts],
  );
  const hints = useMemo(() => analyze(bands), [bands]);
  const previewScore = parseNum(preview);
  const resolved = Number.isFinite(previewScore) && bands.length ? resolveRating(previewScore, bands) : null;

  const update = (uid: number, patch: Partial<BandDraft>) => setDrafts((prev) => prev.map((d) => (d.uid === uid ? { ...d, ...patch } : d)));
  const remove = (uid: number) => setDrafts((prev) => prev.filter((d) => d.uid !== uid));
  const add = () => {
    const lowest = bands.length ? Math.min(...bands.map((b) => b.minScore)) : 100;
    setDrafts((prev) => [...prev, { uid: ++uidSeq, label: "", minScore: "0", maxScore: String(Math.max(0, lowest - 0.01)), color: "slate" }]);
  };
  const sortDesc = () => setDrafts((prev) => [...prev].sort((a, b) => (parseNum(b.minScore) || 0) - (parseNum(a.minScore) || 0)));

  const save = () => {
    const payload = {
      name,
      bands: drafts.map((d) => ({ label: d.label, minScore: d.minScore, maxScore: d.maxScore, color: d.color })),
    };
    const parsed = ratingScaleSchema.safeParse(payload);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[issue.path.join(".")] ??= issue.message;
      setErrors(map);
      return;
    }
    setErrors({});
    run(scaleId, parsed.data);
  };

  const err = (i: number, field: string) => errors[`bands.${i}.${field}`];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">فئات التقدير</CardTitle>
          <CardDescription>
            تُحدد الفئة بأعلى «حد أدنى» لا يتجاوز الدرجة، لذا الفجوات العشرية الصغيرة (مثل 89.99 ثم 90) لا تؤثر. التعديلات تنطبق على الحسابات الجديدة وإعادة
            الحساب فقط، ولا تغير التقييمات المعتمدة سابقًا.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isActive && (
            <p className="flex items-start gap-2 rounded-lg bg-info-soft p-3 text-xs text-info">
              <Info className="mt-0.5 size-4 shrink-0" /> لا يوجد سلم تقييم نشط حاليًا — عند الحفظ سيُنشأ سلم جديد ويُفعّل.
            </p>
          )}
          <div className="max-w-md space-y-2">
            <Label htmlFor="scale-name">اسم السلم</Label>
            <Input id="scale-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <div className="hidden grid-cols-[minmax(0,1fr)_6rem_6rem_10rem_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
              <span>الفئة</span>
              <span>من</span>
              <span>إلى</span>
              <span>اللون</span>
              <span />
            </div>
            {drafts.map((d, i) => (
              <div key={d.uid} className="grid grid-cols-2 gap-2 rounded-lg border p-2 md:grid-cols-[minmax(0,1fr)_6rem_6rem_10rem_2rem] md:border-0 md:p-0">
                <div className="col-span-2 md:col-span-1">
                  <Label className="mb-1 text-xs md:sr-only">الفئة</Label>
                  <Input value={d.label} onChange={(e) => update(d.uid, { label: e.target.value })} placeholder="مثال: ممتاز" maxLength={60} aria-invalid={!!err(i, "label")} />
                  {err(i, "label") && <p className="mt-1 text-xs text-destructive">{err(i, "label")}</p>}
                </div>
                <div>
                  <Label className="mb-1 text-xs md:sr-only">من</Label>
                  <Input type="number" step="0.01" min={0} max={100} inputMode="decimal" value={d.minScore} onChange={(e) => update(d.uid, { minScore: e.target.value })} aria-invalid={!!err(i, "minScore")} dir="ltr" />
                  {err(i, "minScore") && <p className="mt-1 text-xs text-destructive">{err(i, "minScore")}</p>}
                </div>
                <div>
                  <Label className="mb-1 text-xs md:sr-only">إلى</Label>
                  <Input type="number" step="0.01" min={0} max={100} inputMode="decimal" value={d.maxScore} onChange={(e) => update(d.uid, { maxScore: e.target.value })} aria-invalid={!!err(i, "maxScore")} dir="ltr" />
                  {err(i, "maxScore") && <p className="mt-1 text-xs text-destructive">{err(i, "maxScore")}</p>}
                </div>
                <div className="col-span-2 flex items-end gap-2 md:col-span-1 md:block">
                  <div className="flex-1">
                    <Label className="mb-1 text-xs md:sr-only">اللون</Label>
                    <Select value={d.color} onValueChange={(v) => update(d.uid, { color: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RATING_COLORS.map((c) => (
                          <SelectItem key={c} value={c}>
                            <span className={cn("size-3 rounded-full", ratingColorClasses(c).solid)} aria-hidden />
                            {RATING_COLOR_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive md:hidden" onClick={() => remove(d.uid)} disabled={drafts.length <= 1} aria-label="حذف الفئة">
                    <Trash2 />
                  </Button>
                </div>
                <Button size="icon" variant="ghost" className="hidden text-destructive hover:bg-destructive/10 hover:text-destructive md:inline-flex" onClick={() => remove(d.uid)} disabled={drafts.length <= 1} aria-label="حذف الفئة">
                  <Trash2 />
                </Button>
              </div>
            ))}
            {errors.bands && <p className="text-sm text-destructive">{errors.bands}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={add} disabled={drafts.length >= 20}>
                <Plus /> إضافة فئة
              </Button>
              <Button variant="ghost" size="sm" onClick={sortDesc}>
                <ArrowDownWideNarrow /> ترتيب تنازلي
              </Button>
            </div>
          </div>

          {hints.length > 0 && (
            <ul className="space-y-1.5">
              {hints.map((h, i) => (
                <li key={i} className={cn("flex items-start gap-2 rounded-lg p-2.5 text-xs", h.tone === "warning" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
                  {h.tone === "warning" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> : <Info className="mt-0.5 size-3.5 shrink-0" />}
                  {h.text}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <CardFooter className="flex-wrap justify-end gap-2 border-t">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setName(initialName);
              setDrafts(toDrafts(initialBands.length ? initialBands : DEFAULT_BANDS));
              setErrors({});
            }}
          >
            <RotateCcw /> تراجع
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Spinner /> : <Save />} حفظ السلم
          </Button>
        </CardFooter>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">معاينة مباشرة</CardTitle>
            <CardDescription>أدخل درجة لمعرفة الفئة التي ستظهر في التقييم</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="number" step="0.01" min={0} max={100} inputMode="decimal" value={preview} onChange={(e) => setPreview(e.target.value)} dir="ltr" aria-label="درجة للمعاينة" />
            {resolved ? (
              <div className={cn("flex items-center justify-between rounded-lg px-3 py-3 ring-1 ring-inset", ratingColorClasses(resolved.color).soft)}>
                <span className="text-base font-bold">{resolved.label}</span>
                <span className="text-sm tabular-nums">{formatNumber(previewScore, 2)}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">أدخل درجة صحيحة وفئة واحدة على الأقل.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">شكل السلم</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
              {[...bands]
                .sort((a, b) => a.minScore - b.minScore)
                .map((b, i, arr) => {
                  const end = i < arr.length - 1 ? arr[i + 1].minScore : 100;
                  const width = Math.max(0, Math.min(100, end) - Math.max(0, b.minScore));
                  return <span key={i} className={ratingColorClasses(b.color).solid} style={{ width: `${width}%` }} title={b.label} />;
                })}
            </div>
            <ul className="space-y-1.5">
              {[...bands]
                .sort((a, b) => b.minScore - a.minScore)
                .map((b, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", ratingColorClasses(b.color).soft)}>{b.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {formatNumber(b.minScore, 2)} – {formatNumber(b.maxScore, 2)}
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
