import eslintJs from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['node_modules/', 'dist/', 'build/', '*.local', '*~'],
  },
  eslintJs.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js', '**/*.ts'],
    plugins: {
      import: importPlugin,
      'simple-import-sort': simpleImportSortPlugin,
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'one-var': ['error', 'never'],
      'object-shorthand': ['error', 'always'],
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-useless-escape': 'error',
      'no-unneeded-ternary': 'error',
      'no-multi-assign': 'error',
      'no-param-reassign': 'error',
      'no-else-return': ['error', { allowElseIf: false }],

      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/dot-notation': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/parameter-properties': 'error',

      'simple-import-sort/imports': 'error',
      'import/no-duplicates': 'error',
      'import/extensions': ['error', 'ignorePackages', { ts: 'always' }],
      'import/no-unresolved': 'off',
    },
  },
  // Plain JS files are outside any tsconfig project, so type-aware rules can't run on them.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Must stay last: disables every formatting rule enabled above.
  eslintConfigPrettier,
);
