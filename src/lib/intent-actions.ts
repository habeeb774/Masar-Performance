/**
 * What the user wants to DO, in their own words → where it is done.
 * «خطة جديدة» → plans, «اعتماد التقييم» → evaluations waiting for approval, «تصدير اكسل» → HR export…
 * Only actions the user is allowed to do are offered. Pure — shared by the search and the tests.
 */
import { PERMISSIONS, type PermissionKey } from "./permissions";
import { words } from "./intent";

export interface IntentAction {
  id: string;
  label: string;
  hint: string;
  href: string;
  /** words that express this intent (matched with prefix tolerance) */
  keywords: string[];
  anyOf?: PermissionKey[];
  requiresEmployee?: boolean;
}

const TEAM = [PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE, PERMISSIONS.TASKS_ASSIGN, PERMISSIONS.EMPLOYEES_VIEW_ALL, PERMISSIONS.PERFORMANCE_REVIEW];

export const INTENT_ACTIONS: IntentAction[] = [
  // employee
  { id: "log-work", label: "تسجيل إنجاز", hint: "اكتب ما أنجزته في «ماذا أنجزت؟»", href: "/dashboard", keywords: ["تسجيل", "سجل", "انجاز", "انجزت", "اضفت", "خلصت", "عدلت"], requiresEmployee: true },
  { id: "my-tasks", label: "مهامي اليوم", hint: "ما عليك اليوم والمتأخر", href: "/my-tasks", keywords: ["مهامي", "مهام", "اليوم", "متاخر", "متاخره"], requiresEmployee: true },
  { id: "my-plan", label: "خطتي لهذا الشهر", hint: "أهدافك وتقدمك", href: "/my-plan", keywords: ["خطتي", "اهدافي", "هدفي", "تقدمي"], requiresEmployee: true },
  { id: "my-report", label: "تقريري الأسبوعي", hint: "مراجعة التقرير وإرساله", href: "/my-reports", keywords: ["تقريري", "تقرير", "ارسال", "ارسل", "اسبوعي"], requiresEmployee: true },
  { id: "my-performance", label: "تقييمي", hint: "نتيجتك المعتمدة", href: "/my-performance", keywords: ["تقييمي", "ادائي", "نتيجتي", "درجتي"], requiresEmployee: true, anyOf: [PERMISSIONS.PERFORMANCE_VIEW_OWN] },
  // manager
  { id: "new-plan", label: "إعداد خطة جديدة", hint: "اختر الموظف واكتب الأهداف والمستهدفات", href: "/monthly-plans", keywords: ["خطه", "خطط", "جديده", "انشاء", "اعداد", "اهداف"], anyOf: [PERMISSIONS.PLANS_MANAGE] },
  { id: "approve-evaluations", label: "اعتماد التقييمات الشهرية", hint: "التقييمات المنتهية بانتظار اعتمادك", href: "/review-center?tab=evaluations", keywords: ["اعتماد", "اعتمد", "تقييم", "تقييمات", "الشهر", "الشهري"], anyOf: [PERMISSIONS.PERFORMANCE_APPROVE] },
  { id: "evaluations", label: "التقييمات الرسمية", hint: "نتيجة كل موظف وتفاصيلها", href: "/performance/evaluations", keywords: ["تقييم", "تقييمات", "رسمي", "نتيجه", "درجه"], anyOf: [PERMISSIONS.PERFORMANCE_REVIEW, PERMISSIONS.PERFORMANCE_APPROVE] },
  { id: "hr-export", label: "تصدير للموارد البشرية", hint: "ملف Excel بالتقييم المعتمد", href: "/performance", keywords: ["تصدير", "اكسل", "excel", "موارد", "بشريه", "hr", "ملف"], anyOf: [PERMISSIONS.PERFORMANCE_REVIEW, PERMISSIONS.PERFORMANCE_APPROVE] },
  { id: "assign-task", label: "تكليف موظف بمهمة", hint: "مهمة مستجدة خارج الخطة", href: "/tasks?new=1", keywords: ["تكليف", "كلف", "مهمه", "جديده", "اسند"], anyOf: [PERMISSIONS.TASKS_ASSIGN] },
  { id: "review-reports", label: "مراجعة التقارير", hint: "تقارير بانتظار اعتمادك", href: "/review-center?tab=weekly", keywords: ["تقارير", "تقرير", "مراجعه", "اعتماد"], anyOf: [PERMISSIONS.REPORTS_REVIEW] },
  { id: "team", label: "الفريق — من يحتاج انتباهي", hint: "المتأخرون أولًا", href: "/team", keywords: ["الفريق", "فريق", "موظفين", "متاخر", "متاخرين", "انتباه"], anyOf: TEAM },
  { id: "waiting", label: "بانتظارك", hint: "كل ما يحتاج قرارك", href: "/review-center", keywords: ["بانتظار", "انتظار", "قرار", "موافقه", "اعتماد"], anyOf: [PERMISSIONS.REVIEW_CENTER] },
  // admin
  { id: "notion", label: "ربط Notion", hint: "اتصال ومزامنة", href: "/notion", keywords: ["notion", "نوشن", "ربط", "مزامنه"], anyOf: [PERMISSIONS.NOTION_MANAGE] },
  { id: "settings", label: "الإعدادات والصلاحيات", hint: "الشركة، الأدوار، الصلاحيات", href: "/settings", keywords: ["اعدادات", "صلاحيات", "صلاحيه", "ادوار", "مستخدمين"], anyOf: [PERMISSIONS.ORG_MANAGE, PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE] },
];

const close = (a: string, b: string) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))));
/** «بمهمة» / «للموظف» / «والتقرير»: also try without an attached preposition (never required, so «بنرات» still matches itself) */
const bare = (w: string) => (w.length > 4 && "بلوف".includes(w[0]) ? w.slice(1) : w);
const near = (a: string, b: string) => close(a, b) || close(bare(a), b);

/** Actions that fit the phrase and that this user may do, best first. */
export function matchIntentActions(query: string, permissions: ReadonlySet<string>, hasEmployee: boolean, limit = 3): IntentAction[] {
  const said = words(query);
  if (said.length === 0) return [];
  const allowed = (a: IntentAction) =>
    (!a.requiresEmployee || hasEmployee) && (!a.anyOf || permissions.has(PERMISSIONS.SYSTEM_ADMIN) || a.anyOf.some((k) => permissions.has(k)));
  return INTENT_ACTIONS.filter(allowed)
    .map((a) => {
      const kw = a.keywords.flatMap((k) => words(k));
      const hits = said.filter((s) => kw.some((k) => near(s, k))).length;
      return { a, score: hits / said.length + hits * 0.01 };
    })
    .filter((x) => x.score >= 0.5)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}

// ---------------------------------------------------------------------------
//  «تقييم حبيب», «خطة سارة», «مهام أحمد» — an action about one employee
// ---------------------------------------------------------------------------

export type EmployeeTopic = "evaluation" | "plan" | "tasks" | "reports";

const TOPICS: { topic: EmployeeTopic; keywords: string[] }[] = [
  { topic: "evaluation", keywords: ["تقييم", "تقييمه", "تقييمها", "اداء", "ادائه", "نتيجه", "درجه"] },
  { topic: "plan", keywords: ["خطه", "خطته", "خطتها", "اهداف", "اهدافه"] },
  { topic: "tasks", keywords: ["مهام", "مهامه", "مهامها", "مهمه", "متاخر", "متاخره"] },
  { topic: "reports", keywords: ["تقرير", "تقريره", "تقريرها", "تقارير"] },
];

/** Which part of an employee's work the phrase is about, if any. */
export function employeeTopic(query: string): EmployeeTopic | null {
  const said = words(query);
  for (const t of TOPICS) if (said.some((s) => t.keywords.some((k) => s === k || bare(s) === k))) return t.topic;
  return null;
}

/** How many words of this employee's name the phrase says (3+ letters, exact) — 0 = not named. */
export function nameScore(query: string, fullName: string): number {
  const said = new Set(words(query).flatMap((w) => [w, bare(w)]));
  return words(fullName).filter((n) => n.length >= 3 && said.has(n)).length;
}

export const namesEmployee = (query: string, fullName: string) => nameScore(query, fullName) > 0;

/** The employees the phrase names: only the best-matching ones («مسؤول المحتوى» ≠ every «مسؤول»). */
export function namedEmployees<E extends { fullName: string }>(query: string, employees: E[]): E[] {
  const scored = employees.map((e) => ({ e, s: nameScore(query, e.fullName) })).filter((x) => x.s > 0);
  const best = Math.max(0, ...scored.map((x) => x.s));
  return scored.filter((x) => x.s === best).map((x) => x.e);
}
