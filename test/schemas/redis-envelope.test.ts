import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { redisEnvelopeSchema } from "../../src/schemas/index.js";

describe("redisEnvelopeSchema", () => {
  it("accepts a JSON envelope", () => {
    const result = redisEnvelopeSchema.safeParse({
      instanceId: "instance-1",
      room: "general",
      kind: "json",
      message: {
        type: "system",
        text: "hello",
      },
    });

    assert.equal(result.success, true);
  });

  it("accepts a binary envelope", () => {
    const result = redisEnvelopeSchema.safeParse({
      instanceId: "instance-1",
      room: "general",
      kind: "binary",
      payload: Buffer.from("hello").toString("base64"),
    });

    assert.equal(result.success, true);
  });

  it("accepts an empty binary payload", () => {
    const result = redisEnvelopeSchema.safeParse({
      instanceId: "instance-1",
      room: "general",
      kind: "binary",
      payload: "",
    });

    assert.equal(result.success, true);
  });

  it("rejects a binary envelope without payload", () => {
    const result = redisEnvelopeSchema.safeParse({
      instanceId: "instance-1",
      room: "general",
      kind: "binary",
    });

    assert.equal(result.success, false);
  });

  it("rejects a JSON envelope without message", () => {
    const result = redisEnvelopeSchema.safeParse({
      instanceId: "instance-1",
      room: "general",
      kind: "json",
    });

    assert.equal(result.success, false);
  });

  it("rejects an unknown envelope kind", () => {
    const result = redisEnvelopeSchema.safeParse({
      instanceId: "instance-1",
      room: "general",
      kind: "unknown",
      message: {
        type: "system",
        text: "hello",
      },
    });

    assert.equal(result.success, false);
  });
});
