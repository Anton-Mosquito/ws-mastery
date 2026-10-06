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

const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("whisper"),
    from: z.string(),
    text: z.string(),
    timestamp: z.number(),
  }),
]);

const redisEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({
    instanceId: z.string().min(1),
    room: z.string().min(1),
    kind: z.literal("json"),
    message: messageSchema,
  }),

  z.object({
    instanceId: z.string().min(1),
    room: z.string().min(1),
    kind: z.literal("binary"),
    payload: z.string(),
  }),
]);

export { redisEnvelopeSchema, messageSchema, serverMessageSchema };
