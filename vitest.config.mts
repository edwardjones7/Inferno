import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    testTimeout: 60_000,
    // agent and session worktrees live in .claude/worktrees; never run their copies of the tests
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
