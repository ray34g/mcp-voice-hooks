// src/debug.ts
import type { Logger } from "../core/logger";

function createDebugLogger(enabled: boolean): Logger {
  return {
    debug: (...args: unknown[]) => {
      if (enabled) console.error(...args);
    },
  };
}

// 互換用（段階移行用）
const DEBUG = process.argv.includes("--debug") || process.argv.includes("-d");
const defaultLogger = createDebugLogger(DEBUG);
export function debugLog(...args: unknown[]): void {
  defaultLogger.debug(...args);
}
