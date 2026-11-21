import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // native shells (Capacitor copies the built web app into these)
    "ios/**",
    "android/**",
    // agent worktrees (each has its own checkout and build output)
    ".claude/**",
    // Deno edge functions (Supabase) and the bundle generated for them
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
