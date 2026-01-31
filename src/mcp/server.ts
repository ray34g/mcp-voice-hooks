import type { Express } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type { VoicePreferences, SseHub } from "../core/voice.ts";
import type { UtteranceQueue } from "../core/queue.ts";
import { speakCore } from "../core/voice.ts";

export function createMcpServer(args: {
  prefs: VoicePreferences;
  sse: SseHub;
  queue: UtteranceQueue;
  setLastSpeakTimestamp: (d: Date) => void;
}) {
  const { prefs, sse, queue, setLastSpeakTimestamp } = args;

  const mcpServer = new Server(
    { name: "voice-hooks", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "speak",
        description:
          "Speak text using text-to-speech and mark delivered utterances as responded",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    ],
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: a } = request.params;
    if (name !== "speak") {
      return {
        content: [{ type: "text", text: `Error: Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const text = String((a as any)?.text ?? "");
    const r = await speakCore({ text, prefs, sse, queue, setLastSpeakTimestamp });

    if (!r.ok) {
      return {
        content: [
          {
            type: "text",
            text: `Error speaking text: ${(r.body as any).error || "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: "" }] };
  });

  return mcpServer;
}

export async function attachHttpMcpEndpoint(args: {
  app: Express;
  mcpServer: Server;
}) {
  const { app, mcpServer } = args;

  const httpMcpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await mcpServer.connect(httpMcpTransport);

  app.post("/mcp", async (req, res) => {
    try {
      await httpMcpTransport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => res.status(405).end());
  app.delete("/mcp", (_req, res) => res.status(405).end());
}

export async function connectStdioMcp(mcpServer: Server) {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
