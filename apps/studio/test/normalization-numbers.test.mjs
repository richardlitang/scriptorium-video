import assert from "node:assert/strict";
import { test } from "node:test";
import { clampInteger, clampNumber } from "../lib/draft/normalization-numbers.mjs";

test("clampNumber falls back for empty or non-numeric values", () => {
  assert.equal(clampNumber(undefined, 7, 0, 10), 7);
  assert.equal(clampNumber(null, 7, 0, 10), 7);
  assert.equal(clampNumber("", 7, 0, 10), 7);
  assert.equal(clampNumber("nope", 7, 0, 10), 7);
});

test("clampNumber bounds numeric values", () => {
  assert.equal(clampNumber(-5, 7, 0, 10), 0);
  assert.equal(clampNumber(15, 7, 0, 10), 10);
  assert.equal(clampNumber("4.5", 7, 0, 10), 4.5);
});

test("clampInteger rounds after clamping", () => {
  assert.equal(clampInteger("4.5", 7, 0, 10), 5);
  assert.equal(clampInteger(99, 7, 0, 10), 10);
});
