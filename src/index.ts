#!/usr/bin/env node

import { debugLog } from "./runtime/debugLogger.ts";
import { UtteranceQueue } from "./core/queue.ts";
import { SseHub } from "./http/sseHub.ts";
import type { SseController, SseNotifiers } from "./http/sseTypes.ts";
import type { VoicePreferences } from "./core/voice.ts";
import { createApp } from "./http/routes.ts";
import { config } from "./runtime/config.ts";
import { createMcpServer } from "./mcp/server.ts";
import { attachHttpMcpEndpoint } from "./mcp/httpEndpoint.ts";
import { connectStdioMcp } from "./mcp/stdio.ts";

export async function main() {
  const queue = new UtteranceQueue();
  const sse = new SseHub();

  const sseController: SseController = {
    addClient: (res) => sse.add(res),
    removeClient: (res) => sse.remove(res),
    clientCount: () => sse.size(),
  };

  const notify: SseNotifiers = {
    notifyTts: (text) => sse.notifyTts(text),
    notifyWaitStatus: (v) => sse.notifyWaitStatus(v),
  };

  const prefs: VoicePreferences = {
    voiceResponsesEnabled: false,
    voiceInputActive: false,
  };

  let lastToolUseTimestamp: Date | null = null;
  let lastSpeakTimestamp: Date | null = null;

  const app = createApp({
    queue,
    prefs,
    sseController,
    notify,
    getLastToolUseTimestamp: () => lastToolUseTimestamp,
    getLastSpeakTimestamp: () => lastSpeakTimestamp,
    setLastToolUseTimestamp: (d) => (lastToolUseTimestamp = d),
    setLastSpeakTimestamp: (d) => (lastSpeakTimestamp = d),
    onLastBrowserDisconnected: () => {
      // Do nothing for now
    },
  });

  const mcpServer = createMcpServer({
    prefs,
    queue,
    setLastSpeakTimestamp: (d) => (lastSpeakTimestamp = d),
    notifyTts: (t) => notify.notifyTts(t), // ← 既存の notify を流用
  });

  if (config.mcp.transport === "http") {
    await attachHttpMcpEndpoint({ app, mcpServer });
  } else if (config.mcp.transport === "stdio" && config.mcp.isManaged) {
    console.error("[MCP] Initializing MCP server...");
    await connectStdioMcp(mcpServer);
    console.error("[MCP] Server connected via stdio");
  }

  app.listen(config.http.port, async () => {
    const log = config.mcp.isManaged ? console.error : console.log;
    log(`[HTTP] Server listening on http://localhost:${config.http.port}`);
    log(`[Mode] Running in ${config.mcp.isManaged ? "MCP-managed" : "standalone"} mode`);

    if (config.mcp.isManaged && config.ui.autoOpenBrowser) {
      setTimeout(async () => {
        if (sseController.clientCount() === 0) {
          debugLog("[Browser] No frontend connected, opening browser...");
          try {
            const open = (await import("open")).default;
            await open(`${config.http.externalUrl}`);
          } catch (e) {
            debugLog("[Browser] Failed to open browser:", e as any);
          }
        } else {
          debugLog(`[Browser] Frontend already connected (${sseController.clientCount()} client(s))`);
        }
      }, 3000);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}