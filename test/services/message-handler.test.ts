import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { MessageHandler } from "../../src/services/message-handler.js";

function createSocket() {
  const sent: string[] = [];
  const closed: Array<{
    code: number;
    reason: string;
  }> = [];

  const socket = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,

    send(data: string) {
      sent.push(data);
    },

    close(code: number, reason: string) {
      closed.push({ code, reason });
    },

    terminate() {},
  } as unknown as WebSocket;

  return {
    socket,
    sent,
    closed,
  };
}

function createMeta() {
  return {
    id: "client-1",
    username: "Anton",
    room: "general",
    isAlive: false,
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    lastActivity: 0,
  };
}

function createPayload() {
  return {
    userId: "user-1",
    username: "Anton",
    exp: Math.floor(Date.now() / 1000) + 60,
  };
}

function createDependencies() {
  const broadcasts: Array<{
    room: string;
    data: unknown;
    excludeSocket?: WebSocket;
  }> = [];

  const whispers: unknown[] = [];
  const heartbeats: unknown[] = [];
  const refreshes: unknown[] = [];
  const joins: string[] = [];

  const broadcastService = {
    broadcast(room: string, data: unknown, excludeSocket?: WebSocket) {
      if (excludeSocket === undefined) {
        broadcasts.push({
          room,
          data,
        });

        return;
      }

      broadcasts.push({
        room,
        data,
        excludeSocket,
      });
    },
  };

  const whisperService = {
    handle(socket: WebSocket, username: string, command: unknown) {
      whispers.push({
        socket,
        username,
        command,
      });

      return true;
    },
  };

  const roomService = {
    async join(socket: WebSocket, room: string) {
      joins.push(room);
      return "lobby";
    },
  };

  const heartbeatService = {
    handlePing(socket: WebSocket, meta: unknown, sentAt?: number) {
      heartbeats.push({
        socket,
        meta,
        sentAt,
      });
    },

    markAlive(meta: unknown) {
      heartbeats.push({ meta });
    },
  };

  type TokenRefreshFakeResult =
    | {
        success: true;
        payload: {
          userId: string;
          username: string;
          exp: number;
        };
      }
    | {
        success: false;
        reason: "identity_mismatch" | "invalid_token";
      };

  const tokenRefreshService = {
    refresh(
      payload: unknown,
      username: string,
      token: string,
    ): TokenRefreshFakeResult {
      refreshes.push({
        payload,
        username,
        token,
      });

      return {
        success: true,
        payload: {
          userId: "user-1",
          username: "Anton",
          exp: 9999999999,
        },
      };
    },
  };

  return {
    broadcastService,
    whisperService,
    roomService,
    heartbeatService,
    tokenRefreshService,
    broadcasts,
    whispers,
    heartbeats,
    refreshes,
    joins,
  };
}

function createHandler() {
  const { socket, sent, closed } = createSocket();
  const meta = createMeta();
  const payload = createPayload();
  const deps = createDependencies();

  const handler = new MessageHandler(
    socket,
    meta,
    payload,
    deps.broadcastService,
    deps.whisperService,
    deps.roomService,
    deps.heartbeatService,
    deps.tokenRefreshService,
  );

  return {
    handler,
    socket,
    sent,
    closed,
    meta,
    payload,
    deps,
  };
}

describe("MessageHandler", () => {
  it("broadcasts binary messages", async () => {
    const { handler, deps } = createHandler();

    const data = Buffer.from("hello");

    await handler.handle(data, true);

    assert.deepEqual(deps.broadcasts, [
      {
        room: "general",
        data: Buffer.from("hello"),
      },
    ]);
  });

  it("rejects invalid JSON", async () => {
    const { handler, sent } = createHandler();

    await handler.handle(Buffer.from("{invalid"), false);

    assert.deepEqual(sent, [
      JSON.stringify({
        type: "error",
        message: "Некоректний JSON",
      }),
    ]);
  });
  it("broadcasts a normal chat message", async () => {
    const { handler, deps } = createHandler();

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "chat_message",
          username: "client",
          text: "hello",
          timestamp: 1,
        }),
      ),
      false,
    );

    assert.equal(deps.broadcasts.length, 1);

    const broadcast = deps.broadcasts[0]!;
    const message = broadcast.data as {
      type: string;
      username: string;
      text: string;
      timestamp: number;
    };

    assert.equal(broadcast.room, "general");
    assert.equal(message.type, "chat_message");
    assert.equal(message.username, "Anton");
    assert.equal(message.text, "hello");
    assert.equal(typeof message.timestamp, "number");
  });

  it("delegates whisper messages", async () => {
    const { handler, deps } = createHandler();

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "chat_message",
          username: "client",
          text: "/whisper Bob hello",
          timestamp: 1,
        }),
      ),
      false,
    );

    assert.equal(deps.whispers.length, 1);
    assert.deepEqual(deps.whispers[0], {
      socket:
        deps.whispers[0] && typeof deps.whispers[0] === "object"
          ? (deps.whispers[0] as { socket: WebSocket }).socket
          : undefined,
      username: "Anton",
      command: {
        recipientUsername: "Bob",
        text: "hello",
      },
    });
  });

  it("delegates ping handling", async () => {
    const { handler, deps } = createHandler();

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "ping",
          sentAt: 123,
        }),
      ),
      false,
    );

    assert.equal(deps.heartbeats.length, 1);
    assert.deepEqual(deps.heartbeats[0], {
      socket:
        deps.heartbeats[0] && typeof deps.heartbeats[0] === "object"
          ? (deps.heartbeats[0] as { socket: WebSocket }).socket
          : undefined,
      meta:
        deps.heartbeats[0] && typeof deps.heartbeats[0] === "object"
          ? (deps.heartbeats[0] as { meta: unknown }).meta
          : undefined,
      sentAt: 123,
    });
  });

  it("delegates join room handling", async () => {
    const { handler, deps } = createHandler();

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "join_room",
          room: "random",
        }),
      ),
      false,
    );

    assert.deepEqual(deps.joins, ["random"]);
  });

  it("handles token refresh", async () => {
    const { handler, meta, sent, deps } = createHandler();

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "refresh_token",
          token: "new-token",
        }),
      ),
      false,
    );

    assert.equal(meta.expiresAt, 9999999999);
    assert.equal(deps.refreshes.length, 1);
    assert.deepEqual(sent, [
      JSON.stringify({
        type: "token_refreshed",
        expiresAt: 9999999999,
      }),
    ]);
  });

  it("applies rate limit after the burst is exhausted", async () => {
    const { handler, sent, deps } = createHandler();

    const ping = Buffer.from(
      JSON.stringify({
        type: "ping",
        sentAt: 123,
      }),
    );

    for (let i = 0; i < 10; i++) {
      await handler.handle(ping, false);
    }

    assert.equal(deps.heartbeats.length, 10);
    assert.deepEqual(sent, []);

    await handler.handle(ping, false);

    assert.equal(deps.heartbeats.length, 10);
    assert.deepEqual(sent, [
      JSON.stringify({
        type: "error",
        message: "Занадто багато повідомлень, пригальмуй",
      }),
    ]);
  });

  it("closes the socket after five rate limit violations", async () => {
    const { handler, sent, closed } = createHandler();

    const ping = Buffer.from(
      JSON.stringify({
        type: "ping",
        sentAt: 123,
      }),
    );

    for (let i = 0; i < 15; i++) {
      await handler.handle(ping, false);
    }

    assert.equal(sent.length, 5);

    assert.deepEqual(closed, [
      {
        code: 1008,
        reason: "Rate limit violation",
      },
    ]);
  });

  it("does not apply rate limit to binary messages", async () => {
    const { handler, deps, sent } = createHandler();

    const binary = Buffer.from("hello");

    for (let i = 0; i < 11; i++) {
      await handler.handle(binary, true);
    }

    assert.equal(deps.broadcasts.length, 11);
    assert.deepEqual(sent, []);
  });

  it("updates lastActivity when a message is handled", async () => {
    const { handler, meta, deps } = createHandler();

    meta.lastActivity = 0;

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "ping",
          sentAt: 123,
        }),
      ),
      false,
    );

    assert.notEqual(meta.lastActivity, 0);
    assert.equal(deps.heartbeats.length, 1);
  });

  it("closes the socket when refreshed token has different identity", async () => {
    const { handler, closed, deps } = createHandler();

    deps.tokenRefreshService.refresh = () => ({
      success: false as const,
      reason: "identity_mismatch" as const,
    });

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "refresh_token",
          token: "different-user-token",
        }),
      ),
      false,
    );

    assert.deepEqual(closed, [
      {
        code: 1008,
        reason: "Token identity mismatch",
      },
    ]);
  });

  it("closes the socket when refresh token is invalid", async () => {
    const { handler, closed, deps } = createHandler();

    deps.tokenRefreshService.refresh = () => ({
      success: false as const,
      reason: "invalid_token" as const,
    });

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "refresh_token",
          token: "invalid-token",
        }),
      ),
      false,
    );

    assert.deepEqual(closed, [
      {
        code: 1008,
        reason: "Invalid refresh token",
      },
    ]);
  });

  it("closes the socket when joining a room fails", async () => {
    const { handler, closed, deps } = createHandler();

    deps.roomService.join = async () => {
      throw new Error("Presence unavailable");
    };

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "join_room",
          room: "random",
        }),
      ),
      false,
    );

    assert.deepEqual(closed, [
      {
        code: 1011,
        reason: "Presence unavailable",
      },
    ]);
  });

  it("handles application pong", async () => {
    const { handler, deps } = createHandler();

    await handler.handle(
      Buffer.from(
        JSON.stringify({
          type: "pong",
        }),
      ),
      false,
    );

    assert.equal(deps.heartbeats.length, 1);
  });
});
