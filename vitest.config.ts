import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["source"] },
  test: {
    include: ["**/src/**/*.test.{ts,tsx}"],
    environment: "node",
    environmentMatchGlobs: [["client/**", "jsdom"]],
    setupFiles: ["./client/vitest.setup.ts"],
  },
});
