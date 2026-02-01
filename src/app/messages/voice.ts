// src/messages/voice.ts
import type { VoicePreferences } from "../../core/voice.ts";

export function getVoiceResponseReminder(prefs: VoicePreferences): string {
  return prefs.voiceResponsesEnabled
    ? "\n\nThe user has enabled voice responses, so use the 'speak' tool to respond to the user's voice input before proceeding."
    : "";
}
