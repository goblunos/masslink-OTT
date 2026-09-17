import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const apiPort = 4312;
const webPort = 4310;
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (fs.existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
      args: ["--no-sandbox"],
    },
  },
  webServer: [
    {
      command:
        `cd ../api-server && NODE_ENV=test CAPTION_CHUNK_SECONDS=6 ` +
        `E2E_API_PORT=${apiPort} E2E_FIXTURE_PORT=4311 ` +
        `pnpm exec tsx src/test/e2e-server.ts`,
      url: `http://127.0.0.1:${apiPort}/api/healthz`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        `PORT=${webPort} BASE_PATH=/ API_PROXY_URL=http://127.0.0.1:${apiPort} ` +
        `pnpm exec vite --config vite.config.ts --host 127.0.0.1`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});