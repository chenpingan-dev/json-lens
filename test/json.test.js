import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDocument,
  atPointer,
  diff,
  flatten,
  sorted,
  statistics,
} from "../src/json.js";

test("valid primitive documents are supported", () => {
  assert.equal(parseDocument("false"), false);
  assert.equal(parseDocument("null"), null);
});
test("empty and malformed documents are rejected", () => {
  assert.throws(() => parseDocument("  "), /Paste JSON/);
  assert.throws(() => parseDocument("{bad}"), SyntaxError);
});
test("byte and nesting limits prevent accidental giant input", () => {
  assert.throws(
    () => parseDocument('"' + "a".repeat(2 * 1024 * 1024) + '"'),
    /2 MiB/,
  );
  assert.throws(
    () => parseDocument("[".repeat(162) + "0" + "]".repeat(162)),
    /Nesting/,
  );
});
test("RFC 6901 slash and tilde escaping round trips", () => {
  const value = { "a/b": { "~key": 7 }, "": 9 };
  assert.equal(atPointer(value, "/a~1b/~0key"), 7);
  assert.equal(atPointer(value, "/"), 9);
  assert.equal(atPointer(value, ""), value);
});
test("pointer rejects missing keys, malformed escapes and prototype access", () => {
  for (const pointer of ["x", "/x", "/~3", "/~", "/__proto__"])
    assert.throws(() => atPointer({}, pointer));
  assert.throws(() => atPointer([1], "/01"), /array index|not found/i);
});
test("diff ignores object order but preserves array order", () => {
  assert.deepEqual(diff({ a: 1, b: 2 }, { b: 2, a: 1 }).changes, []);
  assert.equal(diff([1, 2], [2, 1]).changes.length, 2);
});
test("diff handles additions, removals, replacement and null", () => {
  assert.deepEqual(diff({ gone: 1, x: null }, { added: 2, x: false }).changes, [
    { op: "add", path: "/added", after: 2 },
    { op: "remove", path: "/gone", before: 1 },
    { op: "replace", path: "/x", before: null, after: false },
  ]);
});
test("array growth and shrinkage retain stable index paths", () => {
  assert.deepEqual(diff([1], [1, 2]).changes, [
    { op: "add", path: "/1", after: 2 },
  ]);
  assert.deepEqual(diff([1, 2], [1]).changes, [
    { op: "remove", path: "/1", before: 2 },
  ]);
});
test("type changes and scalar changes use the root pointer", () => {
  assert.deepEqual(diff([], {}).changes, [
    { op: "replace", path: "", before: [], after: {} },
  ]);
  assert.equal(diff(1, 2).changes[0].path, "");
});
test("diff limit reports truncation without hiding exact-limit results", () => {
  assert.equal(diff([0, 0], [1, 1], 1).truncated, true);
  assert.equal(diff([0], [1], 1).truncated, false);
  assert.throws(() => diff({}, {}, 0), RangeError);
});
test("sorting does not mutate or discard special keys", () => {
  const value = JSON.parse('{"z":1,"__proto__":{"x":2},"a":[{"z":0,"a":1}]}');
  const result = sorted(value);
  assert.ok(Object.hasOwn(result, "__proto__"));
  assert.deepEqual(Object.keys(result), ["__proto__", "a", "z"]);
  assert.deepEqual(Object.keys(value), ["z", "__proto__", "a"]);
});
test("flattened nodes are resolvable and statistics include null", () => {
  const value = { x: [null, true, { "a/b": "ok" }] };
  for (const row of flatten(value))
    assert.deepEqual(atPointer(value, row.path), row.value);
  assert.equal(statistics(value).nodes, 6);
  assert.equal(statistics(value).depth, 3);
  assert.equal(statistics(value).counts.null, 1);
});
