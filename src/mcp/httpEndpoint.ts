// src/mcp/httpEndpoint.ts
import type { Express } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export async function attachHttpMcpEndpoint(args: {
  app: Express;
  mcpServer: McpServer;
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