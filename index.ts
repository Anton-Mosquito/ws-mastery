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
  ClientsType,
} from "./src/types/index.js";
import {
  PORT,
  MAX_CONNECTIONS_PER_IP,
  ALLOWED_ORIGINS,
  INSTANCE_ID,
} from "./src/constants/index.js";
import {
  benchmarkBroadcast,
  localBroadcast,
  toBuffer,
  getClientIp,
  parseClientMessage,
  parseWhisperCommand,
} from "./src/utils/index.js";
import {
  RateLimiter,
  getToken,
  verifyToken,
  ConnectionMonitor,
  BroadcastService,
  RoomManager,
  PresenceService,
  publisher,
  subscriber,
  RedisBroadcastSubscriber,
  WhisperService,
  RoomService,
  TokenRefreshService,
  HeartbeatService,
  ClientRegistry,
  ConnectionCleanupService,
} from "./src/services/index.js";

console.log(`🆔 Instance ID: ${INSTANCE_ID}`);

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

const clients: ClientsType = new Map();
const clientsByUsername = new Map<string, WebSocket>();
const clientRegistry = new ClientRegistry(clients, clientsByUsername);
const whisperService = new WhisperService(clientsByUsername, clients);
const rooms: RoomsType = new Map();
const connectionsByIp = new Map<string, number>();
const roomManager = new RoomManager(rooms, clients);
const presenceService = new PresenceService(publisher);
const redisBroadcastSubscriber = new RedisBroadcastSubscriber(subscriber);

const broadcastService = new BroadcastService(
  rooms,
  clients,
  publisher,
  INSTANCE_ID,
);

const roomService = new RoomService(
  roomManager,
  presenceService,
  clients,
  broadcastPresence,
);

const tokenRefreshService = new TokenRefreshService(verifyToken);
const heartbeatService = new HeartbeatService();

const connectionCleanupService = new ConnectionCleanupService(
  clientRegistry,
  roomManager,
  presenceService,
  broadcastService,
  broadcastPresence,
  connectionsByIp,
  rooms,
);

redisBroadcastSubscriber.start((room, data) => {
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
  const users = await presenceService.getUsers(roomName);

  const message: ClientMessage = {
    type: "presence_update",
    users,
  };

  broadcastService.broadcast(roomName, message);
}

// // While room entering
// async function joinRoomDistributed(socket: WebSocket, roomName: string) {
//   const meta = clients.get(socket)!;
//   const previousRoom = roomManager.join(socket, roomName);

//   console.log(
//     `📊 Кімната "${meta.room}": ${rooms.get(meta.room)?.size ?? 0} учасників`,
//   );

//   // share state in Redis
//   await presenceService.removeUser(previousRoom, meta.username);
//   await presenceService.addUser(roomName, meta.username);

//   // Send actual lists all instances
//   await broadcastPresence(previousRoom);
//   if (previousRoom !== roomName) {
//     await broadcastPresence(roomName);
//   }
// }

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
    const { username, userId } = payload;

    console.log("🌐 Origin:", request.headers.origin);
    console.log("🔍 Всі заголовки:", request.headers);
    console.log(`✅ Автентифіковано: ${username} (${userId})`);

    const meta = clientRegistry.register(socket, payload);

    const previousRoom = meta.room;

    void roomService
      .join(socket, "lobby")
      .then(() => {
        console.log(
          `📊 Кімната "${previousRoom}": ${
            rooms.get(previousRoom)?.size ?? 0
          } учасників`,
        );

        const message: ClientMessage = {
          type: "system",
          text: `${meta.username} приєднався до кімнати`,
        };

        broadcastService.broadcast("lobby", message);
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
        broadcastService.broadcast(meta.room, payload);
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

      const parsed = parseClientMessage(data.toString());

      if (!parsed.success) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: parsed.errorMessage,
          }),
        );
        return;
      }

      const message: ClientMessage = parsed.message;

      if (message.type === "chat_message") {
        const text = message.text;
        const whisper = parseWhisperCommand(text);

        if (whisper) {
          whisperService.handle(socket, meta.username, whisper);
          return;
        }

        const clientMessage: ClientMessage = {
          type: "chat_message",
          username: meta.username,
          text,
          timestamp: Date.now(),
        };

        broadcastService.broadcast(meta.room, clientMessage);
        return;
      }

      if (message.type === "join_room") {
        const roomName = message.room;
        const previousRoom = meta.room;
        const systemLeftMessage: ClientMessage = {
          type: "system",
          text: `${meta.username} залишив кімнату`,
        };

        broadcastService.broadcast(previousRoom, systemLeftMessage);

        try {
          await roomService.join(socket, roomName);
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

        broadcastService.broadcast(roomName, systemJoinMessage, socket);
        socket.send(JSON.stringify({ type: "room_joined", room: roomName }));
      }

      if (message.type === "ping") {
        heartbeatService.handlePing(socket, meta, message.sentAt);
      }

      if (message.type === "refresh_token") {
        const result = tokenRefreshService.refresh(
          payload,
          meta.username,
          message.token,
        );

        if (!result.success) {
          if (result.reason === "identity_mismatch") {
            socket.close(1008, "Token identity mismatch");
            return;
          }

          socket.close(1008, "Invalid refresh token");
          return;
        }

        meta.expiresAt = result.payload.exp;

        socket.send(
          JSON.stringify({
            type: "token_refreshed",
            expiresAt: result.payload.exp,
          }),
        );

        return;
      }

      if (message.type === "pong") {
        heartbeatService.markAlive(meta);
      }
    });

    socket.on("close", () => {
      void connectionCleanupService.cleanup(socket, clientIp);
    });

    socket.on("pong", () => {
      heartbeatService.markAlive(meta);
      console.log(`💓 Pong від ${meta.username}`);
    });
  },
);

benchmarkBroadcast(rooms, (room, data, excludeSocket) =>
  broadcastService.broadcast(room, data, excludeSocket),
);

async function handleShutdown() {
  console.log("Shutting down server...");
  console.log("🛑 Graceful shutdown...");

  for (const [socket, meta] of clients) {
    await presenceService.removeUser(meta.room, meta.username);
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

console.log("🚀 WS-сервер запущено на ws://localhost:8080");

server.listen(PORT, () =>
  console.log(`🚀 Інстанс на порту ${PORT} (PID ${process.pid})`),
);
