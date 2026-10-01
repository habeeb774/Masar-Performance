import { describe, expect, it } from "vitest";
import {
  isPlanDue,
  isWeekEnded,
  plansNeedingReport,
  weeksNeedingReport,
} from "@/server/services/reports-schedule";

describe("reports schedule", () => {
  it("treats a week as ended only after its last day", () => {
    expect(isWeekEnded("2026-09-24", "2026-09-24")).toBe(false);
    expect(isWeekEnded("2026-09-24", "2026-09-25")).toBe(true);
  });

  it("makes the monthly report due on the plan's last execution day, not the calendar month end", () => {
    // September plan runs 5 Sep → 2 Oct
    expect(isPlanDue("2026-10-02", "2026-09-30")).toBe(false);
    expect(isPlanDue("2026-10-02", "2026-10-01")).toBe(false);
    expect(isPlanDue("2026-10-02", "2026-10-02")).toBe(true);
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

  it("selects only ended, unreported plans of reportable statuses", () => {
    const plans = [
      {
        id: "aug",
        executionEnd: "2026-09-04",
        planStatus: "COMPLETED",
        hasReport: false,
      },
      {
        id: "aug-done",
        executionEnd: "2026-09-04",
        planStatus: "COMPLETED",
        hasReport: true,
      },
      {
        id: "aug-submitted-plan",
        executionEnd: "2026-09-04",
        planStatus: "SUBMITTED",
        hasReport: false,
      },
      {
        id: "sep",
        executionEnd: "2026-10-02",
        planStatus: "IN_PROGRESS",
        hasReport: false,
      },
    ];
    expect(plansNeedingReport(plans, "2026-09-27").map((p) => p.id)).toEqual(["aug"]);
    // September's plan ends 2 Oct — its report is not due on 30 Sep
    expect(plansNeedingReport(plans, "2026-09-30").map((p) => p.id)).toEqual(["aug"]);
    expect(plansNeedingReport(plans, "2026-10-02").map((p) => p.id)).toEqual(["aug", "sep"]);
  });
});
