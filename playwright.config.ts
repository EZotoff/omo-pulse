import { defineConfig } from "@playwright/test"

// Mock API port for the e2e harness. Chosen randomly inside the project's
// registered range (18030-18039) each run unless explicitly overridden, so
// repeat/parallel runs cannot collide on a fixed port. Exported through the
// process env so the spec and the vite proxy agree on the same value.
const apiPort =
  process.env.OMO_PULSE_API_PORT ?? String(18030 + Math.floor(Math.random() * 10))
process.env.OMO_PULSE_API_PORT = apiPort

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
    // vite proxies /api to OMO_PULSE_API_PORT; keep harness and proxy agreed.
    env: { OMO_PULSE_API_PORT: apiPort },
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
