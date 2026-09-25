import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toBuffer } from "../../src/utils/to-buffer.js";

describe("toBuffer", () => {
  it("returns the same Buffer instance", () => {
    const input = Buffer.from("hello");

    const result = toBuffer(input);

    assert.equal(result, input);
  });

  it("concatenates an array of Buffers", () => {
    const result = toBuffer([Buffer.from("hello "), Buffer.from("world")]);

    assert.deepEqual(result, Buffer.from("hello world"));
  });

  it("converts ArrayBuffer to Buffer", () => {
    const input = new TextEncoder().encode("hello").buffer;

    const result = toBuffer(input);

    assert.deepEqual(result, Buffer.from("hello"));
  });
});
