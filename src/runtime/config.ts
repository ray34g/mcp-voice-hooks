// src/runtime/config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Config, McpTransportMode } from "../core/configTypes.ts";
import { env, hasArgvFlag } from "./env.ts";

function loadConfig(): Config {
  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);

  const isMcpManaged = hasArgvFlag("--mcp-managed");

  const httpHost = env.string("MCP_VOICE_HOOKS_HOST", "localhost");
  const httpPort = env.int("MCP_VOICE_HOOKS_PORT", 5111);
  const externalUrl = env.string("EXTERNAL_URL", `http://${httpHost}:${httpPort}`);

  const transport = env.enum<McpTransportMode>(
    "MCP_VOICE_HOOKS_MCP_TRANSPORT",
    ["stdio", "http"] as const,
    isMcpManaged ? "stdio" : "http"
  );

  const waitSeconds = env.int("MCP_VOICE_HOOKS_WAIT_SECONDS", 60);

  const useLegacyUi = env.bool("MCP_VOICE_HOOKS_LEGACY_UI", false);
  const autoOpenBrowser =
    env.string("MCP_VOICE_HOOKS_AUTO_OPEN_BROWSER", "true") !== "false";

  return {
    paths: { filename, dirname },
    timeouts: { waitSeconds },
    http: { host: httpHost, port: httpPort, externalUrl },
    mcp: { isManaged: isMcpManaged, transport },
    ui: { useLegacyUi, autoOpenBrowser },
  } as const;
}

export const config: Config = loadConfig();
