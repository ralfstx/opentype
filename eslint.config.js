import eslintJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'dist/', 'build/', '*.local', '*~', 'eslint.config.js'],
  },
  eslintJs.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommendedTypeChecked,
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
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-undef': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'one-var': ['error', 'never'],
      'object-shorthand': ['error', 'always'],
      'prefer-const': ['error', { destructuring: 'all' }],
      'require-await': 'error',
      'no-useless-escape': 'error',
      'no-unneeded-ternary': 'error',
      'no-unused-expressions': 'error',
      'no-multi-assign': 'error',
      'no-throw-literal': 'error',
      'no-param-reassign': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'dot-notation': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/parameter-properties': 'error',

      'simple-import-sort/imports': 'error',
      'import/no-duplicates': 'error',
      'import/extensions': ['error', 'ignorePackages', { ts: 'always' }],
      'import/no-unresolved': 'off',
    },
  },
);
