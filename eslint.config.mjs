import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import {
  currentCalendarDay,
  LINT_EXCEPTIONS,
  lintExceptionOverrides,
} from "./scripts/lib/engine-file-exceptions.mjs";

const baseConfig = [
  globalIgnores([
    ".next/**",
    ".vinext/**",
    ".wrangler/**",
    "dist/**",
    "dist-github-pages/**",
    "out/**",
    "build/**",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  // ESLint 10 adds these three to its recommended set. Enabling them on 9
  // keeps the code clean for that upgrade (Renovate holds eslint below 10).
  {
    rules: {
      "no-unassigned-vars": "error",
      "no-useless-assignment": "error",
      "preserve-caught-error": "error",
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];

// The dated engine-file exceptions come last so that they alone decide the
// rules they name. An expired entry adds nothing (decision 0095, point 10).
export function createEslintConfig({
  exceptions = LINT_EXCEPTIONS,
  today = currentCalendarDay(),
} = {}) {
  return defineConfig([...baseConfig, ...lintExceptionOverrides(exceptions, today)]);
}

const eslintConfig = createEslintConfig();

export default eslintConfig;
