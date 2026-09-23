#!/usr/bin/env bun
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApi } from "./api";
import { createMultiProjectService } from "./multi-project";
import { createTelegramService } from "./telegram";
import { createOpenCodeSseClient } from "../ingest/opencode-sse-client";
import { readRealtimeConfig } from "../ingest/realtime-config";
import { createRealtimeBus } from "../ingest/realtime-types";
import { selectStorageBackend, getLegacyStorageRootForBackend } from "../ingest/storage-backend";

const here = dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
const APP_VERSION: string = pkg.version ?? "0.0.0";

const port = parseInt(process.env.OMO_PULSE_API_PORT || "18031", 10);

const app = new Hono();

const storageBackend = selectStorageBackend();
const storageRoot = getLegacyStorageRootForBackend(storageBackend);
const realtimeConfig = readRealtimeConfig();
const realtimeBus = createRealtimeBus();
const multiProjectService = createMultiProjectService({ storageRoot, storageBackend, realtimeBus, realtimeDebounceMs: realtimeConfig.debounceMs });
const sseClient = realtimeConfig.sseEnabled ? createOpenCodeSseClient({ endpoint: realtimeConfig.opencodeEndpoint }) : null;
sseClient?.subscribe(multiProjectService.onRealtimeEvent);

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
  getRealtimeState: () => sseClient?.getState() ?? "disabled",
  telegramStatus: telegramService ? () => telegramService.getStatus() : undefined,
  version: APP_VERSION,
});

app.route("/api", apiRouter);

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
  telegramService?.stop();
  server.stop();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

if (telegramService) {
  telegramService.start()
  console.log("Telegram notifications enabled")
}

console.log(`Server running at http://127.0.0.1:${port}`);
