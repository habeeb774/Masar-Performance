import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/action";
import { executionEndDate, fromDateKey, monthEnd, monthStart, planWeekPeriods, toDateKey } from "@/lib/dates";
import { suggestDailyTargets, suggestWeeklyTargets } from "@/lib/distribution";
import { num } from "@/lib/num";
import { assertNoPlanOverlap, lockEmployeePeriods, planSpan } from "./periods";

/** Preserve identities, achievement, notes and reports while moving execution periods. */
export async function rebuildPlanPeriods(planId: string, start: string, count: number, workDays: number[], tx?: Prisma.TransactionClient, originalSpan?: { start: string; end: string }) {
  const rebuild = async (client: Prisma.TransactionClient) => {
    const owner = await client.monthlyPlan.findUniqueOrThrow({ where: { id: planId }, select: { employeeId: true } });
    await lockEmployeePeriods(client, owner.employeeId);
    const plan = await client.monthlyPlan.findUniqueOrThrow({
      where: { id: planId },
      include: { goals: { include: { dailyTasks: true } }, weeklyPlans: { include: { report: true, goals: true }, orderBy: { weekIndex: "asc" } } },
    });
    const old = originalSpan ?? await planSpan(plan);
    const end = executionEndDate(start, count);
    await assertNoPlanOverlap(client, plan.employeeId, start, end, plan.id);
    const periods = planWeekPeriods(start, count, workDays);
    const allTasks = plan.goals.flatMap((goal) => goal.dailyTasks);
    const protectedOutside = allTasks.filter((task) => task.status !== "CANCELLED" && (task.status !== "NOT_STARTED" || num(task.achieved) > 0 || task.progress > 0) && (toDateKey(task.date) < start || toDateKey(task.date) > end));
    if (protectedOutside.length) throw new UserError(`توجد ${protectedOutside.length} مهام منفذة أو قيد التنفيذ خارج الفترة الجديدة؛ راجعها قبل تغيير فترة الخطة`);
    const surplus = plan.weeklyPlans.filter((week) => week.weekIndex > count);
    if (surplus.some((week) => week.report)) throw new UserError("تقليل عدد الأسابيع سيؤثر على تقارير محفوظة؛ راجع التقارير أولًا");
    const weekIds: string[] = [];
    for (const period of periods) {
      const week = await client.weeklyPlan.upsert({
        where: { monthlyPlanId_weekIndex: { monthlyPlanId: plan.id, weekIndex: period.index } },
        create: { monthlyPlanId: plan.id, employeeId: plan.employeeId, weekIndex: period.index, startDate: fromDateKey(period.start), endDate: fromDateKey(period.end), workDays: period.workDays.length },
        update: { startDate: fromDateKey(period.start), endDate: fromDateKey(period.end), workDays: period.workDays.length },
      });
      weekIds.push(week.id);
      if (plan.weeklyPlans.find((saved) => saved.id === week.id)?.report) {
        // Keep report content and review history; only its period metadata changes.
        await client.weeklyReport.update({ where: { weeklyPlanId: week.id }, data: { weekStart: fromDateKey(period.start), weekEnd: fromDateKey(period.end) } });
      }
    }
    for (const goal of plan.goals) {
      const defaultStart = !goal.startDate || [old.start, monthStart(plan.year, plan.month)].includes(toDateKey(goal.startDate));
      const defaultEnd = !goal.dueDate || [old.end, monthEnd(plan.year, plan.month)].includes(toDateKey(goal.dueDate));
      const goalStart = defaultStart ? start : toDateKey(goal.startDate!);
      const goalEnd = defaultEnd ? end : toDateKey(goal.dueDate!);
      if (goal.status !== "CANCELLED" && (goalStart > goalEnd || goalStart > end || goalEnd < start)) throw new UserError(`فترة الهدف خارج فترة التنفيذ الجديدة: ${goal.name}`);
      await client.monthlyGoal.update({ where: { id: goal.id }, data: { startDate: fromDateKey(goalStart), dueDate: fromDateKey(goalEnd) } });
      const targets = suggestWeeklyTargets({ goalType: goal.goalType, distributionMode: goal.distributionMode, targetValue: num(goal.targetValue), startDate: goalStart, dueDate: goalEnd }, periods);
      const weeklyIds: string[] = [];
      for (let i = 0; i < periods.length; i++) {
        const existing = plan.weeklyPlans.find((week) => week.id === weekIds[i])?.goals.find((weekly) => weekly.monthlyGoalId === goal.id);
        const needsLink = goal.dailyTasks.some((task) => task.status !== "NOT_STARTED" && task.status !== "CANCELLED" && toDateKey(task.date) >= periods[i].start && toDateKey(task.date) <= periods[i].end);
        if (["ONE_TIME", "DAILY"].includes(goal.distributionMode) && !targets[i] && !existing && !needsLink) { weeklyIds.push(""); continue; }
        const weekly = await client.weeklyGoal.upsert({
          where: { weeklyPlanId_monthlyGoalId: { weeklyPlanId: weekIds[i], monthlyGoalId: goal.id } },
          create: { weeklyPlanId: weekIds[i], monthlyGoalId: goal.id, targetValue: targets[i] },
          update: { targetValue: targets[i] },
        });
        weeklyIds.push(weekly.id);
      }
      const validDays = periods.flatMap((period) => period.workDays).filter((day) => day >= goalStart && day <= goalEnd);
      const pending = goal.dailyTasks.filter((task) => task.source === "DISTRIBUTED" && task.status === "NOT_STARTED" && num(task.achieved) === 0 && task.progress === 0);
      const fixed = goal.dailyTasks.filter((task) => !pending.includes(task));
      for (const task of fixed) {
        let day = toDateKey(task.date);
        if (task.status === "CANCELLED") {
          await client.dailyTask.update({ where: { id: task.id }, data: { date: fromDateKey(day < start || day > end ? start : day), weeklyGoalId: null } });
          continue;
        }
        if (task.status === "NOT_STARTED" && (day < start || day > end || (task.source === "DISTRIBUTED" && !validDays.includes(day)))) {
          const replacement = validDays[0];
          if (!replacement) throw new UserError(`لا توجد أيام كافية لإعادة توزيع مهام الهدف: ${goal.name}`);
          day = replacement;
        }
        const idx = periods.findIndex((period) => day >= period.start && day <= period.end);
        if (idx < 0) throw new UserError("تاريخ المهمة خارج فترة تنفيذ الخطة");
        await client.dailyTask.update({ where: { id: task.id }, data: { date: fromDateKey(day), weeklyGoalId: weeklyIds[idx] || null } });
      }
      // Reuse pending task identities (and their notes); preserve completed and
      // in-progress targets. Excess pending rows are cancelled, never deleted.
      const slots: { day: string; target: number; weeklyGoalId: string }[] = [];
      const fixedActive = fixed.filter((task) => task.status !== "CANCELLED" && task.source === "DISTRIBUTED");
      for (let i = 0; i < periods.length; i++) {
        if (!weeklyIds[i] || goal.status === "CANCELLED") continue;
        const owned = fixedActive.filter((task) => toDateKey(task.date) >= periods[i].start && toDateKey(task.date) <= periods[i].end);
        let days = validDays.filter((day) => day >= periods[i].start && day <= periods[i].end && !owned.some((task) => toDateKey(task.date) === day));
        let split: number[];
        if (goal.distributionMode === "ONE_TIME") {
          if (fixed.some((task) => task.status !== "CANCELLED") || !targets[i]) continue;
          const chosen = days.includes(goalEnd) ? goalEnd : goalEnd >= periods[i].start && goalEnd <= periods[i].end ? days.at(-1) : days[0];
          days = chosen ? [chosen] : [];
          split = [targets[i]];
        } else if (goal.distributionMode === "DAILY") split = days.map(() => 1);
        else split = suggestDailyTargets(Math.max(0, targets[i] - owned.reduce((sum, task) => sum + num(task.target), 0)), days.length);
        days.forEach((day, j) => { if (split[j] > 0) slots.push({ day, target: split[j], weeklyGoalId: weeklyIds[i] }); });
      }
      const generate = pending.length > 0 || ["APPROVED", "IN_PROGRESS"].includes(plan.status);
      if (generate) for (let i = 0; i < Math.max(slots.length, pending.length); i++) {
        const task = pending[i], slot = slots[i];
        if (task && slot) await client.dailyTask.update({ where: { id: task.id }, data: { date: fromDateKey(slot.day), target: slot.target, weeklyGoalId: slot.weeklyGoalId } });
        else if (task) await client.dailyTask.update({ where: { id: task.id }, data: { status: "CANCELLED", date: fromDateKey(start), target: 0, weeklyGoalId: null } });
        else if (slot) await client.dailyTask.create({ data: { employeeId: plan.employeeId, monthlyGoalId: goal.id, weeklyGoalId: slot.weeklyGoalId, title: goal.name, date: fromDateKey(slot.day), target: slot.target, source: "DISTRIBUTED", priority: goal.priority, createdById: plan.createdById } });
      }
    }
    // No report is removed. Surplus weeks without reports can safely go after re-linking tasks.
    for (const week of surplus) {
      if (week.goals.some((goal) => num(goal.manualAdjust) !== 0)) throw new UserError("توجد إنجازات يدوية في أسابيع ستُزال؛ راجعها قبل تقليل الفترة");
      await client.weeklyPlan.delete({ where: { id: week.id } });
    }
    await client.monthlyPlan.update({ where: { id: plan.id }, data: { executionStartDate: fromDateKey(start), executionEndDate: fromDateKey(end), weeksCount: count } });
  };
  if (tx) return rebuild(tx);
  return db.$transaction(rebuild, { timeout: 120_000 });
}
