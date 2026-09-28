import { messageSchema } from "../schemas/index.js";
import type { ClientMessage } from "../types/index.js";

export type ParseClientMessageResult =
  | {
      success: true;
      message: ClientMessage;
    }
  | {
      success: false;
      errorMessage: "Некоректний JSON" | "Невірний формат повідомлення";
    };

export function parseClientMessage(raw: string): ParseClientMessageResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return {
      success: false,
      errorMessage: "Некоректний JSON",
    };
  }

  const parsed = messageSchema.safeParse(parsedJson);

  if (!parsed.success) {
    return {
      success: false,
      errorMessage: "Невірний формат повідомлення",
    };
  }

  return {
    success: true,
    message: parsed.data,
  };
}
