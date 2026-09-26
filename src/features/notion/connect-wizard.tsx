"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Database,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  Workflow,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import {
  analyzeNotionDatabaseAction,
  confirmNotionDatabaseAction,
  listNotionDatabasesAction,
  type DatabaseListItem,
  type NotionFailure,
} from "@/actions/notion-connect";
import { syncNowAction } from "@/actions/notion";
import { normalizeLabel, pickDatabase, unresolvedCount } from "@/lib/notion/auto-map";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import { AdvancedToggle, initialBucket, MappingReview, type Bucket, type ReviewField } from "./mapping-review";

export const OAUTH_START = "/api/notion/oauth/start";

export interface ConnectionInfo {
  id: string;
  workspaceName: string | null;
  ownerEmail: string | null;
  botName: string | null;
  status: "UNTESTED" | "CONNECTED" | "FAILED";
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
}

type Option = { value: string; label: string };
type Step = "connect" | "select" | "quick" | "review" | "sync";

const STEPS: { key: Step; label: string }[] = [
  { key: "connect", label: "ربط Notion" },
  { key: "select", label: "اختيار القاعدة" },
  { key: "quick", label: "بدء المزامنة" },
];

function Stepper({ step }: { step: Step }) {
  const current = step === "sync" ? STEPS.length : STEPS.findIndex((s) => s.key === (step === "review" ? "quick" : step));
  return (
    <ol className="flex items-center gap-1.5 sm:gap-3" aria-label="خطوات الربط">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
                done ? "bg-success text-white" : active ? "bg-primary text-primary-foreground shadow-[var(--shadow-raised)]" : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden truncate text-xs sm:inline", active ? "font-semibold" : "text-muted-foreground")}>{s.label}</span>
            {i < STEPS.length - 1 && <span className={cn("h-px flex-1", done ? "bg-success/50" : "bg-border")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function FailurePanel({ failure, onRetry }: { failure: NotionFailure; onRetry?: () => void }) {
  const action =
    failure.kind === "reconnect" ? (
      <Button size="sm" asChild>
        <a href={OAUTH_START}>
          <RefreshCw /> إعادة الربط
        </a>
      </Button>
    ) : failure.kind === "permission" ? (
      <Button size="sm" asChild>
        <a href={OAUTH_START}>
          <ShieldCheck /> تعديل صلاحيات Notion
        </a>
      </Button>
    ) : onRetry ? (
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw /> إعادة المحاولة
      </Button>
    ) : null;
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/30 p-4 sm:flex-row sm:items-center">
      <TriangleAlert className="size-5 shrink-0 text-danger" />
      <p className="flex-1 text-sm">{failure.message}</p>
      {action}
    </div>
  );
}

function ConnectStep({ oauthEnabled, advanced }: { oauthEnabled: boolean; advanced: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-8 p-6 sm:p-10 lg:grid-cols-5 lg:items-center">
        <div className="space-y-4 lg:col-span-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary shadow-[var(--shadow-inset)]">
            <Workflow className="size-6" />
          </span>
          <h2 className="text-xl font-bold sm:text-2xl">اربط Notion في خطوة واحدة</h2>
          <p className="max-w-lg text-sm leading-7 text-muted-foreground">
            ستنتقل إلى Notion لتختار مساحة العمل والصفحات التي تسمح لمسار الأداء بقراءتها، ثم تعود إلى هنا تلقائيًا لاختيار قاعدة البيانات.
          </p>
          {oauthEnabled ? (
            <Button size="lg" asChild>
              <a href={OAUTH_START}>
                <Link2 /> ربط Notion
              </a>
            </Button>
          ) : (
            <div className="space-y-2">
              <Alert>
                <TriangleAlert />
                <AlertDescription>ربط Notion غير متاح حاليًا — يحتاج إعدادًا لمرة واحدة من مسؤول النظام.</AlertDescription>
              </Alert>
              {advanced && (
                <Button size="sm" variant="outline" asChild>
                  <Link href="/notion/connections#advanced">فتح الإعدادات المتقدمة</Link>
                </Button>
              )}
            </div>
          )}
        </div>
        <ul className="space-y-3 text-sm lg:col-span-2">
          {[
            "قراءة فقط — لا يعدّل النظام أي شيء في Notion",
            "يمكنك إلغاء الاتصال في أي وقت",
            "بيانات الدخول تُحفظ مشفّرة على الخادم فقط",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              <span className="text-muted-foreground">{t}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ConnectionHeader({
  connections,
  connection,
  onSwitch,
}: {
  connections: ConnectionInfo[];
  connection: ConnectionInfo;
  onSwitch: (id: string) => void;
}) {
  const healthy = connection.status !== "FAILED";
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", healthy ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
          {healthy ? <CheckCircle2 className="size-5" /> : <TriangleAlert className="size-5" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{connection.workspaceName ?? "مساحة عمل Notion"}</p>
            <StatusBadge tone={healthy ? "success" : "danger"}>{healthy ? "متصل بـ Notion" : "انتهى الاتصال"}</StatusBadge>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {(connection.ownerEmail || connection.botName) && (
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3" /> {connection.ownerEmail ?? connection.botName}
              </span>
            )}
            <span>آخر مزامنة: {connection.lastSyncedAt ? formatDateTimeAr(new Date(connection.lastSyncedAt)) : "لم تتم بعد"}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {connections.length > 1 && (
          <Select value={connection.id} onValueChange={onSwitch}>
            <SelectTrigger size="sm" className="w-full sm:w-52" aria-label="مساحة العمل">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.workspaceName ?? c.ownerEmail ?? "Notion"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="ghost" asChild>
          <a href={OAUTH_START}>
            <Plus /> مساحة عمل أخرى
          </a>
        </Button>
      </div>
    </div>
  );
}

function DatabaseList({ connectionId, onPick, onLoaded }: { connectionId: string; onPick: (db: DatabaseListItem) => void; onLoaded?: (dbs: DatabaseListItem[]) => void }) {
  const list = useServerAction(listNotionDatabasesAction, { silent: true });
  const [state, setState] = useState<{ forId: string; databases: DatabaseListItem[] | null; failure: NotionFailure | null } | null>(null);
  const [query, setQuery] = useState("");

  const load = () =>
    list.run(connectionId).then((r) => {
      if (!r.ok || !r.data) return setState({ forId: connectionId, databases: null, failure: { kind: "temporary", message: r.ok ? "" : r.error } });
      if (r.data.failure) return setState({ forId: connectionId, databases: null, failure: r.data.failure });
      setState({ forId: connectionId, databases: r.data.databases, failure: null });
      onLoaded?.(r.data.databases);
    });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const current = state?.forId === connectionId ? state : null;
  const filtered = useMemo(() => {
    const q = normalizeLabel(query);
    return (current?.databases ?? []).filter((d) => !q || normalizeLabel(d.name).includes(q));
  }, [current, query]);

  if (!current || list.pending) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="جارٍ البحث عن قواعد البيانات">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> نبحث عن قواعد البيانات المتاحة في Notion…
        </p>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (current.failure) return <FailurePanel failure={current.failure} onRetry={load} />;

  const databases = current.databases ?? [];
  if (databases.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="لم تُمنح أي قاعدة بيانات بعد"
        description="عند الربط اختر في Notion الصفحات أو قواعد البيانات التي تريد متابعتها. يمكنك إضافتها الآن."
        action={
          <Button size="sm" asChild>
            <a href={OAUTH_START}>
              <Plus /> إضافة قواعد أخرى من Notion
            </a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم القاعدة" className="ps-9" aria-label="ابحث باسم القاعدة" />
        </div>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw /> تحديث القائمة
        </Button>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد قاعدة بهذا الاسم.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {filtered.map((d) => (
            <li key={d.id}>
              {d.addedId ? (
                <div className="flex h-full items-center gap-3 rounded-xl border bg-muted/30 p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-background text-lg">{d.icon ?? <Database className="size-4.5 text-muted-foreground" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <StatusBadge tone="success" className="mt-1">
                      مربوطة مسبقًا
                    </StatusBadge>
                  </div>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/notion/mappings?ds=${d.addedId}`}>عرض</Link>
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onPick(d)}
                  className="flex h-full w-full items-center gap-3 rounded-xl border bg-card p-3 text-start shadow-[var(--shadow-raised)] transition-all duration-200 ease-[var(--ease-soft)] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-raised-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:translate-y-0 active:shadow-[var(--shadow-pressed)]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-lg text-primary">{d.icon ?? <Database className="size-4.5" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(d.propertyCount)} حقل
                      {d.lastEditedTime ? ` · آخر تعديل ${formatDateTimeAr(new Date(d.lastEditedTime))}` : ""}
                    </p>
                  </div>
                  <ArrowLeft className="size-4 shrink-0 text-muted-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <span className="flex-1">لا ترى القاعدة التي تريدها؟ امنح مسار الأداء صلاحية الوصول إليها من Notion.</span>
        <Button size="sm" variant="outline" asChild>
          <a href={OAUTH_START}>
            <Plus /> إضافة قواعد أخرى من Notion
          </a>
        </Button>
      </div>
    </div>
  );
}

type SyncState =
  | { phase: "saving" }
  | { phase: "syncing"; scanned: number; created: number; updated: number; round: number }
  | { phase: "done"; scanned: number; created: number; updated: number; partial: boolean; dataSourceId: string }
  | { phase: "scheduled"; dataSourceId: string }
  | { phase: "failed"; message: string; failure?: NotionFailure; dataSourceId: string | null };

const MAX_SYNC_ROUNDS = 12;

function SyncProgress({ state, onRetry, onAnother }: { state: SyncState; onRetry: () => void; onAnother: () => void }) {
  const steps = [
    { label: "حفظ الإعدادات", done: state.phase !== "saving", active: state.phase === "saving" },
    {
      label: state.phase === "syncing" || state.phase === "done" ? `قراءة العناصر من Notion (${formatNumber(state.scanned)})` : "قراءة العناصر من Notion",
      done: state.phase === "done" || state.phase === "scheduled",
      active: state.phase === "syncing",
    },
    { label: "احتساب حالات مراحل العمل", done: state.phase === "done" || state.phase === "scheduled", active: false },
  ];
  const dsId = "dataSourceId" in state ? state.dataSourceId : null;

  return (
    <Card>
      <CardContent className="space-y-6 p-6 sm:p-8">
        {state.phase === "done" || state.phase === "scheduled" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success shadow-[var(--shadow-inset)]">
              <CheckCircle2 className="size-7" />
            </span>
            <h2 className="text-xl font-bold">تم الربط بنجاح</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {state.phase === "done"
                ? `تمت قراءة ${formatNumber(state.scanned)} عنصرًا (${formatNumber(state.created)} جديد). ${state.partial ? "ستُستكمل بقية العناصر تلقائيًا في المزامنة التالية." : "ستُحدَّث البيانات تلقائيًا بشكل دوري."}`
                : "حُفظت الإعدادات، وستبدأ المزامنة تلقائيًا في موعدها القادم."}
            </p>
          </div>
        ) : state.phase === "failed" ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">لم تكتمل المزامنة الأولى</h2>
            <FailurePanel failure={state.failure ?? { kind: "temporary", message: state.message }} onRetry={onRetry} />
            {dsId && <p className="text-xs text-muted-foreground">الإعدادات محفوظة — يمكنك إعادة المحاولة الآن أو ترك المزامنة التلقائية تتولى الأمر.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <h2 className="text-lg font-bold">جارٍ بدء المزامنة…</h2>
            <p className="text-sm text-muted-foreground">لا تغلق هذه الصفحة حتى تكتمل القراءة الأولى.</p>
            <Progress value={state.phase === "saving" ? 10 : Math.min(90, 20 + state.round * 12)} className="h-2" />
          </div>
        )}

        <ol className="space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2.5 text-sm">
              {s.done ? (
                <CheckCircle2 className="size-4.5 text-success" />
              ) : s.active ? (
                <Spinner className="size-4.5 text-primary" />
              ) : (
                <span className="size-4.5 rounded-full border-2 border-muted" aria-hidden />
              )}
              <span className={cn(!s.done && !s.active && "text-muted-foreground")}>{s.label}</span>
            </li>
          ))}
        </ol>

        {(state.phase === "done" || state.phase === "scheduled" || state.phase === "failed") && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild>
              <Link href="/notion">
                عرض لوحة Notion <ArrowLeft />
              </Link>
            </Button>
            <Button variant="outline" onClick={onAnother}>
              <Plus /> ربط قاعدة أخرى
            </Button>
            {dsId && (
              <Button variant="ghost" asChild>
                <Link href={`/notion/mappings?ds=${dsId}`}>ضبط الربط لاحقًا</Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ConnectWizard({
  connections,
  initialConnectionId,
  oauthEnabled,
  oauthResult,
  employees,
  advanced,
  canSync,
  autoStart = false,
}: {
  connections: ConnectionInfo[];
  initialConnectionId: string | null;
  oauthEnabled: boolean;
  oauthResult: { ok: boolean; message: string; detail?: string | null } | null;
  employees: Option[];
  advanced: boolean;
  canSync: boolean;
  /** right after authorization: choose the database and start syncing without asking when unambiguous */
  autoStart?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [connectionId, setConnectionId] = useState(() =>
    connections.some((c) => c.id === initialConnectionId) ? initialConnectionId! : (connections[0]?.id ?? null),
  );
  const connection = connections.find((c) => c.id === connectionId) ?? null;
  const [step, setStep] = useState<Step>(connection ? "select" : "connect");
  const [picked, setPicked] = useState<DatabaseListItem | null>(null);
  const [fields, setFields] = useState<ReviewField[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [name, setName] = useState("");
  const [defaultEmployeeId, setDefaultEmployeeId] = useState<string | null>(null);
  const [analysisFailure, setAnalysisFailure] = useState<NotionFailure | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [sync, setSync] = useState<SyncState | null>(null);
  const analyze = useServerAction(analyzeNotionDatabaseAction, { silent: true });
  const [auto, setAuto] = useState(autoStart);
  const [autoPicked, setAutoPicked] = useState(false);

  // kept in state: dropping ?oauth= from the URL below re-renders this page without it
  const [notice] = useState(oauthResult);
  useEffect(() => {
    if (oauthResult) router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAnalysis = (db: DatabaseListItem) => {
    if (!connectionId) return;
    setAnalysisFailure(null);
    setFields([]);
    analyze.run(connectionId, db.id, db.name).then((r) => {
      if (!r.ok || !r.data) return setAnalysisFailure({ kind: "temporary", message: r.ok ? "تعذر قراءة القاعدة" : r.error });
      if (r.data.failure) return setAnalysisFailure(r.data.failure);
      const reviewed = r.data.analysis.fields.map((f) => ({ ...f, ownerEmployeeId: null }));
      const bs = reviewed.map(initialBucket);
      setFields(reviewed);
      setBuckets(bs);
      const clear = unresolvedCount(reviewed) === 0;
      if (clear && auto) {
        setAuto(false);
        void confirm({ db, fields: reviewed, name: db.name });
        return;
      }
      // nothing ambiguous → skip the review; suggestions stay reachable via «مراجعة التفاصيل»
      setStep(clear ? "quick" : "review");
    });
  };

  const pick = (db: DatabaseListItem) => {
    setPicked(db);
    setName(db.name);
    setStep("review");
    runAnalysis(db);
  };

  const onDatabasesLoaded = (dbs: DatabaseListItem[]) => {
    if (!auto) return;
    // a reconnect resumes existing databases — only a first connection picks one automatically
    if (dbs.some((d) => d.addedId)) return setAuto(false);
    const choice = pickDatabase(dbs);
    if (!choice) return setAuto(false);
    setAutoPicked(true);
    pick(choice);
  };

  const runSync = async (dataSourceId: string) => {
    if (!canSync) return setSync({ phase: "scheduled", dataSourceId });
    let totals = { scanned: 0, created: 0, updated: 0 };
    for (let round = 1; round <= MAX_SYNC_ROUNDS; round++) {
      setSync({ phase: "syncing", ...totals, round });
      let r: Awaited<ReturnType<typeof syncNowAction>>;
      try {
        r = await syncNowAction(dataSourceId, false);
      } catch {
        return setSync({ phase: "failed", message: "تعذر الاتصال بالخادم", dataSourceId });
      }
      if (!r.ok || !r.data) return setSync({ phase: "failed", message: r.ok ? "تعذر إكمال المزامنة" : r.error, dataSourceId });
      totals = { scanned: totals.scanned + r.data.scanned, created: totals.created + r.data.created, updated: totals.updated + r.data.updated };
      // PARTIAL without errors = the time budget ran out and there is more to read
      const more = r.data.status === "PARTIAL" && r.data.errors.length === 0 && r.data.scanned > 0;
      if (!more) return setSync({ phase: "done", ...totals, partial: r.data.status === "PARTIAL", dataSourceId });
    }
    setSync({ phase: "done", ...totals, partial: true, dataSourceId });
  };

  const confirm = async (explicit?: { db: DatabaseListItem; fields: ReviewField[]; name: string }) => {
    const db = explicit?.db ?? picked;
    const useFields = explicit?.fields ?? fields;
    if (!connectionId || !db) return;
    setStep("sync");
    setSync({ phase: "saving" });
    try {
      const r = await confirmNotionDatabaseAction({
        connectionId,
        notionDataSourceId: db.id,
        notionDatabaseId: db.databaseId,
        name: (explicit?.name ?? name).trim() || db.name,
        defaultEmployeeId,
        fields: useFields.map((f) => ({
          property: f.property,
          propertyType: f.propertyType,
          role: f.role,
          stageKey: f.stageKey,
          label: f.label.trim() || f.property,
          ownerEmployeeId: f.ownerEmployeeId,
          statuses: f.statuses.map((s) => ({ value: s.value, status: s.status })),
        })),
      });
      if (!r.ok || !r.data) return setSync({ phase: "failed", message: r.ok ? "تعذر حفظ الإعدادات" : r.error, dataSourceId: null });
      if (r.data.failure) return setSync({ phase: "failed", message: r.data.failure.message, failure: r.data.failure, dataSourceId: null });
      router.refresh();
      await runSync(r.data.dataSourceId);
    } catch {
      setSync({ phase: "failed", message: "تعذر الاتصال بالخادم", dataSourceId: null });
    }
  };

  const reset = () => {
    setAuto(false);
    setAutoPicked(false);
    setPicked(null);
    setFields([]);
    setSync(null);
    setStep(connection ? "select" : "connect");
  };

  const unresolved = unresolvedCount(fields);

  return (
    <div className="space-y-5">
      {notice && (
        <Alert variant={notice.ok ? "default" : "destructive"}>
          {notice.ok ? <CheckCircle2 className="text-success" /> : <TriangleAlert />}
          <AlertDescription>
            <p>{notice.message}</p>
            {notice.detail && (
              <div className="mt-2 space-y-2">
                <p className="text-xs">{notice.detail}</p>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/notion/connections#advanced">فحص إعداد الربط</Link>
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Stepper step={step} />

      {autoPicked && picked && step !== "select" && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          اخترنا «{picked.name}» تلقائيًا لأنها الأنسب.
          <button type="button" onClick={reset} className="font-medium text-primary hover:underline">
            اختيار قاعدة أخرى
          </button>
        </p>
      )}

      {step === "connect" && <ConnectStep oauthEnabled={oauthEnabled} advanced={advanced} />}

      {step !== "connect" && connection && (
        <ConnectionHeader connections={connections} connection={connection} onSwitch={(id) => {
          reset();
          setConnectionId(id);
        }} />
      )}

      {step === "select" && connection && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">اختر قاعدة البيانات</CardTitle>
              <CardDescription>هذه القواعد التي سمحت لمسار الأداء بقراءتها في Notion.</CardDescription>
            </CardHeader>
            <CardContent>
              <DatabaseList connectionId={connection.id} onPick={pick} onLoaded={onDatabasesLoaded} />
            </CardContent>
          </Card>
        </div>
      )}

      {step === "review" && picked && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">مراجعة ربط «{picked.name}»</CardTitle>
              <CardDescription>
                قرأنا حقول القاعدة واقترحنا معنى كل حقل. {fields.length > 0 && (unresolved ? `بقي ${formatNumber(unresolved)} قرار فقط.` : "كل شيء جاهز.")}
              </CardDescription>
            </div>
            {advanced && fields.length > 0 && <AdvancedToggle checked={showTech} onCheckedChange={setShowTech} />}
          </CardHeader>
          <CardContent className="space-y-5">
            {analyze.pending ? (
              <div className="space-y-2" aria-busy="true">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> نقرأ حقول القاعدة ونقترح الربط…
                </p>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : analysisFailure ? (
              <FailurePanel failure={analysisFailure} onRetry={() => runAnalysis(picked)} />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ds-name">الاسم داخل مسار الأداء</Label>
                    <Input id="ds-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>الموظف المسؤول افتراضيًا (اختياري)</Label>
                    <Select value={defaultEmployeeId ?? "__none__"} onValueChange={(v) => setDefaultEmployeeId(v === "__none__" ? null : v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">بدون تحديد</SelectItem>
                        {employees.map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            {e.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <MappingReview fields={fields} buckets={buckets} onChange={setFields} employees={employees} advanced={advanced && showTech} />
              </>
            )}
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
              <Button variant="outline" onClick={reset}>
                <ArrowRight /> اختيار قاعدة أخرى
              </Button>
              <Button onClick={() => confirm()} disabled={analyze.pending || !!analysisFailure || fields.length === 0 || unresolved > 0}>
                {unresolved > 0 ? `بقي ${formatNumber(unresolved)} قرار` : "بدء المزامنة"} <ArrowLeft />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "quick" && picked && (
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:p-10">
            <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success shadow-[var(--shadow-inset)]">
              <Sparkles className="size-7" />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold">تم تجهيز الربط تلقائيًا</h2>
              <p className="text-sm text-muted-foreground">تعرّفنا على «{name.trim() || picked.name}» ويمكنك البدء مباشرة.</p>
            </div>
            <dl className="flex flex-wrap justify-center gap-3">
              <div className="rounded-xl border bg-card px-4 py-2.5">
                <dt className="text-xs text-muted-foreground">قاعدة البيانات</dt>
                <dd className="mt-0.5 text-sm font-semibold">{name.trim() || picked.name}</dd>
              </div>
              <div className="rounded-xl border bg-card px-4 py-2.5">
                <dt className="text-xs text-muted-foreground">حقول تم التعرف عليها</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatNumber(fields.filter((f) => f.role && f.role !== "STATUS").length)}</dd>
              </div>
              <div className="rounded-xl border bg-card px-4 py-2.5">
                <dt className="text-xs text-muted-foreground">حالات تم التعرف عليها</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                  {formatNumber(fields.reduce((n, f) => n + f.statuses.filter((s) => s.status).length, 0))}
                </dd>
              </div>
            </dl>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" onClick={() => setStep("review")}>
                مراجعة التفاصيل
              </Button>
              <Button size="lg" onClick={() => confirm()}>
                بدء المزامنة <ArrowLeft />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "sync" && sync && (
        <SyncProgress state={sync} onRetry={() => (sync.phase === "failed" && sync.dataSourceId ? runSync(sync.dataSourceId) : confirm())} onAnother={reset} />
      )}

      {picked?.url && step !== "sync" && step !== "select" && (
        <a href={picked.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          فتح القاعدة في Notion <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
