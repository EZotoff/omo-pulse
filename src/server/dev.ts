#!/usr/bin/env bun
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApi } from "./api";
import { selectStorageBackend, getLegacyStorageRootForBackend } from "../ingest/storage-backend";

const here = dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
const APP_VERSION: string = pkg.version ?? "0.0.0";

const port = parseInt(process.env.EZ_DASH_API_PORT || "51244", 10);

const app = new Hono();

// Initialize storage backend and create API router
const storageBackend = selectStorageBackend();
const storageRoot = getLegacyStorageRootForBackend(storageBackend);
const apiRouter = createApi({ storageRoot, storageBackend, version: APP_VERSION });

// Mount the API router
app.route("/api", apiRouter);

Bun.serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port,
});

console.log(`Server running at http://127.0.0.1:${port}`);
