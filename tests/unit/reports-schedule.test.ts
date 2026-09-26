import { describe, expect, it } from "vitest";
import {
  dueMonths,
  isMonthDue,
  isWeekEnded,
  monthsNeedingReport,
  weeksNeedingReport,
} from "@/server/services/reports-schedule";

describe("reports schedule", () => {
  it("treats a week as ended only after its last day", () => {
    expect(isWeekEnded("2026-09-24", "2026-09-24")).toBe(false);
    expect(isWeekEnded("2026-09-24", "2026-09-25")).toBe(true);
  });

  it("makes the monthly report due on the month's last day", () => {
    expect(isMonthDue(2026, 9, "2026-09-29")).toBe(false);
    expect(isMonthDue(2026, 9, "2026-09-30")).toBe(true);
    expect(isMonthDue(2026, 8, "2026-09-01")).toBe(true);
  });

  it("lists due months within the lookback window, newest first", () => {
    expect(dueMonths("2026-09-27")).toEqual([{ year: 2026, month: 8 }]);
    expect(dueMonths("2026-09-30")).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 8 },
    ]);
    expect(dueMonths("2026-01-20")).toEqual([{ year: 2025, month: 12 }]);
  });

  it("selects only ended, unreported weeks of reportable plans", () => {
    const today = "2026-09-27";
    const weeks = [
      {
        id: "ended",
        endDate: "2026-09-24",
        planStatus: "IN_PROGRESS",
        hasReport: false,
      },
      {
        id: "current",
        endDate: "2026-10-01",
        planStatus: "IN_PROGRESS",
        hasReport: false,
      },
      {
        id: "today",
        endDate: "2026-09-27",
        planStatus: "IN_PROGRESS",
        hasReport: false,
      },
      {
        id: "reported",
        endDate: "2026-09-17",
        planStatus: "IN_PROGRESS",
        hasReport: true,
      },
      {
        id: "draft-plan",
        endDate: "2026-09-17",
        planStatus: "DRAFT",
        hasReport: false,
      },
      {
        id: "too-old",
        endDate: "2026-07-01",
        planStatus: "COMPLETED",
        hasReport: false,
      },
      {
        id: "last-month",
        endDate: "2026-08-31",
        planStatus: "COMPLETED",
        hasReport: false,
      },
    ];
    expect(weeksNeedingReport(weeks, today).map((w) => w.id)).toEqual([
      "ended",
      "last-month",
    ]);
  });

  it("selects only due, unreported months of reportable plans", () => {
    const plans = [
      {
        id: "aug",
        year: 2026,
        month: 8,
        planStatus: "COMPLETED",
        hasReport: false,
      },
      {
        id: "aug-done",
        year: 2026,
        month: 8,
        planStatus: "COMPLETED",
        hasReport: true,
      },
      {
        id: "aug-submitted-plan",
        year: 2026,
        month: 8,
        planStatus: "SUBMITTED",
        hasReport: false,
      },
      {
        id: "sep",
        year: 2026,
        month: 9,
        planStatus: "IN_PROGRESS",
        hasReport: false,
      },
    ];
    expect(monthsNeedingReport(plans, "2026-09-27").map((p) => p.id)).toEqual([
      "aug",
    ]);
    expect(monthsNeedingReport(plans, "2026-09-30").map((p) => p.id)).toEqual([
      "aug",
      "sep",
    ]);
  });
});
