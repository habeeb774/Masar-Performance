import { describe, expect, it } from "vitest";
import { taskCompletion } from "@/lib/task-completion";

describe("authoritative task completion", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  it("4/4 auto-completes without a separate status click", () => {
    expect(taskCompletion({status:"IN_PROGRESS",target:4,achieved:4,progress:0,now})).toEqual({status:"COMPLETED",achieved:4,progress:100,completedAt:now});
  });
  it("3/4 is in progress at 75%", () => {
    expect(taskCompletion({status:"NOT_STARTED",target:4,achieved:3,progress:0,now})).toMatchObject({status:"IN_PROGRESS",progress:75,completedAt:null});
  });
  it("explicit numeric completion supplies achievement for parent goal", () => {
    expect(taskCompletion({status:"COMPLETED",target:1,achieved:0,progress:0,now})).toMatchObject({achieved:1,progress:100});
  });
  it("non-numeric progress 100 completes", () => {
    expect(taskCompletion({status:"IN_PROGRESS",target:0,achieved:0,progress:100,now}).status).toBe("COMPLETED");
  });
  for (const status of ["BLOCKED","CANCELLED"] as const) it(`preserves ${status}`, () => {
    expect(taskCompletion({status,target:4,achieved:4,progress:100,now})).toMatchObject({status,completedAt:null});
  });
  it("preserves original completion timestamp", () => {
    const first = new Date("2026-10-07T00:00:00Z");
    expect(taskCompletion({status:"COMPLETED",target:4,achieved:4,progress:100,completedAt:first,now}).completedAt).toBe(first);
  });
});
