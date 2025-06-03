import prettierPlugin from "eslint-plugin-prettier";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    files: ['src/**/*.ts'],
    ignores: ['vite.config.ts', 'dist/**/*.ts', 'dist/**/*.js'],
    rules: {
      'prettier/prettier': 'error',
      'no-var': ['error'],
      'prefer-const': ['error'],
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    },
  },
  eslintConfigPrettier, // Ensures Prettier rules override conflicting ESLint rules
];
