#!/usr/bin/env node

import { debugLog } from "./debug.ts";
import { UtteranceQueue } from "./core/queue.ts";
import { SseHub, type VoicePreferences } from "./core/voice.ts";
import { createApp } from "./http/routes.ts";
import {
  AUTO_OPEN_BROWSER,
  EXTERNAL_URL,
  HTTP_PORT,
  IS_MCP_MANAGED,
  MCP_TRANSPORT,
} from "./config.ts";
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

  if (MCP_TRANSPORT === "http") {
    await attachHttpMcpEndpoint({ app, mcpServer });
  } else if (MCP_TRANSPORT === "stdio" && IS_MCP_MANAGED) {
    console.error("[MCP] Initializing MCP server...");
    await connectStdioMcp(mcpServer);
    console.error("[MCP] Server connected via stdio");
  }

  // HTTP start
  app.listen(HTTP_PORT, async () => {
    const log = IS_MCP_MANAGED ? console.error : console.log;
    log(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    log(`[Mode] Running in ${IS_MCP_MANAGED ? "MCP-managed" : "standalone"} mode`);

    if (IS_MCP_MANAGED && AUTO_OPEN_BROWSER) {
      setTimeout(async () => {
        if (sse.size() === 0) {
          debugLog("[Browser] No frontend connected, opening browser...");
          try {
            const open = (await import("open")).default;
            await open(`${EXTERNAL_URL}`);
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
