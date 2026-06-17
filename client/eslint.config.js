import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        document: "readonly",
        fetch: "readonly",
        File: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        localStorage: "readonly"
      }
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } }
      ]
    }
  }
];
