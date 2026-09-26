"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, CheckCircle2, Plus, Save, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { saveKpiTemplateAction } from "@/actions/performance";
import { kpiTemplateSchema } from "@/lib/validation";
import { evaluateKpi, KPI_FORMULA_VARIABLES, thresholdScore, type KpiMethod, type ThresholdRule } from "@/lib/kpi/engine";
import { validateFormula } from "@/lib/kpi/formula";
import { KPI_CATEGORIES, KPI_CATEGORY_LABELS, KPI_METHOD_LABELS, KPI_SOURCE_LABELS, type KpiCategoryKey } from "@/lib/labels";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import type { KpiTemplateRow } from "@/server/queries/performance";

type SourceKey = keyof typeof KPI_SOURCE_LABELS;
const METHODS = Object.keys(KPI_METHOD_LABELS) as KpiMethod[];
const SOURCES = Object.keys(KPI_SOURCE_LABELS) as SourceKey[];
const NONE = "__none";

const VARIABLE_HINTS: Record<string, string> = {
  achieved: "القيمة المحققة",
  target: "المستهدف",
  maxScore: "الدرجة القصوى",
  worked: "ما تم العمل عليه (Notion)",
  completed: "المكتمل (Notion)",
  needsRevision: "يحتاج تحسين (Notion)",
  pendingApproval: "بانتظار الاعتماد (Notion)",
  reworkCount: "مرات إعادة العمل",
  daysLate: "أيام التأخير",
  count: "العدد المنجز",
  total: "الإجمالي",
};

interface RuleRow {
  min: string;
  max: string;
  score: string;
  label: string;
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}

export function KpiTemplateDialog({
  open,
  onOpenChange,
  template,
  stageKeys,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: KpiTemplateRow | null;
  stageKeys: { key: string; label: string }[];
}) {
  const router = useRouter();
  const init = () => {
    const mc = (template?.methodConfig ?? {}) as { cap?: number; rules?: ThresholdRule[]; formula?: string; output?: "rate" | "score"; penaltyPerUnit?: number };
    const sc = (template?.sourceConfig ?? {}) as { category?: string | null; stageKey?: string | null; onTimeOnly?: boolean };
    return {
      code: template?.code ?? "",
      name: template?.name ?? "",
      description: template?.description ?? "",
      category: (template?.category ?? "PRODUCTIVITY") as KpiCategoryKey,
      unit: template?.unit ?? "%",
      defaultTarget: str(template?.defaultTarget ?? 100),
      defaultWeight: str(template?.defaultWeight ?? 0),
      method: (template?.calculationMethod ?? "RATIO") as KpiMethod,
      maxScore: str(template?.maxScore ?? 100),
      source: (template?.sourceType ?? "GOALS") as SourceKey,
      isAutomatic: template?.isAutomatic ?? true,
      isActive: template?.isActive ?? true,
      cap: str(mc.cap),
      penalty: str(mc.penaltyPerUnit),
      formula: mc.formula ?? "",
      output: mc.output ?? "rate",
      rules: (mc.rules ?? []).map((r) => ({ min: str(r.min), max: str(r.max), score: str(r.score), label: r.label ?? "" })) as RuleRow[],
      srcCategory: sc.category ?? "",
      stageKey: sc.stageKey ?? "",
      onTimeOnly: !!sc.onTimeOnly,
    };
  };
  const [v, setV] = useState(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof ReturnType<typeof init>>(k: K, val: ReturnType<typeof init>[K]) => setV((s) => ({ ...s, [k]: val }));

  // reload the form whenever the dialog opens for a (possibly different) template — adjusted during render
  const openKey = open ? (template?.id ?? "new") : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(openKey);
  if (openKey !== loadedKey) {
    setLoadedKey(openKey);
    if (openKey !== null) {
      setV(init());
      setErrors({});
    }
  }

  const { run, pending } = useServerAction(saveKpiTemplateAction, {
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  const rules: ThresholdRule[] = v.rules
    .filter((r) => r.score.trim() !== "")
    .map((r) => ({ min: numOrNull(r.min), max: numOrNull(r.max), score: Number(r.score), label: r.label.trim() || undefined }));

  const methodConfig = (() => {
    switch (v.method) {
      case "RATIO":
        return v.cap ? { cap: numOrUndef(v.cap) } : null;
      case "INVERSE_RATIO":
        return v.penalty ? { penaltyPerUnit: numOrUndef(v.penalty) } : null;
      case "THRESHOLD_TABLE":
        return { rules };
      case "FORMULA":
        return { formula: v.formula.trim(), output: v.output, ...(v.cap ? { cap: numOrUndef(v.cap) } : {}) };
      default:
        return null;
    }
  })();
  const isNotion = v.source.startsWith("NOTION_");
  const sourceConfig = (() => {
    if (v.source === "GOALS") return v.srcCategory ? { category: v.srcCategory as KpiCategoryKey } : null;
    if (isNotion) return v.stageKey.trim() ? { stageKey: v.stageKey.trim() } : null;
    if (v.source === "WEEKLY_REPORTS_SUBMITTED") return { onTimeOnly: v.onTimeOnly };
    return null;
  })();

  const formulaCheck = v.method === "FORMULA" && v.formula.trim() ? validateFormula(v.formula, KPI_FORMULA_VARIABLES) : null;
  const maxScore = Number(v.maxScore) > 0 ? Number(v.maxScore) : 100;

  const submit = () => {
    const payload = {
      code: v.code,
      name: v.name,
      description: v.description,
      category: v.category,
      unit: v.unit,
      defaultTarget: v.defaultTarget,
      defaultWeight: v.defaultWeight,
      calculationMethod: v.method,
      methodConfig,
      maxScore: v.maxScore,
      sourceType: v.source,
      sourceConfig,
      isAutomatic: v.source === "MANUAL" || v.method === "MANUAL" ? false : v.isAutomatic,
      isActive: v.isActive,
    };
    const parsed = kpiTemplateSchema.safeParse(payload);
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[i.path.join(".")] ??= i.message;
    if (formulaCheck && !formulaCheck.ok) errs["methodConfig.formula"] = formulaCheck.error;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    run(template?.id ?? null, payload);
  };

  // ---- threshold live preview ------------------------------------------------
  const previewValues = useMemo(() => {
    const pts = new Set<number>([0]);
    for (const r of rules) {
      if (typeof r.min === "number") pts.add(r.min);
      if (typeof r.max === "number") pts.add(r.max);
    }
    const max = Math.max(...pts);
    pts.add(max + 1);
    return [...pts].filter((n) => Number.isFinite(n)).sort((a, b) => a - b).slice(0, 10);
  }, [rules]);

  // ---- calculator ---------------------------------------------------------------
  const [sample, setSample] = useState<Record<string, string>>({ achieved: "80", target: "100" });
  const calc = useMemo(() => {
    if (v.method === "MANUAL") return null;
    try {
      const vars = Object.fromEntries(KPI_FORMULA_VARIABLES.filter((k) => !["achieved", "target", "maxScore"].includes(k)).map((k) => [k, Number(sample[k] ?? 0) || 0]));
      const cfg = methodConfig as Parameters<typeof evaluateKpi>[0]["methodConfig"];
      const res = evaluateKpi(
        {
          templateId: "preview",
          code: v.code || "PREVIEW",
          name: v.name,
          category: v.category,
          unit: v.unit,
          target: Number(sample.target ?? v.defaultTarget) || 0,
          weight: 100,
          method: v.method,
          methodConfig: cfg,
          maxScore,
          isAutomatic: true,
        },
        { achieved: Number(sample.achieved) || 0, target: Number(sample.target) || 0, vars },
      );
      return { ok: true as const, ...res };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "تعذر الحساب" };
    }
  }, [v.method, v.code, v.name, v.category, v.unit, v.defaultTarget, methodConfig, maxScore, sample]);

  const calcVars = v.method === "FORMULA" ? KPI_FORMULA_VARIABLES.filter((k) => k !== "maxScore") : ["achieved", "target"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{template ? `تعديل المؤشر: ${template.name}` : "مؤشر أداء جديد"}</DialogTitle>
          <DialogDescription>حدد مصدر القياس وطريقة تحويل القيمة المحققة إلى درجة.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kpi-code">الرمز</Label>
              <Input id="kpi-code" dir="ltr" value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="IMAGE_APPROVAL" aria-invalid={!!errors.code} />
              <Err msg={errors.code} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kpi-name">اسم المؤشر</Label>
              <Input id="kpi-name" value={v.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
              <Err msg={errors.name} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="kpi-desc">الوصف</Label>
              <Textarea id="kpi-desc" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>الفئة</Label>
              <Select value={v.category} onValueChange={(x) => set("category", x as KpiCategoryKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KPI_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {KPI_CATEGORY_LABELS[c].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="kpi-unit">الوحدة</Label>
                <Input id="kpi-unit" value={v.unit} onChange={(e) => set("unit", e.target.value)} aria-invalid={!!errors.unit} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kpi-target">المستهدف</Label>
                <Input id="kpi-target" type="number" min={0} value={v.defaultTarget} onChange={(e) => set("defaultTarget", e.target.value)} aria-invalid={!!errors.defaultTarget} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kpi-max">الدرجة القصوى</Label>
                <Input id="kpi-max" type="number" min={1} value={v.maxScore} onChange={(e) => set("maxScore", e.target.value)} aria-invalid={!!errors.maxScore} />
              </div>
              <Err msg={errors.unit ?? errors.defaultTarget ?? errors.maxScore} />
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>مصدر القياس</Label>
              <Select value={v.source} onValueChange={(x) => set("source", x as SourceKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {KPI_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {v.source === "GOALS" && (
              <div className="space-y-2">
                <Label>فئة الأهداف المحتسبة</Label>
                <Select value={v.srcCategory || NONE} onValueChange={(x) => set("srcCategory", x === NONE ? "" : x)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>كل الأهداف</SelectItem>
                    {KPI_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {KPI_CATEGORY_LABELS[c].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isNotion && (
              <div className="space-y-2">
                <Label htmlFor="kpi-stage">مفتاح مرحلة Notion (اختياري)</Label>
                <Input id="kpi-stage" dir="ltr" list="kpi-stage-keys" value={v.stageKey} onChange={(e) => set("stageKey", e.target.value)} placeholder="images" aria-invalid={!!errors["sourceConfig.stageKey"]} />
                <datalist id="kpi-stage-keys">
                  {stageKeys.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-1">
                  {stageKeys.slice(0, 8).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => set("stageKey", s.key)}
                      className={cn("rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-muted", v.stageKey === s.key && "border-primary bg-primary/10 text-primary")}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">اتركه فارغًا لاحتساب كل أهداف Notion في الخطة.</p>
              </div>
            )}
            {v.source === "WEEKLY_REPORTS_SUBMITTED" && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Switch checked={v.onTimeOnly} onCheckedChange={(c) => set("onTimeOnly", c)} /> احتساب التقارير المسلّمة في الموعد فقط
              </label>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-2">
              <Label>طريقة الاحتساب</Label>
              <Select value={v.method} onValueChange={(x) => set("method", x as KpiMethod)}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {KPI_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(v.method === "RATIO" || v.method === "FORMULA") && (
              <div className="space-y-2 sm:w-64">
                <Label htmlFor="kpi-cap">الحد الأعلى لنسبة التحقق % (اختياري)</Label>
                <Input id="kpi-cap" type="number" min={1} value={v.cap} onChange={(e) => set("cap", e.target.value)} placeholder="100" />
              </div>
            )}
            {v.method === "INVERSE_RATIO" && (
              <div className="space-y-2 sm:w-64">
                <Label htmlFor="kpi-penalty">الخصم لكل وحدة عند مستهدف صفر (اختياري)</Label>
                <Input id="kpi-penalty" type="number" min={0} value={v.penalty} onChange={(e) => set("penalty", e.target.value)} placeholder="10" />
              </div>
            )}

            {v.method === "THRESHOLD_TABLE" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">تُقيَّم القواعد بالترتيب وأول قاعدة مطابقة تحدد الدرجة (من 0 إلى {formatNumber(maxScore)}). اترك الحد فارغًا ليكون مفتوحًا.</p>
                <div className="space-y-2">
                  {v.rules.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1.5fr_auto] items-center gap-2">
                      <Input type="number" aria-label="من" placeholder="من" value={r.min} onChange={(e) => set("rules", v.rules.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                      <Input type="number" aria-label="إلى" placeholder="إلى" value={r.max} onChange={(e) => set("rules", v.rules.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))} />
                      <Input type="number" aria-label="الدرجة" placeholder="الدرجة" value={r.score} onChange={(e) => set("rules", v.rules.map((x, j) => (j === i ? { ...x, score: e.target.value } : x)))} />
                      <Input aria-label="الوصف" placeholder="وصف (اختياري)" value={r.label} onChange={(e) => set("rules", v.rules.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="حذف القاعدة" onClick={() => set("rules", v.rules.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => set("rules", [...v.rules, { min: "", max: "", score: "", label: "" }])}>
                  <Plus /> إضافة قاعدة
                </Button>
                <Err msg={errors["methodConfig.rules"] ?? Object.entries(errors).find(([k]) => k.startsWith("methodConfig.rules"))?.[1]} />
                {rules.length > 0 && (
                  <div className="rounded-md bg-muted/50 p-2.5">
                    <p className="mb-1.5 text-xs font-semibold">معاينة مباشرة</p>
                    <div className="flex flex-wrap gap-1.5">
                      {previewValues.map((n) => {
                        const s = thresholdScore(n, rules);
                        return (
                          <span key={n} className="rounded-md border bg-background px-2 py-0.5 text-xs tabular-nums">
                            {formatNumber(n, 2)} {v.unit} ← <span className={cn("font-semibold", s === null && "text-muted-foreground")}>{s === null ? "لا تطابق (0)" : formatNumber(s, 2)}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {v.method === "FORMULA" && (
              <div className="space-y-2">
                <Label htmlFor="kpi-formula">المعادلة</Label>
                <Textarea
                  id="kpi-formula"
                  dir="ltr"
                  rows={3}
                  className="font-mono text-sm"
                  value={v.formula}
                  onChange={(e) => set("formula", e.target.value)}
                  placeholder="completed / max(worked, 1) * 100"
                  aria-invalid={!!errors["methodConfig.formula"] || (formulaCheck ? !formulaCheck.ok : false)}
                />
                {formulaCheck &&
                  (formulaCheck.ok ? (
                    <p className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="size-3.5" /> المعادلة صحيحة
                    </p>
                  ) : (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <XCircle className="size-3.5" /> {formulaCheck.error}
                    </p>
                  ))}
                <Err msg={formulaCheck?.ok === false ? undefined : errors["methodConfig.formula"]} />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">ناتج المعادلة:</span>
                  <Select value={v.output} onValueChange={(x) => set("output", x as "rate" | "score")}>
                    <SelectTrigger size="sm" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rate">نسبة تحقق %</SelectItem>
                      <SelectItem value="score">درجة من الدرجة القصوى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md bg-muted/50 p-2.5 text-xs">
                  <p className="mb-1 font-semibold">المتغيرات المتاحة (اضغط للإدراج)</p>
                  <div className="flex flex-wrap gap-1">
                    {KPI_FORMULA_VARIABLES.map((k) => (
                      <button key={k} type="button" title={VARIABLE_HINTS[k]} onClick={() => set("formula", `${v.formula}${v.formula && !v.formula.endsWith(" ") ? " " : ""}${k}`)} className="rounded border bg-background px-1.5 py-0.5 font-mono hover:bg-muted" dir="ltr">
                        {k}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-muted-foreground" dir="ltr">
                    + - * / % ^ &lt; &gt; == &amp;&amp; || · min max abs floor ceil round clamp if
                  </p>
                </div>
              </div>
            )}

            {v.method === "MANUAL" && <p className="text-xs text-muted-foreground">يُدخل المدير الدرجة يدويًا من صفحة التقييم (0 إلى {formatNumber(maxScore)}).</p>}

            {calc && (
              <div className="rounded-md border border-dashed p-2.5">
                <p className="mb-2 flex items-center gap-1 text-xs font-semibold">
                  <Calculator className="size-3.5" /> حاسبة تجريبية
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {calcVars.map((k) => (
                    <label key={k} className="space-y-1 text-[11px]">
                      <span className="text-muted-foreground">{VARIABLE_HINTS[k] ?? k}</span>
                      <Input type="number" className="h-7" value={sample[k] ?? "0"} onChange={(e) => setSample((s) => ({ ...s, [k]: e.target.value }))} />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs">
                  {calc.ok ? (
                    <>
                      نسبة التحقق <span className="font-semibold tabular-nums">{formatNumber(calc.achievementRate, 2)}%</span> ← الدرجة{" "}
                      <span className="font-semibold tabular-nums">
                        {formatNumber(calc.score, 2)} / {formatNumber(maxScore)}
                      </span>
                    </>
                  ) : (
                    <span className="text-destructive">{calc.error}</span>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={v.isAutomatic && v.source !== "MANUAL" && v.method !== "MANUAL"} disabled={v.source === "MANUAL" || v.method === "MANUAL"} onCheckedChange={(c) => set("isAutomatic", c)} />
              احتساب آلي
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={v.isActive} onCheckedChange={(c) => set("isActive", c)} /> مفعل
            </label>
            <div className="flex items-center gap-2">
              <Label htmlFor="kpi-weight" className="text-sm font-normal">
                الوزن الافتراضي
              </Label>
              <Input id="kpi-weight" type="number" min={0} max={100} className="w-20" value={v.defaultWeight} onChange={(e) => set("defaultWeight", e.target.value)} />
            </div>
          </div>
          {Object.keys(errors).length > 0 && <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">راجع الحقول المظللة: {Object.values(errors)[0]}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Spinner /> : <Save />}
            حفظ المؤشر
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
