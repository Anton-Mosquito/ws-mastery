import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseClientMessage } from "../../src/utils/parse-client-message.js";

describe("parseClientMessage", () => {
  it("parses a valid JSON message", () => {
    const result = parseClientMessage(
      JSON.stringify({
        type: "system",
        text: "hello",
      }),
    );

    assert.deepEqual(result, {
      success: true,
      message: {
        type: "system",
        text: "hello",
      },
    });
  });

  it("rejects invalid JSON", () => {
    const result = parseClientMessage("{invalid json");

    assert.deepEqual(result, {
      success: false,
      errorMessage: "Некоректний JSON",
    });
  });

  it("rejects a message with an invalid schema", () => {
    const result = parseClientMessage(
      JSON.stringify({
        type: "system",
      }),
    );

    assert.deepEqual(result, {
      success: false,
      errorMessage: "Невірний формат повідомлення",
    });
  });

  it("parses a join_room message", () => {
    const result = parseClientMessage(
      JSON.stringify({
        type: "join_room",
        room: "general",
      }),
    );

    assert.deepEqual(result, {
      success: true,
      message: {
        type: "join_room",
        room: "general",
      },
    });
  });
});
