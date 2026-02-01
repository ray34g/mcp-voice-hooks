// src/core/voice.ts
import type { UtteranceQueue } from "./queue.ts";
import type { Logger } from "./logger.ts";
import { noopLogger } from "./logger.ts";

export type VoicePreferences = {
  voiceResponsesEnabled: boolean;
  voiceInputActive: boolean;
};

export async function speakCore(args: {
  text: string;
  prefs: VoicePreferences;
  queue: UtteranceQueue;
  setLastSpeakTimestamp: (d: Date) => void;
  notifyTts: (text: string) => void;
  logger?: Logger;
}) {
  const {
    text,
    prefs,
    queue,
    setLastSpeakTimestamp,
    notifyTts,
    logger = noopLogger,
  } = args;

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
    notifyTts(text);
    logger.debug(`[Speak] Sent text to browser for TTS: "${text}"`);

    queue.addAssistantMessage(text);

    const respondedCount = queue.markRespondedDelivered();
    setLastSpeakTimestamp(new Date());

    return {
      ok: true as const,
      status: 200,
      body: { success: true, respondedCount },
    };
  } catch (e) {
    logger.debug(`[Speak] Failed: ${e}`);
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
