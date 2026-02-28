#!/usr/bin/env bun
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const here = dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
const APP_VERSION: string = pkg.version ?? "0.0.0";

const port = parseInt(process.env.EZ_DASH_API_PORT || "51244", 10);

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ ok: true, version: APP_VERSION });
});

Bun.serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port,
});

console.log(`Server running at http://127.0.0.1:${port}`);
