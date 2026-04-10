#!/usr/bin/env bun
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApi } from "./api";
import { createMultiProjectService } from "./multi-project";
import { createTelegramService } from "./telegram";
import { selectStorageBackend, getLegacyStorageRootForBackend } from "../ingest/storage-backend";

const here = dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
const APP_VERSION: string = pkg.version ?? "0.0.0";

const port = parseInt(process.env.OMO_PULSE_API_PORT || "51244", 10);

const app = new Hono();

const storageBackend = selectStorageBackend();
const storageRoot = getLegacyStorageRootForBackend(storageBackend);
const multiProjectService = createMultiProjectService({ storageRoot, storageBackend });

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
  telegramStatus: telegramService ? () => telegramService.getStatus() : undefined,
  version: APP_VERSION,
});

app.route("/api", apiRouter);

Bun.serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port,
  idleTimeout: 60,
});

if (telegramService) {
  telegramService.start()
  console.log("Telegram notifications enabled")
}

console.log(`Server running at http://127.0.0.1:${port}`);
