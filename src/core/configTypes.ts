export type McpTransportMode = "stdio" | "http";

export type Config = Readonly<{
  paths: {
    filename: string;
    dirname: string;
  };
  timeouts: {
    waitSeconds: number;
  };
  http: {
    host: string;
    port: number;
    externalUrl: string;
  };
  mcp: {
    isManaged: boolean;
    transport: McpTransportMode;
  };
  ui: {
    useLegacyUi: boolean;
    autoOpenBrowser: boolean;
  };
}>;