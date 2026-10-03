import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: "http://127.0.0.1:5199", headless: true },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5199 --strictPort",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "browser-test-public-key",
    },
  },
});
