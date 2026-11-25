import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: process.env.OG_BASE_URL ? 90000 : 30000,
  expect: { timeout: process.env.OG_BASE_URL ? 15000 : 5000 },
  workers: 1,
  use: {
    baseURL: process.env.OG_BASE_URL || "http://127.0.0.1:5173",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.OFFERGUARD_CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  },
});
