/**
 * Config for the OpenCode SSE realtime ingest.
 *
 * Parsed with the same defensive style as the existing env reads
 * (see src/server/dev.ts:14 — `parseInt(env.X || "default", 10)`).
 */

const DEFAULT_OPENCODE_ENDPOINT = "http://127.0.0.1:4096";
const DEFAULT_SSE_DEBOUNCE_MS = 300;

export type RealtimeConfig = {
  /** Feature flag: when false, the SSE client is never started (TTL fallback only). */
  readonly sseEnabled: boolean;
  /** Base URL of the opencode HTTP server. */
  readonly opencodeEndpoint: string;
  /** Debounce window (ms) for event-driven cache invalidation. */
  readonly debounceMs: number;
};

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function readRealtimeConfig(): RealtimeConfig {
  return {
    sseEnabled: readBoolEnv("OMO_PULSE_OPENCODE_SSE_ENABLED", true),
    opencodeEndpoint:
      process.env.OMO_PULSE_OPENCODE_ENDPOINT || DEFAULT_OPENCODE_ENDPOINT,
    debounceMs: readIntEnv("OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS", DEFAULT_SSE_DEBOUNCE_MS),
  };
}
