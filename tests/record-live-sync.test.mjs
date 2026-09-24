import assert from "node:assert/strict";
import test from "node:test";
import { afterBeat, afterLoad, canReloadQuietly, collisions, parseEditingKey, reloadDecision } from "../lib/record-live-sync.ts";

const idle = { editorOpen: false, draftsHeld: 0, typing: false, busy: false };
const beat = (changed, changedBy = [], cursor = "00000000000007d1") => ({ cursor, changed, changedBy, viewers: [] });

test("a loaded workspace is the baseline: nothing pending, the load's own cursor", () => {
  assert.deepEqual(afterLoad("00000000000007d0"), { cursor: "00000000000007d0", pending: false, changedBy: [] });
});

test("a quiet beat moves the cursor and asks for nothing", () => {
  const state = afterBeat(afterLoad("00000000000007d0"), beat(0));
  assert.deepEqual(state, { cursor: "00000000000007d1", pending: false, changedBy: [] });
  assert.equal(reloadDecision(state, idle), "none");
});

test("a change is remembered, with everyone who made it, until a load clears it", () => {
  let state = afterBeat(afterLoad("a"), beat(2, ["Somchai"], "b"));
  state = afterBeat(state, beat(1, ["Chalermchai", "Somchai"], "c"));
  assert.deepEqual(state, { cursor: "c", pending: true, changedBy: ["Somchai", "Chalermchai"] });
  // A quiet beat after it must not forget the change nobody has loaded yet.
  state = afterBeat(state, beat(0, [], "d"));
  assert.equal(state.pending, true);
  assert.deepEqual(state.changedBy, ["Somchai", "Chalermchai"]);
  assert.equal(afterLoad("e").pending, false);
});

test("a beat that lands after a reload can cost one reload too many, never a lost change", () => {
  // The reload already contains this change; the late beat reports it again.
  const reloaded = afterLoad("f");
  const late = afterBeat(reloaded, beat(1, ["Somchai"], "e"));
  assert.equal(late.pending, true, "fails safe: asks again rather than assume it was seen");
});

test("nothing reloads while a dialog is open, a cell holds a draft, or someone is typing", () => {
  const pending = afterBeat(afterLoad("a"), beat(1, ["Somchai"]));
  assert.equal(reloadDecision(pending, idle), "reload");
  for (const context of [{ ...idle, editorOpen: true }, { ...idle, draftsHeld: 1 }, { ...idle, typing: true }, { ...idle, busy: true }]) {
    assert.equal(canReloadQuietly(context), false, JSON.stringify(context));
    assert.equal(reloadDecision(pending, context), "wait", JSON.stringify(context));
  }
});

test("an editing key names the line; anything else names nothing", () => {
  assert.deepEqual(parseEditingKey("cost:412"), { kind: "cost", id: 412 });
  assert.deepEqual(parseEditingKey("manhour:new"), { kind: "manhour", id: "new" });
  for (const key of [null, "", "cost:", "estimate:1", "cost:12x"]) assert.equal(parseEditingKey(key), null, String(key));
});

test("two people on the same line collide; two people each adding a new one do not", () => {
  const viewers = [
    { userId: 9, name: "Somchai", editingKey: "cost:412", lastAt: "" },
    { userId: 10, name: "Chalermchai", editingKey: "cost:new", lastAt: "" },
  ];
  assert.deepEqual(collisions(viewers, "cost:412").map((viewer) => viewer.name), ["Somchai"]);
  assert.deepEqual(collisions(viewers, "cost:new"), []);
  assert.deepEqual(collisions(viewers, null), []);
  assert.deepEqual(collisions(viewers, "cost:413"), []);
});
