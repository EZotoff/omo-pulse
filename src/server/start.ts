#!/usr/bin/env bun
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createApi } from "./api";
import { createWorkerMultiProjectService } from "./worker-multi-project-service";
import { createTelegramService } from "./telegram";
import { isFreshnessRelevant } from "../ingest/opencode-event-map";
import { createOpenCodeSseClient } from "../ingest/opencode-sse-client";
import { readRealtimeConfig } from "../ingest/realtime-config";
import { createRealtimeBus, type OpenCodeEvent } from "../ingest/realtime-types";
import { selectStorageBackend, getLegacyStorageRootForBackend } from "../ingest/storage-backend";

const here = dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
const APP_VERSION: string = pkg.version ?? "0.0.0";

const app = new Hono();

const port = parseInt(process.env.OMO_PULSE_PORT || "18030", 10);
const distRoot = join(import.meta.dir, "../../dist");

const storageBackend = selectStorageBackend();
const storageRoot = getLegacyStorageRootForBackend(storageBackend);
const realtimeConfig = readRealtimeConfig();
const realtimeBus = createRealtimeBus();
const multiProjectService = createWorkerMultiProjectService({ storageRoot, storageBackend });
const sseClient = realtimeConfig.sseEnabled ? createOpenCodeSseClient({ endpoint: realtimeConfig.opencodeEndpoint }) : null;
let realtimeTimer: ReturnType<typeof setTimeout> | null = null;
let latestEvent: OpenCodeEvent | null = null;
sseClient?.subscribe((event) => {
  if (!isFreshnessRelevant(event)) return;
  latestEvent = event;
  if (realtimeTimer !== null) return;
  realtimeTimer = setTimeout(() => {
    realtimeTimer = null;
    multiProjectService.invalidate();
    const published = latestEvent;
    latestEvent = null;
    if (published) realtimeBus.publish(published);
  }, realtimeConfig.debounceMs);
});

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramChatId = process.env.TELEGRAM_CHAT_ID
const telegramService = telegramBotToken && telegramChatId
  ? createTelegramService(
      { botToken: telegramBotToken, chatId: telegramChatId },
      () => multiProjectService.getMultiProjectPayload(),
    )
  : null

const apiRouter = createApi({
  storageRoot,
  storageBackend,
  multiProjectService,
  realtimeBus,
  telegramStatus: telegramService ? () => telegramService.getStatus() : undefined,
  version: APP_VERSION,
});

app.route("/api", apiRouter);
// SPA fallback middleware
app.use("*", async (c, next) => {
  const path = c.req.path;

  // Skip API routes - let them pass through
  if (path.startsWith("/api/")) {
    return await next();
  }

  // For non-API routes without extensions, serve index.html
  if (!path.includes(".")) {
    const indexFile = Bun.file(join(distRoot, "index.html"));
    if (await indexFile.exists()) {
      return c.html(await indexFile.text(), 200, { "Cache-Control": "no-cache" })
    }
    return c.notFound();
  }

  // For static files with extensions, try to serve them
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const file = Bun.file(join(distRoot, relativePath));
  if (await file.exists()) {
    const ext = path.split(".").pop() || "";
    const contentType = getContentType(ext);
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  }

  return c.notFound();
});

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    html: "text/html",
    js: "application/javascript",
    css: "text/css",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    eot: "application/vnd.ms-fontobject",
  };
  return types[ext] || "text/plain";
}

const server = Bun.serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port,
  idleTimeout: 60,
});

sseClient?.start();
let disconnectedSince: number | null = null;
let outageLogged = false;
const healthTimer = sseClient ? setInterval(() => {
  if (sseClient.getState() === "connected") {
    disconnectedSince = null;
    outageLogged = false;
    return;
  }
  disconnectedSince ??= Date.now();
  if (!outageLogged && Date.now() - disconnectedSince >= 5_000) {
    console.warn("OpenCode SSE unavailable; dashboard remains on TTL refresh");
    outageLogged = true;
  }
}, 1_000) : null;
function shutdown(): void {
  sseClient?.stop();
  if (healthTimer !== null) clearInterval(healthTimer);
  if (realtimeTimer !== null) clearTimeout(realtimeTimer);
  telegramService?.stop();
  server.stop();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

if (telegramService) {
  telegramService.start()
  console.log("Telegram notifications enabled")
}
