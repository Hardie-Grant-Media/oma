import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
const port = process.env.OMA_E2E_PORT || "5174";
const local = process.env.OMA_LOCAL_AUTH_TESTS === "true";
const keys = local
  ? JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    )
  : null;
if (keys && keys.API_URL !== "http://127.0.0.1:55321")
  throw new Error("Use only the isolated OMA database.");
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: [
    {
      command: `VITE_DEMO=true npm run dev -- --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: !process.env.CI,
    },
    ...(local
      ? [
          {
            command:
              "supabase functions serve --env-file supabase/functions/.env.example",
            url: "http://127.0.0.1:55321/functions/v1/worker",
            reuseExistingServer: true,
            timeout: 120000,
          },
          {
            command: "npm run dev -- --port 5175 --strictPort",
            url: "http://127.0.0.1:5175",
            env: {
              VITE_DEMO: "false",
              VITE_SUPABASE_URL: keys.API_URL,
              VITE_SUPABASE_ANON_KEY: keys.ANON_KEY,
            },
            reuseExistingServer: false,
          },
        ]
      : []),
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
