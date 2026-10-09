import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * ESLint flat config.
 *
 * Kept deliberately small. The ruleset enforces the things that actually break
 * this project — hook correctness, effect cleanup, and not shipping stray
 * `console` calls into production code — rather than re-litigating style, which
 * TypeScript and the formatter already own.
 */
export default tseslint.config(
  {
    // Build output, generated assets and the vendored tool scripts are not
    // linted: tools/ is Node-side CommonJS by design.
    ignores: ['dist', 'node_modules', 'public', 'tools', 'coverage'],
  },

  // ------------------------------------------------------------------- app
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Fast-refresh only works when a module exports components exclusively.
      // The rule allows constant exports so shared config objects stay legal.
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Unused identifiers with a leading underscore are intentional.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // `any` is occasionally the honest type for a third-party boundary;
      // it is a warning rather than an error so it cannot be used casually
      // without showing up in review.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Console output belongs behind import.meta.env.DEV, which the project
      // enforces by convention. Warn so a stray call is visible in CI.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Non-null assertions are used deliberately where a lookup is known to
      // succeed (route registries); forbid them only where they hide a bug.
      '@typescript-eslint/no-non-null-assertion': 'off',

      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },

  // --------------------------------------------------------------- config
  {
    files: ['*.config.ts', 'vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Build scripts legitimately report progress to the console.
      'no-console': 'off',
    },
  }
);
