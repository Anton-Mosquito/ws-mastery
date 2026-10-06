import type { WhisperCommand } from "../types/index.js";

export function parseWhisperCommand(text: string): WhisperCommand | null {
  const match = text.match(/^\/whisper\s+(\S+)\s+(.+)$/s);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    recipientUsername: match[1],
    text: match[2].trim(),
  };
}
