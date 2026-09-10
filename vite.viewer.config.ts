import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig(({ command }) => {
  const endpoint = process.env.VITE_REPORT_READER_URL;
  if (command === "build") {
    if (
      !endpoint ||
      !/^https:\/\/[^/]+\/functions\/v1\/report-reader$/.test(endpoint)
    )
      throw new Error(
        "Configure the HTTPS report reader URL before building the hosted viewer.",
      );
  }
  return {
    root: "report-viewer",
    base: command === "build" ? `${process.env.OMA_BASE_PATH || "/"}reports/` : "/",
    envDir: "report-viewer",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    build: { outDir: "../dist/reports", emptyOutDir: true },
    server: { host: "127.0.0.1", port: 5180, strictPort: true },
  };
});
