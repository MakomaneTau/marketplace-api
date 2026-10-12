import js from "@eslint/js";

export default [
  { ignores: ["node_modules/**", "coverage/**", "dist/**", "supabase/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: Object.fromEntries(
        [
          "process",
          "console",
          "Buffer",
          "URL",
          "fetch",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "AbortSignal",
          "FormData",
          "Blob",
          "Response",
        ].map((name) => [name, "readonly"]),
      ),
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/controllers/**/*.js", "src/validators/**/*.js"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/config/supabase*"],
              message: "Database access belongs in services.",
            },
          ],
        },
      ],
    },
  },
];
