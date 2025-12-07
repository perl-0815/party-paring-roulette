import { defineConfig } from "eslint/config";
import pluginNext from "@next/eslint-plugin-next";

export default defineConfig([
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  {
    plugins: {
      "@next/next": pluginNext,
    },
    rules: {
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
]);
