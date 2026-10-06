import { WebSocket } from "ws";

import type { ClientsType } from "../types/index.js";
import type { WhisperCommand } from "../types/index.js";
import { sendToClient } from "../utils/send-to-client.js";

export class WhisperService {
  constructor(
    private readonly clientsByUsername: Map<string, WebSocket>,
    private readonly clients: ClientsType,
  ) {}

  handle(
    sender: WebSocket,
    senderUsername: string,
    command: WhisperCommand,
  ): boolean {
    const recipient = this.clientsByUsername.get(command.recipientUsername);

    if (!recipient || recipient.readyState !== WebSocket.OPEN) {
      sendToClient(
        sender,
        {
          type: "error",
          message: `Користувача "${command.recipientUsername}" не знайдено`,
        },
        this.clients,
      );

      return true;
    }

    sendToClient(
      recipient,
      {
        type: "whisper",
        from: senderUsername,
        text: command.text,
        timestamp: Date.now(),
      },
      this.clients,
    );

    return true;
  }
}
