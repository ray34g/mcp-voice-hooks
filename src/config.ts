import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

export const WAIT_TIMEOUT_SECONDS = 60;

export const HTTP_PORT = process.env.MCP_VOICE_HOOKS_PORT
  ? parseInt(process.env.MCP_VOICE_HOOKS_PORT, 10)
  : 5111;

const HTTP_HOST = process.env.MCP_VOICE_HOOKS_HOST ?? "localhost";

export const EXTERNAL_URL =
  process.env.EXTERNAL_URL ?? `http://${HTTP_HOST}:${HTTP_PORT}`;

export const IS_MCP_MANAGED = process.argv.includes("--mcp-managed");

type McpTransportMode = "stdio" | "http";
export const MCP_TRANSPORT: McpTransportMode =
  (process.env.MCP_VOICE_HOOKS_MCP_TRANSPORT as McpTransportMode) ??
  (IS_MCP_MANAGED ? "stdio" : "http");

export const USE_LEGACY_UI = process.env.MCP_VOICE_HOOKS_LEGACY_UI === "true";
export const AUTO_OPEN_BROWSER =
  process.env.MCP_VOICE_HOOKS_AUTO_OPEN_BROWSER !== "false";
