# Achievement ledger — phase 2 (not implemented yet)

Phase 1 (done): weekly reports read live metrics from `WeeklyGoal`, stored snapshots are
refreshed at the end of `recomputePlan`, and a manual achievement on a distributed goal must
carry a date and lands, as a difference, on the week containing that date.

What phase 1 still cannot do: **edit one past entry**. `manualAdjust` is an aggregate per
month / week, so "week 3 had +7, it was really +5" is only possible as a new `-2` entry dated
in week 3. That works (and a correction larger than the week's achievement is refused), but
the original entry itself is not kept as an editable row — only in the audit log.

## Proposed table

```prisma
enum AchievementEntryType { MANUAL DAILY_TASK IMPORT ADJUSTMENT }

model GoalAchievementEntry {
  id            String               @id @default(cuid())
  monthlyGoalId String
  weeklyGoalId  String?
  employeeId    String
  date          DateTime             @db.Date
  value         Decimal              @db.Decimal(12, 2)
  type          AchievementEntryType @default(MANUAL)
  note          String?
  createdById   String?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  monthlyGoal   MonthlyGoal          @relation(fields: [monthlyGoalId], references: [id], onDelete: Cascade)
  weeklyGoal    WeeklyGoal?          @relation(fields: [weeklyGoalId], references: [id], onDelete: SetNull)

  @@index([monthlyGoalId, date])
  @@index([weeklyGoalId])
}
```

`weeklyGoalId` is derived from `date` (and re-derived by `rebuildPlanPeriods`).

## Computation

- `WeeklyGoal.manualAdjust  = Σ entries of that week`
- `MonthlyGoal.manualAdjust = Σ all entries`

Keeping `manualAdjust` as a cached sum means `recomputePlan`, `manualAchieved` and every
report/dashboard keep working unchanged. Editing or deleting an entry = update the row,
recompute both sums for the affected goal, then `recomputePlan` (which refreshes reports).

## Migration

1. Create the table.
2. For each goal with `manualAdjust ≠ 0`, insert one `IMPORT` entry per weekly goal with
   `manualAdjust ≠ 0` (date = week start), plus one `ADJUSTMENT` entry for any month-only
   remainder (`month.manualAdjust − Σ weeks`).
3. Verify `Σ entries` equals both cached sums, then switch `setManualAchievement` to insert
   entries and add the "edit entry" UI.
