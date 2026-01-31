// config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";

type McpTransportMode = "stdio" | "http";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/** env helpers */
const env = {
  string(name: string, fallback: string): string {
    const v = process.env[name];
    return v == null || v === "" ? fallback : v;
  },

  int(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw == null || raw === "") return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  },

  bool(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw == null || raw === "") return fallback;
    const v = raw.toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(v)) return true;
    if (["false", "0", "no", "n", "off"].includes(v)) return false;
    return fallback;
  },

  enum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const raw = process.env[name] as T | undefined;
    return raw && (allowed as readonly string[]).includes(raw) ? raw : fallback;
  },
} as const;

/** argv flags */
const isMcpManaged = process.argv.includes("--mcp-managed");

/** http */
const http = {
  host: env.string("MCP_VOICE_HOOKS_HOST", "localhost"),
  port: env.int("MCP_VOICE_HOOKS_PORT", 5111),
} as const;

const externalUrl = env.string("EXTERNAL_URL", `http://${http.host}:${http.port}`);

/** mcp */
const mcp = {
  isManaged: isMcpManaged,
  transport: env.enum<McpTransportMode>(
    "MCP_VOICE_HOOKS_MCP_TRANSPORT",
    ["stdio", "http"] as const,
    isMcpManaged ? "stdio" : "http"
  ),
} as const;

/** ui */
const ui = {
  useLegacyUi: env.bool("MCP_VOICE_HOOKS_LEGACY_UI", false),

  // Existing spec: Defaults to true if not set; only disabled when explicitly set to 'false'
  autoOpenBrowser: env.string("MCP_VOICE_HOOKS_AUTO_OPEN_BROWSER", "true") !== "false",
} as const;

/** timeouts */
const timeouts = {
  waitSeconds: 60,
} as const;

export const config = {
  paths: { filename, dirname },
  timeouts,
  http: { ...http, externalUrl },
  mcp,
  ui,
} as const;
