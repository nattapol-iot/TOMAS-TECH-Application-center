import assert from "node:assert/strict";
import test from "node:test";
import { planEmployeeSync, type LocalEmployee } from "../src/master-data/employee-plan.js";

const local = (fields: Partial<LocalEmployee> & { id: number; email: string }): LocalEmployee =>
  ({ nameEn: "", nameTh: "", nickname: "", isActive: true, masterKey: null, ...fields });
const person = (fields: Record<string, unknown>) => ({ english_name: "", thai_name: "", nickname: "", ...fields });

test("an email matches once, then the LINE WORKS id; names come from master without blanking what it lacks", () => {
  const plan = planEmployeeSync([
    local({ id: 1, email: "Fake.One@Example.test", nameEn: "Old Name", nameTh: "ชื่อเดิม", nickname: "One" }),
    local({ id: 2, email: "renamed@example.test", masterKey: "lw-2", nameEn: "Two" }),
    local({ id: 3, email: "same@example.test", masterKey: "lw-3", nameEn: "Three", nickname: "Tee" }),
  ], [
    person({ lineworks_user_id: "lw-1", employee_lineworks_email: "fake.one@example.test", english_name: "New Name", nickname: "Wan" }),
    person({ lineworks_user_id: "lw-2", employee_lineworks_email: "another@example.test", first_name: "Second", last_name: "Person" }),
    person({ lineworks_user_id: "lw-3", employee_lineworks_email: "same@example.test", english_name: "Three", nickname: "Tee" }),
  ]);
  assert.deepEqual(plan.changes, [
    { id: 1, masterKey: "lw-1", nameEn: "New Name", nameTh: "ชื่อเดิม", nickname: "Wan" },
    { id: 2, masterKey: "lw-2", nameEn: "Second Person", nameTh: "", nickname: "" },
  ]);
  assert.deepEqual(plan.deactivate, []);
});

test("only a row that matched before and is gone now becomes inactive; a never-matched email is left alone", () => {
  const plan = planEmployeeSync([
    local({ id: 1, email: "left@example.test", masterKey: "lw-left" }),
    local({ id: 2, email: "typo@example.test" }),
    local({ id: 3, email: "already@example.test", masterKey: "lw-gone", isActive: false }),
  ], [person({ lineworks_user_id: "lw-other", employee_lineworks_email: "other@example.test" })]);
  assert.deepEqual(plan.deactivate, [1]);
  assert.equal(plan.unmatched, 1);
  assert.deepEqual(plan.changes, []);
});

test("an email two people share in master matches nobody, and a LINE WORKS id already linked is not taken twice", () => {
  const plan = planEmployeeSync([
    local({ id: 1, email: "shared@example.test" }),
    local({ id: 2, email: "linked@example.test", masterKey: "lw-a" }),
    local({ id: 3, email: "a@example.test" }),
  ], [
    person({ lineworks_user_id: "lw-x", employee_lineworks_email: "shared@example.test" }),
    person({ lineworks_user_id: "lw-y", microsoft_email: "SHARED@example.test" }),
    person({ lineworks_user_id: "lw-a", employee_lineworks_email: "a@example.test", english_name: "A" }),
    { no: "key" }, null,
  ]);
  assert.deepEqual(plan.changes, [{ id: 2, masterKey: "lw-a", nameEn: "A", nameTh: "", nickname: "" }]);
  assert.equal(plan.unmatched, 2);
});
