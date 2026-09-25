// src/websocket/ConnectionMonitor.ts
import type { Redis } from "ioredis";
import type { ClientsType } from "../types/index.js";
import WebSocket, { type WebSocket as WsClient } from "ws";
import {
  MAX_BUFFERED_AMOUNT,
  IDLE_TIMEOUT,
  IDLE_CHECK_INTERVAL,
  INSTANCE_ID,
} from "../constants/index.js";
import { terminateSlowConsumer } from "../utils/index.js";

export class ConnectionMonitor {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private clients: ClientsType,
    private publisher: Redis,
  ) {}

  public start(intervalMs: number = IDLE_CHECK_INTERVAL): void {
    if (this.timer) return; // Запобігаємо повторному запуску

    this.timer = setInterval(async () => {
      await this.runChecks();
    }, intervalMs);

    console.log("🟢 Connection Monitor запущенно");
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("🔴 Connection Monitor зупинено");
    }
  }

  private async runChecks(): Promise<void> {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    // Один прохід по клієнтах замість 3-4 окремих циклів
    for (const [socket, meta] of this.clients) {
      const client = socket as WsClient;

      if (socket.readyState !== WebSocket.OPEN) continue;

      // 1. Перевірка на Slow Consumer (буфер)
      if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        terminateSlowConsumer(this.clients, socket);
        continue; // Сокет закривається, переходимо до наступного
      }

      // 2. Перевірка на Heartbeat (Ping/Pong)
      if (!meta.isAlive) {
        console.log(`💀 ${meta.username} не відповів на ping — термінуємо`);
        socket.terminate();
        continue;
      }

      // 3. Перевірка на протермінований JWT
      if (meta.expiresAt <= nowSec) {
        console.log(`🔐 ${meta.username}: JWT протерміновано`);
        socket.close(1008, "Token expired");
        continue;
      }

      // 4. Перевірка на Idle Timeout (неактивність)
      if (nowMs - meta.lastActivity > IDLE_TIMEOUT) {
        console.log(`⏳ ${meta.username}: idle timeout`);
        socket.close(1000, "Idle timeout");
        continue;
      }

      // Якщо всі перевірки пройдені — готуємо до наступного циклу ping
      meta.isAlive = false;
      socket.ping();

      // Оновлюємо статус у Redis
      this.publisher
        .setex(`user:${meta.username}:alive`, 60, INSTANCE_ID)
        .catch((err) => console.error("Redis status update error:", err));
    }
  }
}
