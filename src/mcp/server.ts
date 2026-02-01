// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { VoicePreferences } from "../core/voice.ts";
import type { UtteranceQueue } from "../core/queue.ts";
import { speakCore } from "../core/voice.ts";

export function createMcpServer(args: {
  prefs: VoicePreferences;
  queue: UtteranceQueue;
  setLastSpeakTimestamp: (d: Date) => void;
  notifyTts: (text: string) => void;
}) {
  const { prefs, queue, setLastSpeakTimestamp, notifyTts } = args;

  const SpeakInputSchema = z
    .object({ text: z.string() })
    .strict() as any;

  const server = new McpServer({ name: "voice-hooks", version: "1.0.0" });

  const registerTool = (server as any).registerTool.bind(server) as (
    name: string,
    meta: { description?: string; inputSchema: unknown },
    handler: (raw: unknown) => Promise<{ content: Array<{ type: "text"; text: string }> }>
  ) => void;

  registerTool(
    "speak",
    {
      description:
        "Speak text using text-to-speech and mark delivered utterances as responded",
      inputSchema: SpeakInputSchema,
    },
    async (raw: unknown) => {
      const parsed = (SpeakInputSchema as any).safeParse(raw);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: "Error: invalid input (expected { text: string })" }],
        };
      }

      const text = String(parsed.data.text ?? "").trim();
      if (!text) {
        return { content: [{ type: "text", text: "Error speaking text: Text is required" }] };
      }

      const r = await speakCore({
        text,
        prefs,
        queue,
        setLastSpeakTimestamp,
        notifyTts,
      });

      if (!r.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error speaking text: ${(r.body as any).error || "Unknown error"}`,
            },
          ],
        };
      }

      return { content: [{ type: "text", text: "" }] };
    }
  );

  return server;
}
