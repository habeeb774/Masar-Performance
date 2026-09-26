# Engineering conventions — مركز الإدارة والتقييم

Read this before adding a page, action or service.

## Stack & versions (these differ from older docs you may know)

- **Next.js 16.3 (App Router, Turbopack)** — `middleware` is now `src/proxy.ts`. `params` and `searchParams` are **Promises**. Docs for this exact version live in `node_modules/next/dist/docs/`.
- **React 19.2**, **TypeScript strict**, **Tailwind v4**, **shadcn/ui (radix, RTL enabled)** in `src/components/ui/*`.
- **Prisma 7** with the `prisma-client` generator → import from `@/generated/prisma/client` (models/types) and `@/generated/prisma/enums` (enums). DB client: `import { db } from "@/server/db"`.
- **Zod 4**, **react-hook-form 7**, **@tanstack/react-table 8**, **recharts 3** (via `@/components/ui/chart`).

## Folder layout

```
src/
  app/(auth)/login            public login
  app/(app)/**                authenticated pages (layout renders sidebar + header)
  app/api/**                  route handlers (cron, attachments, health)
  actions/*.ts                "use server" actions — thin: validate → authorize → call service → revalidate
  server/                     server-only code ("server-only" import)
    auth/session.ts           getCurrentUser, requireUser/requirePermission (pages), actionUser/actionPermission (actions)
    services/*.ts             business logic (plans, tasks, reports, performance, progress, notifications, jobs)
    notion/*.ts               Notion client, schema discovery, incremental sync
    queries/*.ts              read models for pages (dashboards etc.)
    audit.ts                  audit(...)
    action.ts                 runAction(), UserError, ActionResult
  lib/                        isomorphic pure logic (safe in client components)
    dates.ts distribution.ts permissions.ts labels.ts validation.ts num.ts params.ts goal-status.ts
    kpi/engine.ts kpi/formula.ts notion/{status,properties,filter-rule,progress,item-mapper,presets}.ts
  components/shared/*         PageHeader, StatCard, EmptyState, StatusBadge/EnumBadge, ProgressBar, DataTable, url-filters, ActionButton
  components/charts/charts.tsx TrendChart, GroupedBarChart, StageStatusChart, PercentBars
  features/<area>/*           page-specific components (client forms, editors)
  hooks/use-server-action.ts  run an action with pending state + toasts
```

## Pages

```tsx
import type { Metadata } from "next";
import type { SearchParams, IdParams } from "@/lib/params";
import { int, str, pageParams } from "@/lib/params";
import { requirePermission, requireUser, requireEmployeeAccess, employeeWhere } from "@/server/auth/session";

export const metadata: Metadata = { title: "عنوان الصفحة" };

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.REPORTS_REVIEW); // renders 403 page when missing
  const sp = await searchParams;
  ...
}
// dynamic: ({ params }: { params: IdParams }) → const { id } = await params;
```

- **Never** use the generated `PageProps<"/x">` helper — route types are generated lazily; use the explicit types above.
- Always authorize on the server. Scope employee data with `employeeWhere(user)` (Prisma fragment) or `requireEmployeeAccess(id)`.
- Filters, search and pagination live in the URL (`SearchInput`, `SelectFilter`, `MonthPicker`, `Pager` from `@/components/shared/url-filters`), queried server-side with `skip/take` (`pageParams(sp)`).
- Use `PageHeader`, `Card`, `DataTable` (client; pass serializable rows — convert Decimal with `num()` and Dates with `toDateKey()`/ISO strings before passing to client components), `EmptyState` for no data, `EnumBadge map={X_LABELS} value={...}` for statuses.
- Notion-derived numbers show `<NotionSyncedTag />` and are **read-only**; users may only add notes / delay reasons.
- `loading.tsx` exists at `(app)` level; add one per heavy segment if useful.

## Server actions

```ts
"use server";
export async function doThingAction(id: string, input: z.input<typeof schema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.X);   // throws AuthError → toast
    const data = schema.parse(input);                      // ZodError → toast + fieldErrors
    await service.doThing(user, idSchema.parse(id), data); // UserError → toast
    revalidatePath("/", "layout");
  }, "رسالة النجاح");
}
```

Client side: `const { run, pending } = useServerAction(doThingAction); run(id, values).then(r => r.ok && close())`,
or `<ActionButton action={doThingAction.bind(null, id)} confirm={{ title: "…" }} reason={{ label: "السبب", required: true }}>…</ActionButton>`
(ActionButton passes the optional reason string as the last argument).

Existing actions: `src/actions/{plans,tasks,reports,performance,notion,org}.ts` — reuse them; add new action files for new features instead of editing others' files.

## Forms

react-hook-form + `zodResolver(schema)` from `@hookform/resolvers/zod`, schemas from `@/lib/validation` (shared with the server). Use shadcn `Field`, `FieldLabel`, `FieldError`, `Input`, `Select`, `Textarea`, `Switch`, `Checkbox`. Dates: `<Input type="date">` holding a `YYYY-MM-DD` DateKey string.

## Dates & numbers

- Calendar days are `DateKey` strings (`YYYY-MM-DD`); DB `@db.Date` columns ↔ `fromDateKey()` / `toDateKey()`. "Today" = `todayKey(company.timezone)`.
- Display: `formatDateAr`, `formatDayAr`, `formatDateTimeAr`, `monthLabel(year, month)`; numbers `formatNumber`, `formatPct`; Prisma `Decimal` → `num()`.

## UI / RTL rules

- The document is `dir="rtl"`. Use logical utilities: `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s`. Never `ml-/mr-/left-/right-` for layout.
- Arrows: "next/forward" in RTL points left (`ArrowLeft`, `ChevronLeft`).
- Status tones: `success | warning | danger | info | pending | blocked | neutral | primary` (Tailwind: `bg-success-soft text-success`, etc.).
- Charts: only the components in `components/charts/charts.tsx` (validated palette, legends, tooltips, RTL axes).
- Arabic copy everywhere; keep English only for product names (Notion, SEO, KPI).
- Every button must work, every form must persist, every number must be computed from the DB. No mock data.

## Security checklist

Server-side authorization on every page/action/route; zod validation on every input; never return the Notion token (only `tokenHint`); audit every sensitive change with `audit({ user, action, entityType, entityId, before, after, reason })`; route handlers that mutate must check the session and the `Origin` header.
