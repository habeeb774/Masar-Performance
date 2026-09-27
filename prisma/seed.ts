/**
 * Seed: configuration data only (roles, permissions, org structure, goal
 * templates, KPI catalog, rating scale) plus the initial user accounts.
 * No fake tasks or results are created. Safe to run multiple times.
 *
 *   npx prisma db seed
 *
 * Optional env:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *   NOTION_TOKEN   → creates the Notion connection + products data source
 */
import "dotenv/config";
import { createCipheriv, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "@notionhq/client";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG } from "../src/lib/permissions";
import { HR_RATING_BANDS } from "../src/lib/kpi/rating-scale";
import { matchPreset } from "../src/lib/notion/presets";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const PRODUCTS_DATABASE_ID = "166c8267-6e34-4f05-9d4c-26946a1287b9";
const PRODUCTS_DATA_SOURCE_ID = "42398710-a0bd-4ef9-9412-e50e89e5d621";

function encrypt(plain: string) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

function randomPassword() {
  return `${randomBytes(9).toString("base64url")}9a`;
}

const createdAccounts: { email: string; password: string; role: string }[] = [];

async function ensureUser(opts: { email: string; name: string; roleId: string; password?: string; roleName: string }) {
  const existing = await db.user.findUnique({ where: { email: opts.email } });
  if (existing) return existing;
  const password = opts.password ?? randomPassword();
  const user = await db.user.create({
    data: { email: opts.email, name: opts.name, roleId: opts.roleId, passwordHash: await bcrypt.hash(password, 12) },
  });
  createdAccounts.push({ email: opts.email, password, role: opts.roleName });
  return user;
}

async function main() {
  // ---- permissions & roles ----------------------------------------------------
  for (const p of PERMISSION_CATALOG) {
    await db.permission.upsert({ where: { key: p.key }, update: { name: p.name, group: p.group }, create: p });
  }
  const perms = await db.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));
  const roleDefs = [
    { key: "ADMIN", name: "مدير النظام", description: "إدارة النظام بالكامل" },
    { key: "MANAGER", name: "مدير المتجر", description: "اعتماد الخطط والتقارير والتقييمات" },
    { key: "EMPLOYEE", name: "موظف", description: "تنفيذ الخطط والمهام" },
  ] as const;
  const roles: Record<string, string> = {};
  for (const r of roleDefs) {
    const role = await db.role.upsert({
      where: { key: r.key },
      update: {},
      create: { key: r.key, name: r.name, description: r.description, isSystem: true },
    });
    roles[r.key] = role.id;
    const hasAny = await db.rolePermission.count({ where: { roleId: role.id } });
    if (hasAny === 0) {
      await db.rolePermission.createMany({
        data: DEFAULT_ROLE_PERMISSIONS[r.key].map((k) => ({ roleId: role.id, permissionId: permId.get(k)! })),
      });
    }
  }

  // ---- organization -----------------------------------------------------------
  let company = await db.company.findFirst();
  if (!company) company = await db.company.create({ data: { name: "السويد", legalName: "شركة السويد" } });

  const marketing =
    (await db.department.findFirst({ where: { name: "إدارة التسويق" } })) ??
    (await db.department.create({ data: { companyId: company.id, name: "إدارة التسويق", type: "ADMINISTRATION", code: "MKT" } }));
  const store =
    (await db.department.findFirst({ where: { name: "إدارة المتجر الإلكتروني" } })) ??
    (await db.department.create({
      data: { companyId: company.id, parentId: marketing.id, name: "إدارة المتجر الإلكتروني", type: "SECTION", code: "ESTORE" },
    }));

  const jobTitle = async (name: string, description: string) =>
    (await db.jobTitle.findFirst({ where: { name } })) ?? (await db.jobTitle.create({ data: { name, description, departmentId: store.id } }));
  const jtManager = await jobTitle("مدير المتجر الإلكتروني", "إدارة فريق المتجر واعتماد الأعمال");
  const jtProducts = await jobTitle("مسؤول المنتجات والتصاميم", "إضافة وتعديل المنتجات وتجهيز الصور والتصاميم");
  const jtContent = await jobTitle("مسؤول المحتوى وSEO", "كتابة المحتوى والمقالات وتحسين محركات البحث");

  // ---- accounts -----------------------------------------------------------------
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@store.local").toLowerCase();
  const admin = await ensureUser({
    email: adminEmail,
    name: "مدير النظام",
    roleId: roles.ADMIN,
    password: process.env.SEED_ADMIN_PASSWORD,
    roleName: "ADMIN",
  });
  const managerUser = await ensureUser({ email: "manager@store.local", name: "مدير المتجر", roleId: roles.MANAGER, roleName: "MANAGER" });
  const emp1User = await ensureUser({ email: "products@store.local", name: "مسؤول المنتجات والتصاميم", roleId: roles.EMPLOYEE, roleName: "EMPLOYEE" });
  const emp2User = await ensureUser({ email: "content@store.local", name: "مسؤول المحتوى وSEO", roleId: roles.EMPLOYEE, roleName: "EMPLOYEE" });

  const ensureEmployee = async (userId: string, data: Omit<Prisma.EmployeeUncheckedCreateInput, "userId">) =>
    (await db.employee.findUnique({ where: { userId } })) ?? (await db.employee.create({ data: { ...data, userId } }));

  await ensureEmployee(admin.id, { fullName: "مدير النظام", employeeNo: "ADM-001", departmentId: store.id });
  const manager = await ensureEmployee(managerUser.id, { fullName: "مدير المتجر", employeeNo: "EST-001", departmentId: store.id, jobTitleId: jtManager.id });
  const emp1 = await ensureEmployee(emp1User.id, {
    fullName: "مسؤول المنتجات والتصاميم",
    employeeNo: "EST-002",
    departmentId: store.id,
    jobTitleId: jtProducts.id,
    managerId: manager.id,
  });
  const emp2 = await ensureEmployee(emp2User.id, {
    fullName: "مسؤول المحتوى وSEO",
    employeeNo: "EST-003",
    departmentId: store.id,
    jobTitleId: jtContent.id,
    managerId: manager.id,
  });
  await db.department.update({ where: { id: store.id }, data: { headEmployeeId: manager.id } });

  // ---- Notion (optional) ----------------------------------------------------------
  let productsSourceId: string | null = null;
  if (process.env.NOTION_TOKEN) {
    const token = process.env.NOTION_TOKEN;
    const client = new Client({ auth: token });
    let conn = await db.notionConnection.findFirst();
    if (!conn) {
      const me = await client.users.me({});
      conn = await db.notionConnection.create({
        data: {
          name: "Notion — السويد",
          tokenEncrypted: encrypt(token),
          tokenHint: token.slice(-4),
          botName: me.name ?? null,
          status: "CONNECTED",
          lastTestedAt: new Date(),
          createdById: admin.id,
        },
      });
    }
    let ds = await db.notionDataSource.findFirst({ where: { notionDataSourceId: PRODUCTS_DATA_SOURCE_ID } });
    if (!ds) {
      const retrieved = await client.dataSources.retrieve({ data_source_id: PRODUCTS_DATA_SOURCE_ID });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = Object.values((retrieved as any).properties ?? {}) as any[];
      const schema = props.map((p) => ({ id: p.id, name: p.name, type: p.type, options: (p[p.type]?.options ?? []).map((o: { name: string }) => ({ name: o.name })) }));
      ds = await db.notionDataSource.create({
        data: {
          connectionId: conn.id,
          name: "قاعدة بيانات إضافة المنتجات للمتجر",
          purpose: "PRODUCTS",
          notionDatabaseId: PRODUCTS_DATABASE_ID,
          notionDataSourceId: PRODUCTS_DATA_SOURCE_ID,
          syncIntervalMinutes: 30,
          schemaCache: schema,
          schemaFetchedAt: new Date(),
        },
      });
      const owners: Record<string, string> = { images: emp1.id, productImage: emp1.id, store: emp1.id, imageUpload: emp1.id, content: emp2.id, description: emp2.id, seo: emp2.id, seoInitial: emp2.id };
      for (const [i, f] of matchPreset(schema).entries()) {
        await db.notionFieldMapping.create({
          data: {
            dataSourceId: ds.id,
            role: f.role,
            notionProperty: f.notionProperty,
            notionPropertyType: f.notionPropertyType,
            stageKey: f.stageKey ?? null,
            label: f.label,
            ownerEmployeeId: f.stageKey ? (owners[f.stageKey] ?? null) : null,
            sortOrder: i,
            statusMappings: f.statuses ? { create: f.statuses.map((s) => ({ notionValue: s.value, systemStatus: s.status, precedence: s.precedence ?? 0 })) } : undefined,
          },
        });
      }
    }
    productsSourceId = ds.id;
  }

  // ---- goal templates ------------------------------------------------------------
  const notionRule = (stageKey: string) =>
    productsSourceId ? ({ dataSourceId: productsSourceId, stageKey, completedStatuses: ["COMPLETED"], completedRawValues: [], conditions: [], dateBasis: "STAGE_CHANGED", matchEmployee: false } as Prisma.InputJsonValue) : undefined;
  type Item = Omit<Prisma.GoalTemplateItemCreateManyTemplateInput, "sortOrder">;
  const n = (name: string, target: number, weight: number, stageKey: string | null, extra: Partial<Item> = {}): Item => ({
    name,
    targetValue: target,
    weight,
    unit: "عنصر",
    goalType: stageKey && productsSourceId ? "NOTION_SYNCED" : "NUMERIC",
    source: stageKey && productsSourceId ? "NOTION" : "MANUAL",
    notionFilter: stageKey ? notionRule(stageKey) : undefined,
    category: "PRODUCTIVITY",
    priority: "MEDIUM",
    ...extra,
  });

  const templates: { jobTitleId: string; name: string; items: Item[] }[] = [
    {
      jobTitleId: jtProducts.id,
      name: "قالب مسؤول المنتجات والتصاميم",
      items: [
        n("إضافة منتجات جديدة", 160, 30, "store", { unit: "منتج", priority: "HIGH", dutyName: "إضافة وتعديل المنتجات في المتجر" }),
        n("تعديل منتجات سابقة", 40, 10, null, { unit: "منتج", dutyName: "إضافة وتعديل المنتجات في المتجر" }),
        n("تجهيز صور المنتجات", 160, 20, "images", { unit: "صورة", priority: "HIGH", dutyName: "تجهيز صور المنتجات" }),
        n("تصميم بنرات", 8, 10, null, { unit: "بنر", dutyName: "التصاميم" }),
        n("ربط المنتجات بمقاطع Instagram", 20, 10, null, { unit: "منتج", dutyName: "التعديل وتطوير واجهة ومظهر المتجر" }),
        n("تحسين واجهة المتجر", 1, 10, null, { goalType: "BOOLEAN", unit: "مهمة", dutyName: "التعديل وتطوير واجهة ومظهر المتجر" }),
        n("مهام إضافية", 100, 10, null, { goalType: "PERCENTAGE", unit: "%", dutyName: "مهام مستجدة كُلّف بها خلال الشهر" }),
      ],
    },
    {
      jobTitleId: jtContent.id,
      name: "قالب مسؤول المحتوى وSEO",
      items: [
        n("كتابة محتوى المنتجات", 160, 25, "content", { unit: "منتج", priority: "HIGH" }),
        n("كتابة المقالات", 8, 15, null, { unit: "مقال" }),
        n("تحسين SEO للمنتجات", 120, 15, "seo", { unit: "منتج" }),
        n("تحسين التصنيفات", 10, 10, null, { unit: "تصنيف" }),
        n("Meta Title و Meta Description", 120, 10, null, { unit: "صفحة" }),
        n("الكلمات المفتاحية", 50, 5, null, { unit: "كلمة" }),
        n("رفع المحتوى للمتجر", 160, 10, null, { unit: "منتج" }),
        n("تقارير SEO", 1, 5, null, { goalType: "BOOLEAN", unit: "تقرير" }),
        n("مهام إضافية", 100, 5, null, { goalType: "PERCENTAGE", unit: "%", dutyName: "مهام مستجدة كُلّف بها خلال الشهر" }),
      ],
    },
  ];
  for (const t of templates) {
    const exists = await db.goalTemplate.findFirst({ where: { jobTitleId: t.jobTitleId } });
    if (exists) continue;
    await db.goalTemplate.create({
      data: { name: t.name, jobTitleId: t.jobTitleId, items: { createMany: { data: t.items.map((it, i) => ({ ...it, sortOrder: i })) } } },
    });
  }

  // ---- KPI catalog -----------------------------------------------------------------
  const kpiTemplates: Prisma.KpiTemplateCreateInput[] = [
    {
      code: "PLAN_ON_TIME",
      name: "تسليم خطة الشهر في الموعد",
      category: "COMMITMENT",
      unit: "يوم تأخير",
      defaultTarget: 0,
      calculationMethod: "THRESHOLD_TABLE",
      maxScore: 5,
      sourceType: "PLAN_SUBMISSION_DELAY",
      methodConfig: { rules: [{ max: 0, score: 5, label: "في الموعد" }, { min: 1, max: 1, score: 4 }, { min: 2, max: 2, score: 3 }, { min: 3, max: 3, score: 2 }, { min: 4, score: 1 }] },
    },
    { code: "WEEKLY_PLANS", name: "إعداد الخطط الأسبوعية", category: "COMMITMENT", unit: "أسبوع", calculationMethod: "RATIO", sourceType: "WEEKLY_PLANS_PREPARED" },
    { code: "WEEKLY_REPORTS", name: "كتابة التقارير الأسبوعية في الموعد", category: "COMMITMENT", unit: "تقرير", calculationMethod: "RATIO", sourceType: "WEEKLY_REPORTS_SUBMITTED", sourceConfig: { onTimeOnly: true } },
    { code: "MONTHLY_REPORT", name: "كتابة التقرير الشهري", category: "COMMITMENT", unit: "تقرير", calculationMethod: "RATIO", sourceType: "MONTHLY_REPORT_SUBMITTED" },
    { code: "GOALS_PRODUCTIVITY", name: "إنجاز أهداف الإنتاجية", category: "PRODUCTIVITY", unit: "%", calculationMethod: "RATIO", sourceType: "GOALS", sourceConfig: { category: "PRODUCTIVITY" } },
    { code: "IMAGE_APPROVAL", name: "نسبة اعتماد الصور", category: "QUALITY", unit: "%", defaultTarget: 95, calculationMethod: "RATIO", sourceType: "NOTION_APPROVAL_RATE", sourceConfig: { stageKey: "images" } },
    { code: "CONTENT_QUALITY", name: "جودة المحتوى (نسبة الاعتماد)", category: "QUALITY", unit: "%", defaultTarget: 95, calculationMethod: "RATIO", sourceType: "NOTION_APPROVAL_RATE", sourceConfig: { stageKey: "content" } },
    { code: "REWORK_RATE", name: "نسبة إعادة العمل", category: "QUALITY", unit: "%", defaultTarget: 5, calculationMethod: "INVERSE_RATIO", sourceType: "NOTION_REVISION_RATE" },
    { code: "ADHOC_TASKS", name: "إنجاز المهام المستجدة", category: "PRODUCTIVITY", unit: "%", calculationMethod: "RATIO", sourceType: "AD_HOC_COMPLETION" },
    { code: "DEADLINES", name: "الالتزام بالمواعيد", category: "COMMITMENT", unit: "%", calculationMethod: "RATIO", sourceType: "DEADLINE_COMMITMENT" },
    { code: "WORK_QUALITY", name: "جودة الإنجاز (تقييم المدير)", category: "QUALITY", unit: "درجة", defaultTarget: 10, calculationMethod: "MANUAL", maxScore: 10, sourceType: "MANUAL", isAutomatic: false },
  ];
  const tpl: Record<string, string> = {};
  for (const k of kpiTemplates) {
    const row = await db.kpiTemplate.upsert({ where: { code: k.code }, update: {}, create: k });
    tpl[k.code] = row.id;
  }
  const assign = async (code: string, jobTitleId: string | null, weight: number, sortOrder: number) => {
    const exists = await db.kpi.findFirst({ where: { templateId: tpl[code], jobTitleId } });
    if (!exists) await db.kpi.create({ data: { templateId: tpl[code], jobTitleId, weight, sortOrder } });
  };
  // shared KPIs (all job titles)
  await assign("GOALS_PRODUCTIVITY", null, 40, 1);
  await assign("REWORK_RATE", null, 10, 3);
  await assign("PLAN_ON_TIME", null, 5, 4);
  await assign("WEEKLY_PLANS", null, 5, 5);
  await assign("WEEKLY_REPORTS", null, 5, 6);
  await assign("MONTHLY_REPORT", null, 5, 7);
  await assign("ADHOC_TASKS", null, 5, 8);
  await assign("DEADLINES", null, 5, 9);
  await assign("WORK_QUALITY", null, 5, 10);
  // job-specific quality KPIs
  await assign("IMAGE_APPROVAL", jtProducts.id, 15, 2);
  await assign("CONTENT_QUALITY", jtContent.id, 15, 2);

  // ---- rating scale ------------------------------------------------------------------
  if ((await db.performanceRatingScale.count()) === 0) {
    await db.performanceRatingScale.create({
      data: {
        name: "سلم التقييم الافتراضي",
        isActive: true,
        companyId: company.id,
        bands: {
          create: [
            ...HR_RATING_BANDS.map((b, i) => ({ ...b, sortOrder: i + 1 })),
          ],
        },
      },
    });
  }

  console.log("\n✔ Seed completed");
  if (createdAccounts.length) {
    console.log("\nNew accounts (store these passwords now — they are not shown again):");
    for (const a of createdAccounts) console.log(`  ${a.role.padEnd(9)} ${a.email.padEnd(26)} ${a.password}`);
  }
  if (!process.env.NOTION_TOKEN) {
    console.log("\nℹ NOTION_TOKEN not set — add the Notion connection from /notion/connections (goal templates use manual items until then).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
