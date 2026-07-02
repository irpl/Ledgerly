import { defineConfig } from "vitest/config";
import path from "path";

const TEST_DATABASE_URL = "postgresql://jan:jan@localhost:5432/jan_test";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      INBOUND_EMAIL_SECRET: "dev-inbound-secret-change-me",
    },
    // Integration tests share one database — no parallel files.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
