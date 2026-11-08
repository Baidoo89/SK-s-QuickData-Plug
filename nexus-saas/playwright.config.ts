import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/ux",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3015", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev tests/fixtures/ux-app --hostname 127.0.0.1 --port 3015",
    url: "http://127.0.0.1:3015",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: "1", UX_TEST_RUN: "1" },
  },
})
