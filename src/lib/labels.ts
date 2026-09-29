/** Arabic labels + visual tone for every enum shown in the UI. */

export type Tone = "success" | "warning" | "danger" | "info" | "pending" | "blocked" | "neutral" | "primary";

type LabelMap<K extends string> = Record<K, { label: string; tone: Tone }>;

export const GOAL_TYPES = ["NUMERIC", "BOOLEAN", "PERCENTAGE", "RECURRING", "MANUAL", "NOTION_SYNCED"] as const;
export type GoalTypeKey = (typeof GOAL_TYPES)[number];
export const GOAL_TYPE_LABELS: Record<GoalTypeKey, string> = {
  NUMERIC: "رقمي",
  BOOLEAN: "نعم / لا",
  PERCENTAGE: "نسبة مئوية",
  RECURRING: "متكرر",
  MANUAL: "يدوي",
  NOTION_SYNCED: "مرتبط بـ Notion",
};

export const DISTRIBUTION_MODES = ["DISTRIBUTED", "ONE_TIME", "DAILY"] as const;
export type DistributionModeKey = (typeof DISTRIBUTION_MODES)[number];
export const DISTRIBUTION_MODE_LABELS: LabelMap<DistributionModeKey> = {
  DISTRIBUTED: { label: "موزع", tone: "info" },
  ONE_TIME: { label: "مرة واحدة", tone: "primary" },
  DAILY: { label: "يومي", tone: "pending" },
};

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type PriorityKey = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: LabelMap<PriorityKey> = {
  LOW: { label: "منخفضة", tone: "neutral" },
  MEDIUM: { label: "متوسطة", tone: "info" },
  HIGH: { label: "عالية", tone: "warning" },
  URGENT: { label: "عاجلة", tone: "danger" },
};

export const GOAL_SOURCES = ["MANUAL", "NOTION", "SYSTEM"] as const;
export type GoalSourceKey = (typeof GOAL_SOURCES)[number];
export const GOAL_SOURCE_LABELS: Record<GoalSourceKey, string> = {
  MANUAL: "يدوي",
  NOTION: "Notion",
  SYSTEM: "النظام",
};

export const KPI_CATEGORIES = ["PRODUCTIVITY", "QUALITY", "COMMITMENT", "DEVELOPMENT"] as const;
export type KpiCategoryKey = (typeof KPI_CATEGORIES)[number];
export const KPI_CATEGORY_LABELS: LabelMap<KpiCategoryKey> = {
  PRODUCTIVITY: { label: "إنتاجية", tone: "primary" },
  QUALITY: { label: "جودة", tone: "success" },
  COMMITMENT: { label: "التزام", tone: "info" },
  DEVELOPMENT: { label: "تطوير", tone: "pending" },
};

export const GOAL_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETED", "PARTIAL", "CANCELLED"] as const;
export type GoalStatusKey = (typeof GOAL_STATUSES)[number];
export const GOAL_STATUS_LABELS: LabelMap<GoalStatusKey> = {
  NOT_STARTED: { label: "لم يبدأ", tone: "neutral" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "info" },
  AT_RISK: { label: "متأخر عن المسار", tone: "warning" },
  COMPLETED: { label: "مكتمل", tone: "success" },
  PARTIAL: { label: "إنجاز جزئي", tone: "warning" },
  CANCELLED: { label: "ملغي", tone: "blocked" },
};

export const PLAN_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"] as const;
export type PlanStatusKey = (typeof PLAN_STATUSES)[number];
export const PLAN_STATUS_LABELS: LabelMap<PlanStatusKey> = {
  DRAFT: { label: "مسودة", tone: "neutral" },
  SUBMITTED: { label: "بانتظار الاعتماد", tone: "pending" },
  APPROVED: { label: "معتمدة", tone: "success" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "info" },
  COMPLETED: { label: "مكتملة", tone: "success" },
  ARCHIVED: { label: "مؤرشفة", tone: "blocked" },
};

export const WEEKLY_PLAN_STATUS_LABELS: LabelMap<"DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "CLOSED"> = {
  DRAFT: { label: "لم يوزع", tone: "neutral" },
  PENDING_APPROVAL: { label: "فرق بانتظار الاعتماد", tone: "pending" },
  ACTIVE: { label: "نشط", tone: "info" },
  CLOSED: { label: "مغلق", tone: "blocked" },
};

export const TASK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PARTIAL", "DELAYED", "BLOCKED", "CANCELLED"] as const;
export type TaskStatusKey = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: LabelMap<TaskStatusKey> = {
  NOT_STARTED: { label: "لم تبدأ", tone: "neutral" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "info" },
  COMPLETED: { label: "مكتملة", tone: "success" },
  PARTIAL: { label: "جزئية", tone: "warning" },
  DELAYED: { label: "متأخرة", tone: "danger" },
  BLOCKED: { label: "معلقة", tone: "blocked" },
  CANCELLED: { label: "ملغاة", tone: "blocked" },
};

export const TASK_SOURCE_LABELS: Record<"DISTRIBUTED" | "MANUAL" | "NOTION" | "AD_HOC_TASK", string> = {
  DISTRIBUTED: "من الخطة",
  MANUAL: "يدوية",
  NOTION: "Notion",
  AD_HOC_TASK: "تكليف مستجد",
};

export const REPORT_STATUSES = ["DRAFT", "SUBMITTED", "REVIEWED", "RETURNED", "APPROVED"] as const;
export type ReportStatusKey = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABELS: LabelMap<ReportStatusKey> = {
  DRAFT: { label: "مسودة", tone: "neutral" },
  SUBMITTED: { label: "مرسل للمدير", tone: "pending" },
  REVIEWED: { label: "تمت المراجعة", tone: "info" },
  RETURNED: { label: "معاد للمراجعة", tone: "warning" },
  APPROVED: { label: "معتمد", tone: "success" },
};

export const REVIEW_STATUSES = ["DRAFT", "CALCULATED", "MANAGER_REVIEW", "APPROVED", "ACKNOWLEDGED"] as const;
export type ReviewStatusKey = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS: LabelMap<ReviewStatusKey> = {
  DRAFT: { label: "مسودة", tone: "neutral" },
  CALCULATED: { label: "محسوب آليًا", tone: "info" },
  MANAGER_REVIEW: { label: "قيد مراجعة المدير", tone: "pending" },
  APPROVED: { label: "معتمد", tone: "success" },
  ACKNOWLEDGED: { label: "اطلع عليه الموظف", tone: "success" },
};

export const NOTION_STATUS_LABELS: LabelMap<
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PENDING_APPROVAL"
  | "NEEDS_REVISION"
  | "IN_PROGRESS_AFTER_REVISION"
  | "COMPLETED"
  | "BLOCKED"
  | "CANCELLED"
  | "NOT_APPLICABLE"
  | "UNMAPPED"
> = {
  NOT_STARTED: { label: "لم يبدأ", tone: "neutral" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "info" },
  PENDING_APPROVAL: { label: "بانتظار الاعتماد", tone: "pending" },
  NEEDS_REVISION: { label: "يحتاج تحسين", tone: "danger" },
  IN_PROGRESS_AFTER_REVISION: { label: "تم التعديل", tone: "warning" },
  COMPLETED: { label: "مكتمل", tone: "success" },
  BLOCKED: { label: "معلق", tone: "blocked" },
  CANCELLED: { label: "ملغي", tone: "blocked" },
  NOT_APPLICABLE: { label: "لا ينطبق", tone: "neutral" },
  UNMAPPED: { label: "غير مربوط", tone: "warning" },
};

export const NOTION_FIELD_ROLE_LABELS: Record<
  "TITLE" | "STATUS" | "DATE" | "BATCH" | "PRODUCT_CODE" | "EMPLOYEE" | "TASK_TYPE" | "TEXT" | "NUMBER" | "NOTES",
  string
> = {
  TITLE: "العنوان / اسم العنصر",
  STATUS: "حالة مرحلة عمل",
  DATE: "حقل التاريخ",
  BATCH: "الدفعة",
  PRODUCT_CODE: "كود المنتج",
  EMPLOYEE: "الموظف",
  TASK_TYPE: "نوع المهمة",
  TEXT: "نص إضافي",
  NUMBER: "رقم إضافي",
  NOTES: "ملاحظة المراجع",
};

export const SYNC_STATUS_LABELS: LabelMap<"RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED"> = {
  RUNNING: { label: "قيد التشغيل", tone: "info" },
  SUCCESS: { label: "ناجحة", tone: "success" },
  PARTIAL: { label: "جزئية", tone: "warning" },
  FAILED: { label: "فشلت", tone: "danger" },
};

export const SYNC_TRIGGER_LABELS: Record<"MANUAL" | "SCHEDULED" | "RETRY" | "FULL_RESYNC", string> = {
  MANUAL: "يدوية",
  SCHEDULED: "مجدولة",
  RETRY: "إعادة محاولة",
  FULL_RESYNC: "مزامنة كاملة",
};

export const KPI_METHOD_LABELS: Record<"RATIO" | "INVERSE_RATIO" | "THRESHOLD_TABLE" | "FORMULA" | "MANUAL", string> = {
  RATIO: "نسبة الإنجاز (المنجز ÷ المستهدف)",
  INVERSE_RATIO: "نسبة عكسية (الأقل أفضل)",
  THRESHOLD_TABLE: "جدول درجات حسب القيمة",
  FORMULA: "معادلة مخصصة",
  MANUAL: "يدوي من المدير",
};

export const KPI_SOURCE_LABELS: Record<
  | "GOALS"
  | "NOTION_APPROVAL_RATE"
  | "NOTION_REVISION_RATE"
  | "NOTION_COUNT"
  | "PLAN_SUBMISSION_DELAY"
  | "WEEKLY_PLANS_PREPARED"
  | "WEEKLY_REPORTS_SUBMITTED"
  | "MONTHLY_REPORT_SUBMITTED"
  | "AD_HOC_COMPLETION"
  | "DEADLINE_COMMITMENT"
  | "MANUAL",
  string
> = {
  GOALS: "إنجاز الأهداف الشهرية",
  NOTION_APPROVAL_RATE: "نسبة الاعتماد من Notion",
  NOTION_REVISION_RATE: "نسبة إعادة العمل من Notion",
  NOTION_COUNT: "عدد عناصر Notion المكتملة",
  PLAN_SUBMISSION_DELAY: "أيام تأخير تسليم الخطة الشهرية",
  WEEKLY_PLANS_PREPARED: "إعداد الخطط الأسبوعية",
  WEEKLY_REPORTS_SUBMITTED: "تسليم التقارير الأسبوعية",
  MONTHLY_REPORT_SUBMITTED: "تسليم التقرير الشهري",
  AD_HOC_COMPLETION: "إنجاز المهام المستجدة",
  DEADLINE_COMMITMENT: "الالتزام بمواعيد التسليم",
  MANUAL: "إدخال يدوي",
};

export const DATA_SOURCE_PURPOSES: Record<string, string> = {
  PRODUCTS: "إضافة المنتجات",
  EDITS: "تعديل المنتجات",
  CONTENT: "المحتوى",
  ARTICLES: "المقالات",
  SEO: "SEO",
  DESIGN: "التصاميم",
  OTHER: "أخرى",
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  WEEK_ENDING: "نهاية الأسبوع",
  LOW_WEEKLY_PROGRESS: "إنجاز أسبوعي منخفض",
  ITEM_RETURNED_FOR_REVISION: "عنصر أعيد للتحسين",
  PENDING_APPROVAL_ITEMS: "عناصر بانتظار الاعتماد",
  TASK_ASSIGNED: "مهمة جديدة",
  WEEKLY_REPORT_READY: "تقرير أسبوعي جاهز",
  REPORT_RETURNED: "تقرير معاد",
  REPORT_SUBMITTED: "تقرير مرسل",
  REPORT_APPROVED: "تقرير معتمد",
  MONTH_ENDING: "نهاية الشهر",
  PLAN_SUBMITTED: "خطة مرسلة",
  PLAN_APPROVED: "خطة معتمدة",
  PLAN_RETURNED: "خطة معادة",
  REVIEW_APPROVED: "تقييم معتمد",
  SYNC_FAILED: "فشل المزامنة",
  GENERAL: "عام",
};

export const STAGE_KEY_SUGGESTIONS: { key: string; label: string }[] = [
  { key: "images", label: "اعتماد الصور" },
  { key: "productImage", label: "اعتماد صورة المنتج" },
  { key: "approval", label: "اعتماد للإضافة" },
  { key: "store", label: "الإضافة للمتجر" },
  { key: "content", label: "كتابة المحتوى" },
  { key: "description", label: "اعتماد الوصف" },
  { key: "seo", label: "SEO" },
  { key: "seoInitial", label: "إضافة السيو الأولي" },
];
