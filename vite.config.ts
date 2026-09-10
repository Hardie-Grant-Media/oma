import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command, mode }) => ({
  base: process.env.OMA_BASE_PATH || "/",
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    {
      name: "demo-guard",
      configResolved(config) {
        if (
          command === "build" &&
          (config.env.VITE_DEMO === "true" || mode === "demo")
        ) {
          throw new Error(
            "Demo is local only. Remove VITE_DEMO before building.",
          );
        }
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
}));
