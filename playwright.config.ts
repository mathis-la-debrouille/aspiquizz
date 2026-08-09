import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e/.output",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "PORT=3100 NODE_ENV=test DATABASE_URL=file:./tests/e2e/.output/e2e.db tsx server.ts",
    url: "http://localhost:3100/healthz",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
