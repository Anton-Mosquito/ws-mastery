import type { ClientMessage, RedisEnvelope } from "../types/index.js";
import { redisEnvelopeSchema } from "../schemas/index.js";
import { INSTANCE_ID } from "../constants/index.js";

type BroadcastHandler = (room: string, data: Buffer | ClientMessage) => void;

interface RedisSubscriber {
  subscribe(channel: string, callback: (error?: Error | null) => void): void;

  on(event: "message", listener: (channel: string, raw: string) => void): void;
}

export class RedisBroadcastSubscriber {
  constructor(
    private readonly redisSubscriber: RedisSubscriber,
    private readonly instanceId: string = INSTANCE_ID,
  ) {}

  start(onBroadcast: BroadcastHandler) {
    this.redisSubscriber.subscribe("ws:broadcast", (error) => {
      if (error) {
        console.error("💥 Помилка підписки:", error);
      } else {
        console.log("📡 Підписано на ws:broadcast");
      }
    });

    this.redisSubscriber.on("message", (channel, raw) => {
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

      if (envelope.instanceId === this.instanceId) return;

      console.log(`📥 Отримано з Redis: ${envelope.room}`);

      if (envelope.kind === "binary") {
        onBroadcast(envelope.room, Buffer.from(envelope.payload, "base64"));
        return;
      }

      onBroadcast(envelope.room, envelope.message);
    });
  }
}
