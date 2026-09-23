import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 15_000,
  webServer: {
    command: "bun run dev:ui",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // The e2e mock API binds OMO_PULSE_API_PORT (default 18031, inside the
    // project's registered 18030-18039 range); vite proxies /api there. Passing
    // it here keeps harness and proxy agreed and allows collision overrides.
    env: { OMO_PULSE_API_PORT: process.env.OMO_PULSE_API_PORT ?? "18031" },
  },
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
})
