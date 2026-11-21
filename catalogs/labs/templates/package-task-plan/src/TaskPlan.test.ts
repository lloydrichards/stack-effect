import { Result } from "effect";
import { expect, it } from "vitest";
import { planTasks } from "./TaskPlan";

it("orders prerequisites before their dependents and keeps independent tasks", () => {
  const order = Result.getOrThrow(
    planTasks([
      { id: "publish", prerequisites: ["build", "test"] },
      { id: "docs", prerequisites: [] },
      { id: "build", prerequisites: ["compile"] },
      { id: "test", prerequisites: [] },
      { id: "compile", prerequisites: [] },
    ]),
  );

  expect(order).toHaveLength(5);
  expect(order).toEqual(
    expect.arrayContaining(["compile", "build", "test", "publish", "docs"]),
  );
  expect(order.indexOf("compile")).toBeLessThan(order.indexOf("build"));
  expect(order.indexOf("build")).toBeLessThan(order.indexOf("publish"));
  expect(order.indexOf("test")).toBeLessThan(order.indexOf("publish"));
});

it("reports the task and its missing prerequisite", () => {
  expect(planTasks([{ id: "publish", prerequisites: ["build"] }])).toEqual(
    Result.fail({
      _tag: "MissingPrerequisite",
      taskId: "publish",
      prerequisiteId: "build",
    }),
  );
});

it("rejects duplicate task IDs", () => {
  expect(
    planTasks([
      { id: "build", prerequisites: [] },
      { id: "build", prerequisites: [] },
    ]),
  ).toEqual(Result.fail({ _tag: "DuplicateTaskId", taskId: "build" }));
});

it("reports a cycle in terms of the original task IDs", () => {
  expect(
    planTasks([
      { id: "build", prerequisites: ["publish"] },
      { id: "publish", prerequisites: ["build"] },
    ]),
  ).toEqual(
    Result.fail({ _tag: "TaskCycle", path: ["build", "publish", "build"] }),
  );
});

it("reports a self-cycle", () => {
  expect(planTasks([{ id: "build", prerequisites: ["build"] }])).toEqual(
    Result.fail({ _tag: "TaskCycle", path: ["build", "build"] }),
  );
});

it("accepts a plan with no tasks", () => {
  expect(planTasks([])).toEqual(Result.succeed([]));
});
