import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // ── Ignored paths ──────────────────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.tsbuildinfo",
      "content/**",
      ".studio-data/**",
      "apps/studio/web/dist/**",
    ],
  },

  // ── TypeScript source files ────────────────────────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: {
          // vite.config.ts uses its own tsconfig; allow it to fall through without error
          allowDefaultProject: ["apps/studio/web/vite.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Errors — things that should never appear in new code
      "no-nested-ternary": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      // attributes: false — async onClick/onChange handlers are fine; React ignores return values
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Warnings — complexity gates; tighten to errors once existing code is cleaned up
      "no-unused-vars": "off", // handled by TS itself
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      complexity: ["warn", 15],
      "max-depth": ["warn", 4],
      "max-lines-per-function": ["warn", 80],
    },
  },

  // ── React + JSX (renderer + web) ───────────────────────────────────────────
  {
    files: ["apps/renderer/**/*.tsx", "apps/studio/web/**/*.tsx"],
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      // React 18+ batches all setState calls inside effects automatically —
      // no cascading renders. The rule is too strict for the "reset state on
      // projectId change" and "seed state from async data" patterns we use.
      "react-hooks/set-state-in-effect": "off",
    },
  },

  // ── Prettier (must be last — disables conflicting formatting rules) ─────────
  prettierConfig,
];
