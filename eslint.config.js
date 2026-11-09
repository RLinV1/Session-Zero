import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // .claude/ holds local agent worktrees: full repo copies that are not part of this checkout.
    // services/vision/training/ is the git-ignored local model-training workspace (it has a Python venv with vendored JS).
    ignores: ['**/dist/**', '**/node_modules/**', 'openspec/**', 'apps/server/uploads/**', '.claude/**', 'services/vision/training/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/server/**/*.ts', 'apps/mcp/**/*.ts', 'apps/web/vite.config.ts', 'apps/web/scripts/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
