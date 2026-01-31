import type { Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { debugLog } from "../debug.ts";
import type { UtteranceQueue } from "./queue.ts";

const execAsync = promisify(exec);

export type VoicePreferences = {
  voiceResponsesEnabled: boolean;
  voiceInputActive: boolean;
};

export class SseHub {
  clients = new Set<Response>();

  add(res: Response) {
    this.clients.add(res);
  }
  remove(res: Response) {
    this.clients.delete(res);
  }
  size() {
    return this.clients.size;
  }

  send(payload: unknown) {
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    this.clients.forEach((c) => c.write(msg));
  }

  notifyTts(text: string) {
    this.send({ type: "speak", text });
  }

  notifyWaitStatus(isWaiting: boolean) {
    this.send({ type: "waitStatus", isWaiting });
  }
}

export async function playNotificationSound() {
  try {
    await execAsync("afplay /System/Library/Sounds/Funk.aiff");
    debugLog("[Sound] Played notification sound");
  } catch (e) {
    debugLog(`[Sound] Failed to play sound: ${e}`);
  }
}

export function getVoiceResponseReminder(prefs: VoicePreferences): string {
  return prefs.voiceResponsesEnabled
    ? "\n\nThe user has enabled voice responses, so use the 'speak' tool to respond to the user's voice input before proceeding."
    : "";
}

export async function speakCore(args: {
  text: string;
  prefs: VoicePreferences;
  sse: SseHub;
  queue: UtteranceQueue;
  setLastSpeakTimestamp: (d: Date) => void;
}) {
  const { text, prefs, sse, queue, setLastSpeakTimestamp } = args;

  if (!text || !text.trim()) {
    return { ok: false as const, status: 400, body: { error: "Text is required" } };
  }
  if (!prefs.voiceResponsesEnabled) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "Voice responses are disabled" },
    };
  }

  try {
    sse.notifyTts(text);
    debugLog(`[Speak] Sent text to browser for TTS: "${text}"`);

    queue.addAssistantMessage(text);

    const respondedCount = queue.markRespondedDelivered();
    setLastSpeakTimestamp(new Date());

    return {
      ok: true as const,
      status: 200,
      body: { success: true, respondedCount },
    };
  } catch (e) {
    debugLog(`[Speak] Failed: ${e}`);
    return {
      ok: false as const,
      status: 500,
      body: {
        error: "Failed to speak text",
        details: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

export async function speakSystemMac(text: string, rate = 150) {
  await execAsync(`say -r ${rate} "${text.replace(/"/g, '\\"')}"`);
}
