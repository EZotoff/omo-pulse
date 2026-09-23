/**
 * Normalized internal types for the OpenCode SSE realtime pipeline.
 *
 * These are the contracts shared by the SSE client (T1), the debounced
 * invalidation wiring (T4), and the /api/events server→browser endpoint (T5).
 * Kept in a dedicated file (rather than src/types.ts) to avoid bloating the
 * shared UI/server types module.
 */

/** A normalized opencode SSE event, reduced to what omo-pulse needs. */
export type OpenCodeEvent = {
  /** Raw opencode event type, e.g. "session.updated", "message.updated", "text.delta". */
  kind: string;
  sessionId?: string;
  directory?: string;
  /** Stream sequence number, used for `?after=N` replay resume. */
  seq?: number;
  /** Event timestamp (epoch ms) at normalization time. */
  ts: number;
};

/** Lifecycle state of the upstream opencode SSE connection. */
export type SseConnectionState = "connected" | "reconnecting" | "down" | "disabled";

/**
 * Internal pub/sub bus. T4 publishes normalized events; T5 subscribes to fan
 * `refresh` signals out to browsers. Synchronous in-memory fan-out only —
 * no external pub/sub library, no async queueing.
 */
export type RealtimeBus = {
  /** Fan the event out to every current subscriber, synchronously, in order. */
  publish(event: OpenCodeEvent): void;
  /** Register a listener; returns an unsubscribe handle. */
  subscribe(listener: (e: OpenCodeEvent) => void): () => void;
};

/**
 * In-memory {@link RealtimeBus} implementation.
 *
 * Synchronous fan-out to a Set of listeners (insertion order preserved).
 * `subscribe` returns an idempotent unsubscribe handle.
 */
export function createRealtimeBus(): RealtimeBus {
  const listeners = new Set<(e: OpenCodeEvent) => void>();
  return {
    publish(event: OpenCodeEvent): void {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener: (e: OpenCodeEvent) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
