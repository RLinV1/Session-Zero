import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Localization: text people read goes through the catalogs (`t()`), never a literal in a
 * component (openspec/changes/language-setting-zh-tw, design.md §9). Files join this list as
 * their area is migrated; the last task widens it to all of apps/web/src.
 */
/** Where the no-literal-text guard applies: every web component (localization task 8.1). */
export const LOCALIZED_FILES = ['apps/web/src/**/*.tsx'];
const TEXT_ATTRIBUTES = '/^(aria-label|aria-description|title|placeholder|alt)$/';
const USE_CATALOG = 'Put text people read in the i18n catalog and render it with t() (localization).';
export const noLiteralText = {
  'no-restricted-syntax': ['error',
    { selector: 'JSXText[value=/[A-Za-z]{2,}/]', message: USE_CATALOG },
    { selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > Literal[value=/[A-Za-z]{2,}/]`, message: USE_CATALOG },
    { selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > JSXExpressionContainer > Literal[value=/[A-Za-z]{2,}/]`, message: USE_CATALOG },
    { selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=/[A-Za-z]{2,}/]`, message: USE_CATALOG },
    // Words a child expression renders: {n === 1 ? "token" : "tokens"}, {busy && "Saving"}, {`${n} rolls`}.
    { selector: 'JSXElement > JSXExpressionContainer > ConditionalExpression > Literal[value=/[A-Za-z]{2,}/]', message: USE_CATALOG },
    { selector: 'JSXElement > JSXExpressionContainer > LogicalExpression > Literal[value=/[A-Za-z]{2,}/]', message: USE_CATALOG },
    { selector: 'JSXElement > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=/[A-Za-z]{2,}/]', message: USE_CATALOG },
    { selector: 'JSXElement > JSXExpressionContainer > ConditionalExpression > TemplateLiteral > TemplateElement[value.raw=/[A-Za-z]{2,}/]', message: USE_CATALOG },
  ],
};

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
    files: ['apps/server/**/*.ts', 'apps/web/vite.config.ts', 'apps/web/scripts/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: LOCALIZED_FILES,
    rules: noLiteralText,
  },
);
