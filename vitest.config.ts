import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcPath = resolve(rootDir, "src");

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
});
