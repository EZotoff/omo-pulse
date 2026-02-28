#!/usr/bin/env bun
import { Hono } from "hono";

const app = new Hono();

const port = parseInt(process.env.EZ_DASH_API_PORT || "51244", 10);

app.get("/api/health", (c) => {
  return c.json({ ok: true, version: __APP_VERSION__ });
});

Bun.serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port,
});

console.log(`Server running at http://127.0.0.1:${port}`);
