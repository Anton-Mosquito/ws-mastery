import { Redis } from "ioredis";

export const publisher = new Redis({
  host: "localhost",
  port: 6379,
});

export const subscriber = new Redis({
  host: "localhost",
  port: 6379,
});

publisher.on("error", (error) => {
  console.error("💥 Redis publisher error:", error.message);
});

subscriber.on("error", (error) => {
  console.error("💥 Redis subscriber error:", error.message);
});

publisher.on("reconnecting", () => {
  console.warn("🔁 Redis publisher reconnecting");
});

subscriber.on("reconnecting", () => {
  console.warn("🔁 Redis subscriber reconnecting");
});
