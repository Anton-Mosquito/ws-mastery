import { Redis } from "ioredis";
import type { RedisEnvelope } from "../types/index.js";
import { redisEnvelopeSchema } from "../schemas/index.js";
import { INSTANCE_ID } from "../constants/index.js";
import { localBroadcast } from "./local-broadcast.js";
import { isRecord } from "./type-guards.js";

// ⚠️ ДВА окремі з'єднання — це обов'язково
export const publisher = new Redis({ host: "localhost", port: 6379 });
export const subscriber = new Redis({ host: "localhost", port: 6379 });

publisher.on("error", (error) => {
  console.error("💥 Redis publisher error:", error.message);
});
subscriber.on("error", (error) => {
  console.error("💥 Redis subscriber error:", error.message);
});
publisher.on("reconnecting", () =>
  console.warn("🔁 Redis publisher reconnecting"),
);

subscriber.on("reconnecting", () =>
  console.warn("🔁 Redis subscriber reconnecting"),
);

// Підписуємось на глобальний канал broadcast'ів
subscriber.subscribe("ws:broadcast", (err) => {
  if (err) console.error("💥 Помилка підписки:", err);
  else console.log("📡 Підписано на ws:broadcast");
});

subscriber.on("message", (channel, raw) => {
  if (channel !== "ws:broadcast") return;

  let envelope: RedisEnvelope;
  try {
    const parsed = redisEnvelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn("⚠️ Некоректний Redis envelope");
      return;
    }
    envelope = parsed.data;
  } catch {
    console.warn("⚠️ Redis message не є валідним JSON");
    return;
  }

  // Ігноруємо власні повідомлення (ми вже надіслали їх локально)
  if (envelope.instanceId === INSTANCE_ID) return;

  console.log(`📥 Отримано з Redis: ${envelope.room}`);

  if (envelope.kind === "binary") {
    if (!envelope.payload) return;
    localBroadcast(envelope.room, Buffer.from(envelope.payload, "base64"));
    return;
  }

  if (envelope.message === undefined || !isRecord(envelope.message)) return;

  localBroadcast(rooms, envelope.room, envelope.message, clients);
});
