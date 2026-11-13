import path from "node:path";
import { defineConfig } from "vitest/config";

// Standalone from astro.config.mjs: unit tests cover pure domain code only.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
