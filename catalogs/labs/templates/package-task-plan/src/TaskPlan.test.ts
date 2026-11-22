import {
  DuplicateTaskId,
  MissingPrerequisite,
  TaskCycle,
  TaskId,
} from "@repo/domain/Task";
import { Effect } from "effect";
import { expect, it } from "vitest";
import { planTasks } from "./TaskPlan";

const publish = TaskId.make("publish");
const docs = TaskId.make("docs");
const build = TaskId.make("build");
const test = TaskId.make("test");
const compile = TaskId.make("compile");

it("orders prerequisites before their dependents and keeps independent tasks", () => {
  const order = Effect.runSync(
    planTasks([
      { id: publish, prerequisites: [build, test] },
      { id: docs, prerequisites: [] },
      { id: build, prerequisites: [compile] },
      { id: test, prerequisites: [] },
      { id: compile, prerequisites: [] },
    ]),
  );

  expect(order).toHaveLength(5);
  expect(order).toEqual(
    expect.arrayContaining(["compile", "build", "test", "publish", "docs"]),
  );
  expect(order.indexOf(compile)).toBeLessThan(order.indexOf(build));
  expect(order.indexOf(build)).toBeLessThan(order.indexOf(publish));
  expect(order.indexOf(test)).toBeLessThan(order.indexOf(publish));
});

it("fails with the task and its missing prerequisite", () => {
  const error = Effect.runSync(
    Effect.flip(planTasks([{ id: publish, prerequisites: [build] }])),
  );

  expect(error).toBeInstanceOf(MissingPrerequisite);
  expect(error).toMatchObject({ taskId: "publish", prerequisiteId: "build" });
});

it("fails on duplicate task IDs", () => {
  const error = Effect.runSync(
    Effect.flip(
      planTasks([
        { id: build, prerequisites: [] },
        { id: build, prerequisites: [] },
      ]),
    ),
  );

  expect(error).toBeInstanceOf(DuplicateTaskId);
  expect(error).toMatchObject({ taskId: "build" });
});

it("fails with a cycle expressed as original task IDs", () => {
  const error = Effect.runSync(
    Effect.flip(
      planTasks([
        { id: build, prerequisites: [publish] },
        { id: publish, prerequisites: [build] },
      ]),
    ),
  );

  expect(error).toBeInstanceOf(TaskCycle);
  expect(error).toMatchObject({ path: ["build", "publish", "build"] });
});

it("fails with a self-cycle", () => {
  const error = Effect.runSync(
    Effect.flip(planTasks([{ id: build, prerequisites: [build] }])),
  );

  expect(error).toBeInstanceOf(TaskCycle);
  expect(error).toMatchObject({ path: ["build", "build"] });
});

it("accepts a plan with no tasks", () => {
  expect(Effect.runSync(planTasks([]))).toEqual([]);
});
