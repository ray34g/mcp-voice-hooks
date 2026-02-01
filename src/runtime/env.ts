// src/runtime/env.ts
export const env = {
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

export function hasArgvFlag(flag: string): boolean {
  return process.argv.includes(flag);
}