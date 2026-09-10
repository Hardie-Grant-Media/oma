import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/mcp-browser",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5191/oma/",
    channel: "chrome",
    trace: "off",
  },
  webServer: {
    command: "npm run dev -- --port 5191 --strictPort",
    url: "http://127.0.0.1:5191/oma/",
    reuseExistingServer: false,
    env: {
      OMA_BASE_PATH: "/oma/",
      VITE_DEMO: "false",
      VITE_SUPABASE_URL: "http://127.0.0.1:55321",
      VITE_SUPABASE_ANON_KEY: "test-public-key",
      VITE_OMA_MCP_CLIENT_IDS: "dedicated-oma-client",
    },
  },
});
