import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isRecord } from "../../src/utils/type-guards.js";

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord({ name: "Anton" }), true);
  });

  it("returns false for null", () => {
    assert.equal(isRecord(null), false);
  });

  it("returns false for primitives", () => {
    assert.equal(isRecord("hello"), false);
    assert.equal(isRecord(42), false);
    assert.equal(isRecord(true), false);
    assert.equal(isRecord(undefined), false);
  });
});
