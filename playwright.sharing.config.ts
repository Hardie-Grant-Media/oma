import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/sharing-browser",
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5180", trace: "retain-on-failure" },
  webServer: [
    {
      command:
        "VITE_REPORT_READER_URL=http://127.0.0.1:55321/functions/v1/report-reader npm run dev:viewer",
      url: "http://127.0.0.1:5180",
      reuseExistingServer: false,
    },
    {
      command:
        "VITE_DEMO=false VITE_SUPABASE_URL=http://127.0.0.1:55321 VITE_SUPABASE_ANON_KEY=synthetic-test-key npx vite --config tests/sharing-browser/harness/vite.config.ts",
      url: "http://127.0.0.1:5181",
      reuseExistingServer: false,
    },
    {
      command: "python3 tests/local/serve-hosted.py",
      url: "http://127.0.0.1:5182",
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
