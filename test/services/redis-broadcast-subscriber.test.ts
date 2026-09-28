import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { RedisBroadcastSubscriber } from "../../src/services/redis-broadcast-subscriber.js";

function createSubscriber() {
  let messageHandler: ((channel: string, raw: string) => void) | undefined;

  const subscribed: string[] = [];

  const subscriber = {
    subscribed,

    subscribe(channel: string, callback: (error?: Error | null) => void) {
      subscribed.push(channel);
      callback();
    },

    on(event: "message", listener: (channel: string, raw: string) => void) {
      if (event === "message") {
        messageHandler = listener;
      }
    },

    emitMessage(channel: string, raw: string) {
      messageHandler?.(channel, raw);
    },
  };

  return subscriber;
}

describe("RedisBroadcastSubscriber", () => {
  it("subscribes to ws:broadcast", () => {
    const subscriber = createSubscriber();
    const service = new RedisBroadcastSubscriber(subscriber, "test-instance");

    service.start(() => {});

    assert.deepEqual(subscriber.subscribed, ["ws:broadcast"]);
  });

  it("handles JSON messages", () => {
    const subscriber = createSubscriber();
    const received: unknown[] = [];

    const service = new RedisBroadcastSubscriber(subscriber, "test-instance");

    service.start((room, data) => {
      received.push({ room, data });
    });

    subscriber.emitMessage(
      "ws:broadcast",
      JSON.stringify({
        instanceId: "other-instance",
        room: "general",
        kind: "json",
        message: {
          type: "system",
          text: "hello",
        },
      }),
    );

    assert.deepEqual(received, [
      {
        room: "general",
        data: {
          type: "system",
          text: "hello",
        },
      },
    ]);
  });

  it("handles binary messages", () => {
    const subscriber = createSubscriber();
    const received: Array<{
      room: string;
      data: Buffer;
    }> = [];

    const service = new RedisBroadcastSubscriber(subscriber, "test-instance");

    service.start((room, data) => {
      received.push({
        room,
        data: data as Buffer,
      });
    });

    subscriber.emitMessage(
      "ws:broadcast",
      JSON.stringify({
        instanceId: "other-instance",
        room: "general",
        kind: "binary",
        payload: Buffer.from("hello").toString("base64"),
      }),
    );

    assert.equal(received.length, 1);
    assert.equal(received[0]?.room, "general");
    assert.deepEqual(received[0]?.data, Buffer.from("hello"));
  });

  it("ignores messages from the same instance", () => {
    const subscriber = createSubscriber();
    let received = false;

    const service = new RedisBroadcastSubscriber(subscriber, "test-instance");

    service.start(() => {
      received = true;
    });

    subscriber.emitMessage(
      "ws:broadcast",
      JSON.stringify({
        instanceId: "test-instance",
        room: "general",
        kind: "json",
        message: {
          type: "system",
          text: "hello",
        },
      }),
    );

    assert.equal(received, false);
  });

  it("ignores messages from other channels", () => {
    const subscriber = createSubscriber();
    let received = false;

    const service = new RedisBroadcastSubscriber(subscriber, "test-instance");

    service.start(() => {
      received = true;
    });

    subscriber.emitMessage(
      "other-channel",
      JSON.stringify({
        instanceId: "other-instance",
        room: "general",
        kind: "json",
        message: {
          type: "system",
          text: "hello",
        },
      }),
    );

    assert.equal(received, false);
  });

  it("ignores invalid JSON", () => {
    const subscriber = createSubscriber();
    let received = false;

    const service = new RedisBroadcastSubscriber(subscriber, "test-instance");

    service.start(() => {
      received = true;
    });

    subscriber.emitMessage("ws:broadcast", "{invalid json");

    assert.equal(received, false);
  });
});
