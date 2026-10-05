import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
    // The browser-localStorage modules are exercised against a minimal in-memory Storage shim
    // rather than jsdom: the code only uses getItem/setItem/removeItem/key/length, and a real DOM
    // environment would be a heavy dependency for zero extra coverage.
    globals: false,
  },
});