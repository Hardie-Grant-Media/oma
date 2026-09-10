import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/password",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5187/oma/", trace: "off" },
  webServer: {
    command: "npm run dev -- --port 5187 --strictPort",
    url: "http://127.0.0.1:5187/oma/",
    env: {
      OMA_BASE_PATH: "/oma/",
      VITE_DEMO: "false",
      VITE_SUPABASE_URL: "http://127.0.0.1:55321",
      VITE_SUPABASE_ANON_KEY: "test-public-key",
    },
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
