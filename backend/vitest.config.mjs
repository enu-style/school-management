import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    globalSetup: ["./tests/globalSetup.js"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: "test",
      DB_NAME: "school_management_test",
      DATABASE_URL: "",
      JWT_SECRET: "test-only-secret-not-used-anywhere-else",
      FRONTEND_URL: "http://localhost:5173",
      LOGIN_LIMIT: "1000",
      API_LIMIT: "100000",
      DOTENV_CONFIG_QUIET: "true",
    },
  },
});
