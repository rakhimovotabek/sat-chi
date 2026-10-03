import globals from "globals";
import react from "eslint-plugin-react";
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "local-imports/**",
      "supabase/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react },
    rules: {
      "no-undef": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
    },
  },
];
