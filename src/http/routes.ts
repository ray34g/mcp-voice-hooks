import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { debugLog } from "../debug.ts";
import { config } from "../config.ts";
import type { UtteranceQueue } from "../core/queue.ts";
import type { SseHub, VoicePreferences } from "../core/voice.ts";
import { speakCore, speakSystemMac } from "../core/voice.ts";
import {
  dequeueUtterancesCore,
  waitForUtteranceCore,
  validateAction,
  createHookHandler,
} from "../hooks/hooks.ts";

export function createApp(args: {
  queue: UtteranceQueue;
  prefs: VoicePreferences;
  sse: SseHub;
  getLastToolUseTimestamp: () => Date | null;
  getLastSpeakTimestamp: () => Date | null;
  setLastToolUseTimestamp: (d: Date) => void;
  setLastSpeakTimestamp: (d: Date) => void;
  onLastBrowserDisconnected: () => void;
}) {
  const {
    queue,
    prefs,
    sse,
    getLastToolUseTimestamp,
    getLastSpeakTimestamp,
    setLastToolUseTimestamp,
    setLastSpeakTimestamp,
    onLastBrowserDisconnected,
  } = args;

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(config.paths.dirname, "..", "public")));

  // ---- API: utterances ----
  app.post("/api/potential-utterances", (req: Request, res: Response) => {
    const { text, timestamp } = req.body ?? {};
    if (!text || !String(text).trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    const parsed = timestamp ? new Date(timestamp) : undefined;
    const u = queue.add(String(text), parsed);
    res.json({
      success: true,
      utterance: {
        id: u.id,
        text: u.text,
        timestamp: u.timestamp,
        status: u.status,
      },
    });
  });

  app.get("/api/utterances", (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const utterances = queue.getRecent(limit);
    res.json({
      utterances: utterances.map((u) => ({
        id: u.id,
        text: u.text,
        timestamp: u.timestamp,
        status: u.status,
      })),
    });
  });

  app.get("/api/conversation", (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const messages = queue.getRecentMessages(limit);
    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        timestamp: m.timestamp,
        status: m.status,
      })),
    });
  });

  app.get("/api/utterances/status", (_req, res) => {
    const total = queue.utterances.length;
    const pending = queue.utterances.filter((u) => u.status === "pending").length;
    const delivered = queue.utterances.filter((u) => u.status === "delivered").length;
    res.json({ total, pending, delivered });
  });

  app.post("/api/dequeue-utterances", (_req, res) => {
    res.json(dequeueUtterancesCore(queue));
  });

  app.post("/api/wait-for-utterances", async (_req, res) => {
    const result = await waitForUtteranceCore({ queue, prefs, sse });
    if (!result.success && (result as any).error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.get("/api/has-pending-utterances", (_req, res) => {
    const pendingCount = queue.utterances.filter((u) => u.status === "pending").length;
    res.json({ hasPending: pendingCount > 0, pendingCount });
  });

  app.post("/api/validate-action", (req, res) => {
    const r = validateAction({ action: req.body?.action, queue, prefs });
    res.status(r.status).json(r.body);
  });

  // ---- Hooks ----
  const handleHookRequest = createHookHandler({
    queue,
    prefs,
    sse,
    getLastToolUseTimestamp,
    getLastSpeakTimestamp,
    setLastToolUseTimestamp,
  });

  app.post("/api/hooks/stop", async (_req, res) => {
    res.json(await handleHookRequest("stop"));
  });
  app.post("/api/hooks/pre-speak", (_req, res) => {
    res.json(handleHookRequest("speak"));
  });
  app.post("/api/hooks/post-tool", (_req, res) => {
    res.json(handleHookRequest("post-tool"));
  });

  // ---- Delete ----
  app.delete("/api/utterances/:id", (req, res) => {
    const deleted = queue.deletePending(req.params.id);
    if (deleted) {
      res.json({ success: true, message: "Message deleted" });
    } else {
      res.status(400).json({ error: "Only pending messages can be deleted", success: false });
    }
  });

  app.delete("/api/utterances", (_req, res) => {
    const clearedCount = queue.utterances.length;
    queue.clear();
    res.json({ success: true, message: `Cleared ${clearedCount} utterances`, clearedCount });
  });

  // ---- SSE ----
  app.get("/api/tts-events", (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    res.write('data: {"type":"connected"}\n\n');
    sse.add(res);

    res.on("close", () => {
      sse.remove(res);
      if (sse.size() === 0) {
        debugLog("[SSE] Last browser disconnected, disabling voice features");
        if (prefs.voiceInputActive || prefs.voiceResponsesEnabled) {
          prefs.voiceInputActive = false;
          prefs.voiceResponsesEnabled = false;
        }
        onLastBrowserDisconnected();
      } else {
        debugLog(`[SSE] Browser disconnected, ${sse.size()} client(s) remaining`);
      }
    });
  });

  // ---- Voice prefs/state ----
  app.post("/api/voice-preferences", (req, res) => {
    prefs.voiceResponsesEnabled = !!req.body?.voiceResponsesEnabled;
    debugLog(`[Preferences] Updated: voiceResponses=${prefs.voiceResponsesEnabled}`);
    res.json({ success: true, preferences: prefs });
  });

  app.post("/api/voice-input-state", (req, res) => {
    prefs.voiceInputActive = !!req.body?.active;
    debugLog(`[Voice Input] ${prefs.voiceInputActive ? "Started" : "Stopped"} listening`);
    res.json({ success: true, voiceInputActive: prefs.voiceInputActive });
  });

  // ---- Speak ----
  app.post("/api/speak", async (req, res) => {
    const text = String(req.body?.text ?? "");
    const r = await speakCore({
      text,
      prefs,
      sse,
      queue,
      setLastSpeakTimestamp,
    });
    res.status(r.status).json(r.body);
  });

  app.post("/api/speak-system", async (req, res) => {
    const text = String(req.body?.text ?? "");
    const rate = Number(req.body?.rate ?? 150);
    if (!text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    try {
      await speakSystemMac(text, rate);
      debugLog(`[Speak System] Spoke text using macOS say: "${text}" (rate: ${rate})`);
      res.json({ success: true, message: "Text spoken successfully via system voice" });
    } catch (e) {
      debugLog(`[Speak System] Failed: ${e}`);
      res.status(500).json({
        error: "Failed to speak text via system voice",
        details: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // ---- UI routing ----
  app.get("/", (_req, res) => {
    const htmlFile = config.ui.useLegacy ? "legacy.html" : "index.html";
    debugLog(`[HTTP] Serving ${htmlFile} for root route`);
    res.sendFile(path.join(config.paths.dirname, "..", "public", htmlFile));
  });

  app.get("/legacy", (_req, res) => {
    res.sendFile(path.join(config.paths.dirname, "..", "public", "legacy.html"));
  });

  app.get("/messenger", (_req, res) => {
    res.sendFile(path.join(config.paths.dirname, "..", "public", "index.html"));
  });

  return app;
}
