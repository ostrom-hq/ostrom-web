// @ts-check
// Lint is part of the type system here: type-checked strict + stylistic, no inline disables,
// and import boundaries that keep the architecture (app -> features -> shared) one-way.
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist',
      'dist-real',
      'dist-budget',
      'playwright-report-real',
      'coverage',
      'playwright-report',
      'test-results',
      'gen',
      'public/mockServiceWorker.js',
      'public/config.js',
      'public/theme.js',
    ],
  },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { requireDefaultForNonUnion: true, considerDefaultExhaustiveForUnions: false },
      ],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowString: false, allowNumber: false, allowNullableObject: true },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/method-signature-style': ['error', 'property'],
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: false } },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use a union of string literals or an `as const` object.' },
      ],
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/**/*.{ts,tsx}', 'ee/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    extends: [reactRefresh.configs.vite(), jsxA11y.flatConfigs.strict],
    rules: {
      ...reactHooks.configs.flat['recommended-latest'].rules,
      // TanStack Router's `throw redirect()` is its documented control flow, not an error.
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', package: '@tanstack/router-core', name: 'Redirect' }] },
      ],
    },
  },
  // Architecture: shared never imports features or app; features never import app,
  // and only reach another feature through its public index.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/features/*', '@/app/*', '@ee/*'], message: 'shared/ is the bottom layer.' },
            { group: ['@/mocks/*'], message: 'Mocks are wired by app/ (and tests), never by shared/.' },
            { group: ['../*'], message: 'Use the @/ alias across folders.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/*'], message: 'features/ never imports app/.' },
            { group: ['@ee/*'], message: 'ee/ is loaded lazily by app/, never imported by features/.' },
            { group: ['@/mocks/*'], message: 'Mocks are wired by app/ (and tests), never by features/.' },
            { group: ['@/features/*/*'], message: 'Import another feature through its index only.' },
            { group: ['../../*'], message: 'Use the @/ alias across folders.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@ee/*'], message: 'ee/ is loaded through its single lazy entry point only.' },
            {
              group: ['@/features/*/*', '!@/features/*/route'],
              message:
                'Import a feature through its index, or its route entry for what the router reads first.',
            },
          ],
        },
      ],
    },
  },
  {
    // A feature's route entry stays light: its screens load with their route, never in the first download.
    files: ['src/features/*/route.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['./screens/*', './components/*'], message: 'A route entry never imports a screen.' },
            { group: ['@/app/*'], message: 'features/ never imports app/.' },
            { group: ['@ee/*'], message: 'ee/ is loaded lazily by app/, never imported by features/.' },
            { group: ['@/mocks/*'], message: 'Mocks are wired by app/ (and tests), never by features/.' },
            { group: ['@/features/*/*'], message: 'Import another feature through its index only.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}', 'e2e/**/*.ts', 'e2e-real/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    files: ['e2e/**/*.ts', 'e2e-real/**/*.ts', 'scripts/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
