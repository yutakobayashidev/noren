import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3199",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec tsx server/index.ts",
    url: "http://127.0.0.1:3199/healthz",
    reuseExistingServer: false,
    env: {
      PORT: "3199",
      HOST: "127.0.0.1",
      APP_ORIGIN: "http://127.0.0.1:3199",
      FLARE_DEV_AUTH: "1",
      FLARE_PREVIEW: "0",
      FLARE_DATA_DIR: "/tmp/flare-e2e-data",
      NODE_ENV: "test",
    },
    timeout: 30000,
  },
});
