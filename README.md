# مركز الإدارة والتقييم — Store Performance Hub

نظام ويب داخلي لإدارة أهداف ومهام وأداء فريق المتجر الإلكتروني، مرتبط بـ Notion، يلغي تكرار العمل بين OneNote وNotion وExcel.

- المعمارية الكاملة (المعمارية، الأدوار، مسار العمل، ERD، Notion، KPI، الـ API، خارطة الطريق): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- قواعد كتابة الكود: [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)

## التقنيات

Next.js 16 (App Router) · React 19 · TypeScript strict · PostgreSQL (Neon) · Prisma 7 · Zod 4 · React Hook Form · TanStack Table/Query · shadcn/ui (RTL) · Recharts · Notion API (SDK v5) · Vitest

## التشغيل محليًا

```bash
npm install                 # يولّد Prisma Client تلقائيًا
cp .env.example .env        # ثم املأ القيم
npx prisma migrate deploy   # إنشاء الجداول
npm run db:seed             # الأدوار، الصلاحيات، الهيكل، القوالب، المؤشرات، سلم التقييم + الحسابات الأولى
npm run dev                 # http://localhost:3000
```

متغيرات البيئة:

| المتغير | الوصف |
|---|---|
| `DATABASE_URL` | رابط Neon (pooled) |
| `ENCRYPTION_KEY` | 32 بايت base64 لتشفير رموز Notion: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `CRON_SECRET` | سر المهام المجدولة |
| `APP_URL` | رابط التطبيق |
| `NOTION_TOKEN` | اختياري للـ seed — إن وُجد يُنشأ اتصال Notion وقاعدة المنتجات مع الربط المقترح |
| `DATABASE_URL_TEST` | فرع Neon معزول لاختبارات التكامل |
| `NOTION_OAUTH_CLIENT_ID` / `NOTION_OAUTH_CLIENT_SECRET` | اختياري — لتفعيل الربط عبر OAuth |
| `NOTION_OAUTH_REDIRECT_URI` | اختياري — إن اختلف عن `APP_URL/api/notion/oauth/callback` |

يطبع الـ seed كلمات مرور الحسابات الأولى مرة واحدة (غيّرها بعد أول دخول من صفحة الحساب).

## تفعيل تكامل Notion

طريقتان — اختر واحدة:

### أ) OAuth (لا يحتاج صلاحية مالك مساحة العمل)

1. في Notion: ربط جديد ← OAuth، وضع «عنوان URI لإعادة التوجيه»: `<APP_URL>/api/notion/oauth/callback`
   (للإنتاج: `https://masar-performance-habrrbs-projects.vercel.app/api/notion/oauth/callback`).
2. انسخ Client ID وClient Secret إلى متغيرات البيئة `NOTION_OAUTH_CLIENT_ID` و`NOTION_OAUTH_CLIENT_SECRET` (Vercel ← Environment Variables) ثم أعد النشر.
3. في النظام: Notion ← الاتصالات ← «ربط عبر Notion (OAuth)» ← وافق واختر قاعدة المنتجات في شاشة Notion.
4. أكمل من الخطوة 4 في الطريقة (ب).

> «Client Secret» ليس رمز وصول — لا تلصقه في خانة الرمز الداخلي.

### ب) رمز تكامل داخلي (يتطلب مالك مساحة العمل)

1. أنشئ Internal Integration من <https://www.notion.so/my-integrations> وانسخ الرمز (`ntn_…`).
2. افتح قاعدة "قاعدة بيانات إضافة المنتجات للمتجر" في Notion ← ⋯ ← **Connections** ← أضف التكامل.
3. في النظام: **Notion ← الاتصالات** ← أضف الرمز (يُشفَّر ولا يُعرض مجددًا).
4. **Notion ← قواعد البيانات** ← الصق رابط القاعدة ← اختر مصدر البيانات ← احفظ.
5. **ربط الحقول والحالات** ← "تطبيق الربط المقترح" (مبني على حقول وحالات القاعدة الفعلية) ← عيّن مسؤول كل مرحلة ← عدّل أي حالة.
6. "مزامنة الآن". بعدها اربط أهداف القوالب/الخطط بمراحل Notion (مثل `store` للإضافة للمتجر، `images` لاعتماد الصور).

## المهام المجدولة

`/api/cron/run?job=sync|daily|all` مع الترويسة `Authorization: Bearer $CRON_SECRET`:

- `sync` — مزامنة القواعد المستحقة حسب فاصل كل قاعدة (يُنصح كل 15–30 دقيقة عبر cron-job.org أو ما شابه).
- `daily` — بدء/إغلاق الخطط، توليد التقارير الأسبوعية والشهرية، التذكيرات، تنظيف الجلسات (مرة يوميًا؛ مضبوط في `vercel.json`).

## الاختبارات

```bash
npm test                    # اختبارات الوحدات (التوزيع، KPI، المعادلات، ربط Notion، الصلاحيات، الحالات)
npm run test:integration    # المسار الكامل على فرع Neon المعزول (DATABASE_URL_TEST)
npm run typecheck
```

## النشر (Vercel)

1. اربط المستودع بمشروع Vercel وأضف متغيرات البيئة أعلاه.
2. أمر البناء الافتراضي `next build`؛ شغّل `npx prisma migrate deploy` ضمن خطوة النشر أو مرة يدويًا.
3. فعّل Cron (موجود في `vercel.json`) وأضف جدولة خارجية لـ `job=sync`.

## الأمان

جلسات قاعدة بيانات (رمز عشوائي مُجزّأ SHA-256، كوكي HttpOnly/Secure/SameSite)، bcrypt (cost 12)، قفل الحساب بعد 5 محاولات، Rate limiting في Postgres، RBAC على الخادم في كل صفحة وإجراء، Zod لكل مدخل، ترويسات أمان (CSP, HSTS, X-Frame-Options…)، تشفير AES-256-GCM لرموز Notion، وسجل تدقيق لكل تعديل حساس.
