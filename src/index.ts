#!/usr/bin/env node

import { debugLog } from "./debug.ts";
import { UtteranceQueue } from "./core/queue.ts";
import { SseHub, type VoicePreferences } from "./core/voice.ts";
import { createApp } from "./http/routes.ts";
import { config } from "./config.ts";

import { createMcpServer, attachHttpMcpEndpoint, connectStdioMcp } from "./mcp/server.ts";

export async function main() {
  const queue = new UtteranceQueue();
  const sse = new SseHub();

  const prefs: VoicePreferences = {
    voiceResponsesEnabled: false,
    voiceInputActive: false,
  };

  let lastToolUseTimestamp: Date | null = null;
  let lastSpeakTimestamp: Date | null = null;

  const app = createApp({
    queue,
    prefs,
    sse,
    getLastToolUseTimestamp: () => lastToolUseTimestamp,
    getLastSpeakTimestamp: () => lastSpeakTimestamp,
    setLastToolUseTimestamp: (d) => (lastToolUseTimestamp = d),
    setLastSpeakTimestamp: (d) => (lastSpeakTimestamp = d),
    onLastBrowserDisconnected: () => {
      // Do nothing for now
    },
  });

  // MCP
  const mcpServer = createMcpServer({
    prefs,
    sse,
    queue,
    setLastSpeakTimestamp: (d) => (lastSpeakTimestamp = d),
  });

  if (config.mcp.transport === "http") {
    await attachHttpMcpEndpoint({ app, mcpServer });
  } else if (config.mcp.transport === "stdio" && config.mcp.isManaged) {
    console.error("[MCP] Initializing MCP server...");
    await connectStdioMcp(mcpServer);
    console.error("[MCP] Server connected via stdio");
  }

  // HTTP start
  app.listen(config.http.port, async () => {
    const log = config.mcp.isManaged ? console.error : console.log;
    log(`[HTTP] Server listening on http://localhost:${config.http.port}`);
    log(`[Mode] Running in ${config.mcp.isManaged ? "MCP-managed" : "standalone"} mode`);

    if (config.mcp.isManaged && config.ui.autoOpenBrowser) {
      setTimeout(async () => {
        if (sse.size() === 0) {
          debugLog("[Browser] No frontend connected, opening browser...");
          try {
            const open = (await import("open")).default;
            await open(`${config.http.externalUrl}`);
          } catch (e) {
            debugLog("[Browser] Failed to open browser:", e as any);
          }
        } else {
          debugLog(`[Browser] Frontend already connected (${sse.size()} client(s))`);
        }
      }, 3000);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
