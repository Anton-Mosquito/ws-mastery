import { type IncomingMessage } from "http";
import { WebSocket } from "ws";
import type { RawData } from "ws";

import type { TokenPayload, ClientMessage } from "../types/index.js";
import { MAX_CONNECTIONS_PER_IP } from "../constants/index.js";
import { getClientIp } from "../utils/get-client-ip.js";

import type { ApplicationContext } from "../create-application.js";
import { MessageHandler } from "../services/message-handler.js";

function logAuthFailure(request: IncomingMessage, reason: string) {
  console.warn(
    `🔐 Невдала автентифікація IP=${getClientIp(request)}: ${reason}`,
  );
}

export function registerWebSocketHandlers(
  application: ApplicationContext,
): void {
  application.server.on("upgrade", (request, socket, head) => {
    const clientIp = getClientIp(request);

    if (
      (application.connectionsByIp.get(clientIp) ?? 0) >= MAX_CONNECTIONS_PER_IP
    ) {
      logAuthFailure(request, "перевищено ліміт з'єднань");

      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    const authResult = application.webSocketAuthService.authenticate(request);

    if (!authResult.success) {
      logAuthFailure(request, authResult.reason);

      const statusText =
        authResult.statusCode === 403 ? "Forbidden" : "Unauthorized";

      socket.write(`HTTP/1.1 ${authResult.statusCode} ${statusText}\r\n\r\n`);
      socket.destroy();
      return;
    }

    const { payload } = authResult;

    // 2️⃣ Якщо все ок — завершуємо handshake
    application.wss.handleUpgrade(request, socket, head, (ws) => {
      application.connectionsByIp.set(
        clientIp,
        (application.connectionsByIp.get(clientIp) ?? 0) + 1,
      );
      // Прокидуємо дані користувача далі
      application.wss.emit("connection", ws, request, payload, clientIp);
    });
  });

  application.wss.on(
    "connection",
    (
      socket: WebSocket,
      request: IncomingMessage,
      payload: TokenPayload,
      clientIp: string,
    ) => {
      const { username, userId } = payload;

      console.log("🌐 Origin:", request.headers.origin);
      console.log("🔍 Всі заголовки:", request.headers);
      console.log(`✅ Автентифіковано: ${username} (${userId})`);

      const meta = application.clientRegistry.register(socket, payload);

      const messageHandler = new MessageHandler(
        socket,
        meta,
        payload,
        application.broadcastService,
        application.whisperService,
        application.roomService,
        application.heartbeatService,
        application.tokenRefreshService,
      );

      const previousRoom = meta.room;

      void application.roomService
        .join(socket, "lobby")
        .then(() => {
          console.log(
            `📊 Кімната "${previousRoom}": ${
              application.rooms.get(previousRoom)?.size ?? 0
            } учасників`,
          );

          const message: ClientMessage = {
            type: "system",
            text: `${meta.username} приєднався до кімнати`,
          };

          application.broadcastService.broadcast("lobby", message);
        })
        .catch((error) => {
          console.error(
            `💥 Presence join error for ${meta.username}:`,
            error.message,
          );
          socket.close(1011, "Presence unavailable");
        });

      console.log(
        `🔗 ${meta.username} (${meta.id}) підключився. Всього клієнтів: ${application.clients.size}`,
      );

      socket.on("message", async (data: RawData, isBinary: boolean) => {
        void messageHandler.handle(data, isBinary);
      });

      socket.on("close", () => {
        application.connectionLifecycleService.handleClose(socket, clientIp);
      });

      socket.on("pong", () => {
        application.connectionLifecycleService.handlePong(meta);
      });
    },
  );
}
