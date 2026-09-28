import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseWhisperCommand } from "../../src/utils/parse-whisper-command.js";

describe("parseWhisperCommand", () => {
  it("parses a valid whisper command", () => {
    assert.deepEqual(parseWhisperCommand("/whisper Anton hello"), {
      recipientUsername: "Anton",
      text: "hello",
    });
  });

  it("parses text containing spaces", () => {
    assert.deepEqual(parseWhisperCommand("/whisper Anton hello world"), {
      recipientUsername: "Anton",
      text: "hello world",
    });
  });

  it("trims whisper text", () => {
    assert.deepEqual(parseWhisperCommand("/whisper Anton   hello world   "), {
      recipientUsername: "Anton",
      text: "hello world",
    });
  });

  it("returns null for normal chat text", () => {
    assert.equal(parseWhisperCommand("hello everyone"), null);
  });

  it("returns null when recipient is missing", () => {
    assert.equal(parseWhisperCommand("/whisper"), null);
  });

  it("returns null when whisper text is missing", () => {
    assert.equal(parseWhisperCommand("/whisper Anton"), null);
  });
});
