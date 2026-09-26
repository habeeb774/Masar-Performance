import { describe, expect, it } from "vitest";
import { deriveGoalStatus, deriveTaskStatus, isOverdue } from "@/lib/goal-status";

describe("deriveGoalStatus", () => {
  const base = { current: "NOT_STARTED" as const, start: "2026-09-01", end: "2026-09-30" };
  it("completes at 100%", () => {
    expect(deriveGoalStatus({ ...base, progressPct: 100, today: "2026-09-10" })).toBe("COMPLETED");
  });
  it("keeps cancelled goals cancelled", () => {
    expect(deriveGoalStatus({ ...base, current: "CANCELLED", progressPct: 100, today: "2026-09-10" })).toBe("CANCELLED");
  });
  it("flags goals behind the time-proportional pace", () => {
    // half the month gone, only 20% done
    expect(deriveGoalStatus({ ...base, progressPct: 20, today: "2026-09-15" })).toBe("AT_RISK");
    expect(deriveGoalStatus({ ...base, progressPct: 45, today: "2026-09-15" })).toBe("IN_PROGRESS");
  });
  it("marks overdue unfinished goals as partial", () => {
    expect(deriveGoalStatus({ ...base, progressPct: 70, today: "2026-10-02" })).toBe("PARTIAL");
  });
  it("does not flag risk in the first quarter of the period", () => {
    expect(deriveGoalStatus({ ...base, progressPct: 0, today: "2026-09-03" })).toBe("NOT_STARTED");
  });
});

describe("deriveTaskStatus", () => {
  it("completes when the target is reached", () => {
    expect(deriveTaskStatus({ current: "IN_PROGRESS", achieved: 8, target: 8, date: "2026-09-26", today: "2026-09-26" })).toBe("COMPLETED");
  });
  it("marks past days as partial or delayed", () => {
    expect(deriveTaskStatus({ current: "IN_PROGRESS", achieved: 3, target: 8, date: "2026-09-24", today: "2026-09-26" })).toBe("PARTIAL");
    expect(deriveTaskStatus({ current: "NOT_STARTED", achieved: 0, target: 8, date: "2026-09-24", today: "2026-09-26" })).toBe("DELAYED");
  });
  it("respects manual blocked status", () => {
    expect(deriveTaskStatus({ current: "BLOCKED", achieved: 8, target: 8, date: "2026-09-24", today: "2026-09-26" })).toBe("BLOCKED");
  });
});

describe("isOverdue", () => {
  it("detects overdue open tasks", () => {
    expect(isOverdue("IN_PROGRESS", "2026-09-20", "2026-09-26")).toBe(true);
    expect(isOverdue("COMPLETED", "2026-09-20", "2026-09-26")).toBe(false);
    expect(isOverdue("IN_PROGRESS", null, "2026-09-26")).toBe(false);
  });
});
