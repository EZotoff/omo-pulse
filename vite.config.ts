import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, "package.json"), "utf8")) as {
  version?: string;
};
const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.EZ_DASH_API_PORT ?? "51244"}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    exclude: ["tests/e2e/**", "node_modules/**"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        inline: ["bun:sqlite"],
      },
    },
  },
});
