import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/storybook-static/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/vitest.config.ts",
      "**/*.d.ts",
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      globals: {
        structuredClone: 'readonly',
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "func-style": ["error", "expression", { "allowArrowFunctions": true }],
      "prefer-arrow-callback": "error",
      "no-restricted-syntax": [
        "error",
        {
          "selector": "FunctionDeclaration",
          "message": "Use arrow functions instead of function declarations."
        },
        {
          "selector": "FunctionExpression",
          "message": "Use arrow functions instead of function expressions."
        }
      ],
      "prefer-const": "error",
      "no-param-reassign": "error"
    }
  }
);
