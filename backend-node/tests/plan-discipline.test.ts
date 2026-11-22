import assert from "node:assert/strict";
import test from "node:test";
import { planInput } from "../src/schedule-service.js";
import { rowDisciplines } from "../src/project-cost.js";

// Migration 123 (owner, 2026-11-22): a PM asks for people by discipline; the head names them on Team overview > Allocation.
const task = { kind: "task", visibility: "Internal", startMode: "manual", parentId: 5, planStart: "2026-11-23", planDays: 3, lagDays: 0, sortOrder: 0, name: "Panel wiring", planManDays: 2 };

test("a plan row's discipline is one of four; null clears it, and a body without it keeps the row's", () => {
  assert.equal(planInput({ ...task, discipline: "Electrical" }, false).discipline, "Electrical");
  assert.equal(planInput({ ...task, discipline: null }, false).discipline, null);
  assert.equal("discipline" in planInput(task, false), false);
  assert.throws(() => planInput({ ...task, discipline: "Plumbing" }, false), /Discipline is invalid/);
  assert.throws(() => planInput({ ...task, kind: "phase", parentId: null, planManDays: 0, discipline: "Software" }, false), /main heading has no discipline/);
});

test("Projects > Cost splits a row by its typed discipline before its PIC's department", () => {
  const rows = new Map(
    [
      { id: 1, parentId: null, kind: "phase", name: "Installation", discipline: null },
      { id: 2, parentId: 1, kind: "task", name: "Cable pulling", discipline: null },
      { id: 3, parentId: 1, kind: "task", name: "Panel wiring", discipline: "Electrical" },
      { id: 4, parentId: null, kind: "phase", name: "Design", discipline: null },
      { id: 5, parentId: 4, kind: "task", name: "PLC program", discipline: "Software" },
      { id: 6, parentId: 4, kind: "task", name: "Frame", discipline: null },
    ].map((row) => [row.id, row as never]),
  );
  const departments = new Map<number, string[]>([
    [5, ["Mechanical Engineer Dept."]],
    [6, ["Mechanical Engineer Dept."]],
  ]);
  assert.deepEqual(rowDisciplines(2, rows, departments), ["Installation"], "the installation heading, as before");
  assert.deepEqual(rowDisciplines(3, rows, departments), ["Electrical"], "typed on the row beats the heading");
  assert.deepEqual(rowDisciplines(5, rows, departments), ["Software"], "typed on the row beats the PIC's department");
  assert.deepEqual(rowDisciplines(6, rows, departments), ["Mechanical"], "no discipline typed: the PIC's department");
});
