# فترات تنفيذ الخطط — مسار الأداء

## القاعدة

`year` / `month` في MonthlyPlan اسم إداري فقط («خطة أكتوبر 2026»): العنوان، الأرشفة،
الفلاتر، MonthPicker والتقارير الإدارية. ولا يحددان متى تُنفذ الخطة.

مصدر الحقيقة الوحيد لفترة التنفيذ:

```
executionStartDate + weeksCount
executionEndDate = executionStartDate + weeksCount × 7 − 1   (مخزنة للبحث السريع، لا تُعدل مستقلة)
```

- كل WeeklyPlan سبعة أيام تقويمية كاملة، ولا يُقص أسبوع بنهاية الشهر.
- `company.workDays` يحدد أيام توليد DailyTasks داخل كل أسبوع فقط.
- الخطة التالية تبدأ تلقائيًا في اليوم التالي لنهاية الخطة السابقة للموظف.
- يُمنع التداخل (`newStart <= existingEnd AND newEnd >= existingStart`) داخل transaction مع قفل صف الموظف.
- قيود قاعدة البيانات: `weeksCount > 0` و`executionEndDate >= executionStartDate`، وفهرس `(employeeId, executionStartDate, executionEndDate)`.

## الدوال المركزية

`src/lib/execution-period.ts` (دوال نقية):

| الدالة | الغرض |
| --- | --- |
| `calculateExecutionPeriod(start, weeksCount)` | `{ startDate, endDate, weeks[] }` |
| `resolveExecutionPeriod(plan)` | الحقول المخزنة ← أول/آخر WeeklyPlan (بيانات قديمة) ← حدود الشهر (حل أخير) |
| `getPlanExecutionStart / End / WeeksCount(plan)` | اختصارات |
| `isDateInsidePlan(plan, date)` | هل التاريخ ضمن الخطة |
| `periodsOverlap(a, b)` / `nextPlanStart(end)` / `assertConsistentPeriod` | التداخل، بداية الخطة التالية، التحقق |

`src/server/services/periods.ts`: `planSpan`، `findCurrentPlan(employeeId, date)`،
`currentPlanMonth(date, employeeId?)` (الشهر الإداري الافتراضي للصفحات = الخطة الجارية اليوم)،
`assertNoPlanOverlap`، `currentPlanWhere`، `assertTaskInPlan`.

`planWeekPeriods(start, weeksCount, workDays)` في `src/lib/dates.ts` — لم تعد تقبل نهاية شهر.

## تغيير فترة خطة موجودة

`src/server/services/plan-execution.ts`:

- `rebuildPlanExecutionPeriod(planId, { executionStartDate, weeksCount, apply })` — تحافظ على
  المعرفات والإنجاز والمهام المكتملة والتقارير وملاحظاتها؛ تعيد جدولة المهام الموزعة غير المنفذة.
  المعاينة = نفس إعادة البناء داخل transaction يُلغى (rollback)، فالمعاينة مطابقة لما سيُطبق.
  أي تعارض (مهمة منفذة خارج الفترة، تقرير أو إنجاز يدوي في أسبوع سيُزال) يمنع التطبيق.
  واجهة «تعديل فترة التنفيذ» تعرض المعاينة قبل التأكيد.
- `resetPlanExecutionPeriod` — بداية نظيفة لخطة: حذف الأسابيع والأهداف الأسبوعية والتقارير
  والمهام المولدة غير المنفذة، ثم إعادة التوليد من الفترة الجديدة. الأهداف الشهرية تبقى.
  لا تُحذف مهمة مكتملة أو يدوية أو بها إنجاز.
- `purgePlans` — حذف خطط تاريخية كاملة مع مهامها (علاقة DailyTask بالهدف SetNull، فتُحذف صراحةً)
  وتقاريرها ومرفقاتها وتعليقاتها.

كل تغيير transactional ويُسجل في Audit: `plan.execution_period_rebuilt` (before/after،
الأسابيع والمهام المتأثرة، المهام المكتملة المحمية) أو `plan.purged`.

## سكربت ترحيل البيانات (عام لكل الخطط)

```powershell
npx tsx scripts/migrate-plan-execution-periods.ts [--plan=<id>] [--employee=<id>] [--year=YYYY] [--month=M]
    [--mode=rebuild|reset] [--start=YYYY-MM-DD] [--weeks=N] [--purge-before=YYYY-MM] [--apply] [--test-db]
```

Dry Run افتراضي ولا يكتب شيئًا. الكتابة فقط مع `--apply`. `--test-db` يستخدم DATABASE_URL_TEST.

بداية النظام الجديد (أكتوبر 2026) للموظف `cmui6o8js0012xsvzysr99wq1`:

```powershell
# 1) معاينة
npx tsx scripts/migrate-plan-execution-periods.ts --employee=cmui6o8js0012xsvzysr99wq1 --purge-before=2026-10 --year=2026 --month=10 --mode=reset --start=2026-10-03 --weeks=4
# 2) بعد نسخة احتياطية ومراجعة المعاينة
npx tsx scripts/migrate-plan-execution-periods.ts --employee=cmui6o8js0012xsvzysr99wq1 --purge-before=2026-10 --year=2026 --month=10 --mode=reset --start=2026-10-03 --weeks=4 --apply
```

لا توجد سكربتات شهرية؛ أي خطة مستقبلية تُعالج بنفس الخدمة أو من واجهة «تعديل فترة التنفيذ».

## Migration

`prisma/migrations/20261001010000_execution_periods` تضيف الحقول وقيودها والفهرس، وتملأ الخطط
القائمة مؤقتًا من أول/آخر WeeklyPlan وعدد الأسابيع. لا تحذف بيانات. تُطبق بـ `npm run db:migrate`.
