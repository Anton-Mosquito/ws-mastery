import { z } from "zod";

const messageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chat_message"),
    text: z.string().trim().min(1),
    username: z.string(),
    timestamp: z.number(),
  }),
  z.object({ type: z.literal("join_room"), room: z.string().trim().min(1) }),
  z.object({ type: z.literal("ping"), sentAt: z.number().optional() }),
  z.object({ type: z.literal("pong"), sentAt: z.number().optional() }),
  z.object({ type: z.literal("refresh_token"), token: z.string().min(1) }),
  z.object({ type: z.literal("presence_update"), users: z.array(z.string()) }),
  z.object({ type: z.literal("system"), text: z.string().trim().min(1) }),
]);

const redisEnvelopeSchema = z.object({
  instanceId: z.string().min(1),
  room: z.string().min(1),
  kind: z.enum(["json", "binary"]).default("json"),
  message: messageSchema,
  payload: z.string().optional(),
});

type ClientMessage = z.infer<typeof messageSchema>;
type RedisEnvelope = z.infer<typeof redisEnvelopeSchema>;

export {
  redisEnvelopeSchema,
  messageSchema,
  type ClientMessage,
  type RedisEnvelope,
};
