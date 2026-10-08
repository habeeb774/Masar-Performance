import { describe, expect, it } from "vitest";
import { STANDING_ORDER, teamStanding } from "@/features/team/standing";

describe("team standing", () => {
  const plan = "p1";
  it("late work far behind pace is LATE and sorts first", () => {
    const rows = [
      { name: "a", s: teamStanding({ planId: plan, monthly: 80, delayed: 0 }, 60) },
      { name: "b", s: teamStanding({ planId: plan, monthly: 30, delayed: 2 }, 60) },
      { name: "c", s: teamStanding({ planId: null, monthly: 0, delayed: 0 }, 60) },
    ].sort((x, y) => STANDING_ORDER[x.s] - STANDING_ORDER[y.s]);
    expect(rows.map((r) => [r.name, r.s])).toEqual([["b", "LATE"], ["c", "NO_PLAN"], ["a", "ON_TRACK"]]);
  });
  it("any delayed task needs attention even when on pace", () => {
    expect(teamStanding({ planId: plan, monthly: 60, delayed: 1 }, 60)).toBe("ATTENTION");
  });
  it("95%+ is excellent", () => {
    expect(teamStanding({ planId: plan, monthly: 100, delayed: 0 }, 90)).toBe("EXCELLENT");
  });
});
