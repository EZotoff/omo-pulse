#!/usr/bin/env bun
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
const APP_VERSION: string = pkg.version ?? "0.0.0";

const app = new Hono();

const port = parseInt(process.env.EZ_DASH_API_PORT || "51244", 10);
const distRoot = join(import.meta.dir, "../../dist");

app.get("/api/health", (c) => {
  return c.json({ ok: true, version: APP_VERSION });
});

// API routes mounted here — Task 7

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
      return c.html(await indexFile.text());
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

Bun.serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port,
});

console.log(`Server running on http://127.0.0.1:${port}`);
