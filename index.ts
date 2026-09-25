import http, { type IncomingMessage } from "http";
import { readFileSync } from "fs";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { nanoid } from "nanoid";

import type {
  ClientMeta,
  TokenPayload,
  RoomsType,
  ClientMessage,
  RedisEnvelope,
  ClientsType,
} from "./src/types/index.js";
import { messageSchema } from "./src/schemas/index.js";
import {
  PORT,
  MAX_CONNECTIONS_PER_IP,
  ALLOWED_ORIGINS,
  INSTANCE_ID,
} from "./src/constants/index.js";
import {
  benchmarkBroadcast,
  localBroadcast,
  publisher,
  subscriber,
  setupSubscriber,
  toBuffer,
  getClientIp,
  sendToClient,
} from "./src/utils/index.js";
import {
  RateLimiter,
  getToken,
  verifyToken,
  ConnectionMonitor,
} from "./src/services/index.js";

console.log(`🆔 Instance ID: ${INSTANCE_ID}`);

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

const clients: ClientsType = new Map();
const clientsByUsername = new Map<string, WebSocket>();
const rooms: RoomsType = new Map();
const connectionsByIp = new Map<string, number>();

setupSubscriber((room, data) => {
  localBroadcast(rooms, room, data, clients);
});

const monitorService = new ConnectionMonitor(clients, publisher);

monitorService.start();

function logAuthFailure(request: IncomingMessage, reason: string) {
  console.warn(
    `🔐 Невдала автентифікація IP=${getClientIp(request)}: ${reason}`,
  );
}

async function broadcastPresence(roomName: string) {
  const users = await publisher.smembers(`room:${roomName}:users`);
  const message: ClientMessage = {
    type: "presence_update",
    users,
  };

  globalBroadcast(roomName, message);
}

// While room entering
async function joinRoomDistributed(socket: WebSocket, roomName: string) {
  const meta = clients.get(socket)!;
  const previousRoom = meta.room;

  // leave old room
  rooms.get(previousRoom)?.delete(socket);

  console.log(
    `📊 Кімната "${meta.room}": ${rooms.get(meta.room)?.size ?? 0} учасників`,
  );

  // join new room
  if (!rooms.has(roomName)) rooms.set(roomName, new Set());
  rooms.get(roomName)!.add(socket);

  // share state in Redis
  await publisher.srem(`room:${previousRoom}:users`, meta.username);
  await publisher.sadd(`room:${roomName}:users`, meta.username);

  meta.room = roomName;

  // Send actual lists all instances
  await broadcastPresence(previousRoom);
  if (previousRoom !== roomName) {
    await broadcastPresence(roomName);
  }
}

server.on("request", (req, res) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  if (url.pathname === "/messages.proto") {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      Vary: "Origin",
    });
    res.end(readFileSync("messages.proto", "utf8"));
    return;
  }

  if (url.pathname !== "/login") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      Vary: "Origin",
      Allow: "GET",
    });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const username =
    url.searchParams.get("username")?.trim() || `Гість-${nanoid(4)}`;
  const userId = url.searchParams.get("userId")?.trim() || nanoid(8);

  const token = getToken(username, userId);

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    Vary: "Origin",
  });
  res.end(JSON.stringify({ token, expiresIn: "1h", userId, username }));
});

server.on("upgrade", (request, socket, head) => {
  const origin = request.headers.origin;
  const clientIp = getClientIp(request);

  if ((connectionsByIp.get(clientIp) ?? 0) >= MAX_CONNECTIONS_PER_IP) {
    logAuthFailure(request, "перевищено ліміт з'єднань");

    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
    return;
  }

  // 1️⃣ Перевірка Origin
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    logAuthFailure(request, `відхилений Origin: ${origin ?? "відсутній"}`);
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  // Витягуємо токен з query-параметра
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    logAuthFailure(request, "відсутній токен");
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    logAuthFailure(request, "невалідний або прострочений токен");
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // 2️⃣ Якщо все ок — завершуємо handshake
  wss.handleUpgrade(request, socket, head, (ws) => {
    connectionsByIp.set(clientIp, (connectionsByIp.get(clientIp) ?? 0) + 1);
    // Прокидуємо дані користувача далі
    wss.emit("connection", ws, request, payload, clientIp);
  });
});

wss.on(
  "connection",
  (
    socket: WebSocket,
    request: IncomingMessage,
    payload: TokenPayload,
    clientIp: string,
  ) => {
    const limiter = new RateLimiter(10, 5); // 10 повідомлень бурстом, поповнення 5/сек
    let violations = 0;
    const { username, userId, exp } = payload;

    console.log("🌐 Origin:", request.headers.origin);
    console.log("🔍 Всі заголовки:", request.headers);
    console.log(`✅ Автентифіковано: ${username} (${userId})`);

    const meta: ClientMeta = {
      id: nanoid(8),
      username,
      room: "lobby",
      isAlive: true,
      expiresAt: exp,
      lastActivity: Date.now(),
    };

    clients.set(socket, meta);
    clientsByUsername.set(meta.username, socket);

    void joinRoomDistributed(socket, "lobby")
      .then(() => {
        const message: ClientMessage = {
          type: "system",
          text: `${meta.username} приєднався до кімнати`,
        };

        globalBroadcast("lobby", message);
      })
      .catch((error) => {
        console.error(
          `💥 Presence join error for ${meta.username}:`,
          error.message,
        );
        socket.close(1011, "Presence unavailable");
      });

    console.log(
      `🔗 ${meta.username} (${meta.id}) підключився. Всього клієнтів: ${clients.size}`,
    );

    socket.on("message", async (data: RawData, isBinary: boolean) => {
      meta.lastActivity = Date.now();
      if (isBinary) {
        const payload = toBuffer(data);
        console.log(`📦 Бінарний фрейм, ${payload.length} байт`);
        globalBroadcast(meta.room, payload);
        return;
      } else {
        console.log(`📝 Текстовий фрейм:`, data.toString());
      }

      if (!limiter.tryConsume()) {
        violations++;
        console.log(
          `⚠️ Rate limit перевищено (${violations}) для ${payload.username}`,
        );

        socket.send(
          JSON.stringify({
            type: "error",
            message: "Занадто багато повідомлень, пригальмуй",
          }),
        );

        if (violations >= 5) {
          socket.close(1008, "Rate limit violation");
        }
        return;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(data.toString());
      } catch {
        socket.send(
          JSON.stringify({ type: "error", message: "Некоректний JSON" }),
        );
        return;
      }

      const parsed = messageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Невірний формат повідомлення",
          }),
        );
        return;
      }

      const message: ClientMessage = parsed.data;

      if (message.type === "chat_message") {
        const text = message.text;
        const whisperMatch = text.match(/^\/whisper\s+(\S+)\s+(.+)$/s);

        if (whisperMatch) {
          const recipientUsername = whisperMatch[1];
          const whisperText = whisperMatch[2];
          if (!recipientUsername || !whisperText) return;

          const recipient = clientsByUsername.get(recipientUsername);

          if (!recipient || recipient.readyState !== WebSocket.OPEN) {
            sendToClient(
              socket,
              {
                type: "error",
                message: `Користувача "${recipientUsername}" не знайдено`,
              },
              clients,
            );
            return;
          }

          sendToClient(
            recipient,
            {
              type: "whisper",
              from: meta.username,
              text: whisperText.trim(),
              timestamp: Date.now(),
            },
            clients,
          );
          return;
        }

        const clientMessage: ClientMessage = {
          type: "chat_message",
          username: meta.username,
          text,
          timestamp: Date.now(),
        };
        globalBroadcast(meta.room, clientMessage);
        return;
      }

      if (message.type === "join_room") {
        const roomName = message.room;
        const previousRoom = meta.room;
        const systemLeftMessage: ClientMessage = {
          type: "system",
          text: `${meta.username} залишив кімнату`,
        };

        globalBroadcast(previousRoom, systemLeftMessage);

        try {
          await joinRoomDistributed(socket, roomName);
        } catch (error) {
          console.error(
            `💥 Presence room change error for ${meta.username}:`,
            error instanceof Error ? error.message : error,
          );
          socket.close(1011, "Presence unavailable");
          return;
        }

        const systemJoinMessage: ClientMessage = {
          type: "system",
          text: `${meta.username} приєднався до кімнати`,
        };

        globalBroadcast(roomName, systemJoinMessage, socket);
        socket.send(JSON.stringify({ type: "room_joined", room: roomName }));
      }

      if (message.type === "ping") {
        meta.isAlive = true;
        socket.send(
          JSON.stringify({
            type: "pong",
            sentAt: message.sentAt ?? Date.now(),
          }),
        );
      }

      if (message.type === "refresh_token") {
        try {
          const refreshedPayload = verifyToken(message.token);
          if (
            refreshedPayload.userId !== payload.userId ||
            refreshedPayload.username !== meta.username
          ) {
            socket.close(1008, "Token identity mismatch");
            return;
          }

          meta.expiresAt = refreshedPayload.exp;
          socket.send(
            JSON.stringify({
              type: "token_refreshed",
              expiresAt: refreshedPayload.exp,
            }),
          );
        } catch (error) {
          console.log(
            `🚫 ${meta.username}: невдале оновлення JWT: ${(error as Error).message}`,
          );
          socket.close(1008, "Invalid refresh token");
        }
        return;
      }

      if (message.type === "pong") {
        meta.isAlive = true;
      }
    });

    socket.on("close", async () => {
      const meta = clients.get(socket)!;
      await publisher.srem(`room:${meta.room}:users`, meta.username);

      globalBroadcast(
        meta.room,
        {
          type: "system",
          text: `${meta.username} вийшов із кімнати`,
        },
        socket,
      );

      rooms.get(meta.room)?.delete(socket);

      console.log(
        `📊 Кімната "${meta.room}": ${rooms.get(meta.room)?.size ?? 0} учасників`,
      );

      clients.delete(socket);
      clientsByUsername.delete(meta.username);

      const remaining = (connectionsByIp.get(clientIp) ?? 1) - 1;

      if (remaining > 0) connectionsByIp.set(clientIp, remaining);
      else connectionsByIp.delete(clientIp);

      void broadcastPresence(meta.room).catch((error) => {
        console.error(
          `💥 Presence leave error for ${meta.username}:`,
          error.message,
        );
      });
    });

    socket.on("pong", () => {
      meta.isAlive = true;
      console.log(`💓 Pong від ${meta.username}`);
    });
  },
);

benchmarkBroadcast(rooms, globalBroadcast);

async function handleShutdown() {
  console.log("Shutting down server...");
  console.log("🛑 Graceful shutdown...");

  for (const [socket, meta] of clients) {
    await publisher.srem(`room:${meta.room}:users`, meta.username);
    socket.close(1001, "Server shutting down");
  }

  await publisher.quit();
  await subscriber.quit();
  monitorService.stop();

  wss.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

// Глобальний broadcast: локально + публікація в Redis
function globalBroadcast(
  roomName: string,
  data: ClientMessage | Buffer,
  excludeSocket?: WebSocket,
) {
  // 1. Відправляємо локальним сокетам на цій ноді
  localBroadcast(rooms, roomName, data, clients, excludeSocket);

  // 2. Визначаємо тип і формуємо об'єкт для Redis
  const isBinary = Buffer.isBuffer(data);

  const redisPayload = isBinary
    ? {
        instanceId: INSTANCE_ID,
        kind: "binary",
        room: roomName,
        payload: data.toString("base64"),
      }
    : {
        instanceId: INSTANCE_ID,
        kind: "json",
        room: roomName,
        message: data,
      };

  publisher
    .publish("ws:broadcast", JSON.stringify(redisPayload))
    .catch((error) => {
      console.error(
        `💥 Redis ${isBinary ? "binary " : ""}publish error:`,
        error.message,
      );
    });
}

console.log("🚀 WS-сервер запущено на ws://localhost:8080");

server.listen(PORT, () =>
  console.log(`🚀 Інстанс на порту ${PORT} (PID ${process.pid})`),
);
