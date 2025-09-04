// eslint.config.js — Flat Config for ESLint v9+

import js from '@eslint/js';
import pluginImport from 'eslint-plugin-import';
import pluginJsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-config-prettier';

// If your package.json has "type": "module", this file is ESM by default.
// Otherwise rename to eslint.config.cjs and convert imports to require().

export default [
  // 0) Ignore patterns (replaces .eslintignore)
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
  },

  // 1) Base recommended rules for JS
  js.configs.recommended,

  // 2) Plugins (Flat Config style)
  pluginImport.flatConfigs.recommended,
  pluginJsdoc.configs['flat/recommended'],

  // 3) Disable rules that conflict with Prettier
  prettier,

  // 4) Project-specific rules / settings
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        ResizeObserver: 'readonly',
        console: 'readonly',
        // add more globals if needed
      },
    },
    rules: {
      // Hygiene
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',

      // Imports (we’re bundling/ESM, so keep this relaxed)
      'import/no-unresolved': 'off',

      // JSDoc nudges (keep gentle to avoid noise)
      'jsdoc/require-jsdoc': [
        'warn',
        {
          contexts: [
            'FunctionDeclaration',
            'MethodDefinition',
            'ClassDeclaration',
            'ExportNamedDeclaration > FunctionDeclaration',
          ],
          require: { FunctionDeclaration: true, MethodDefinition: true, ClassDeclaration: true },
        },
      ],
      'jsdoc/require-param-type': 'warn',
      'jsdoc/require-returns-type': 'warn',
    },
  },

  {
    files: ['src/js/lib/**/*.js'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/no-undefined-types': 'off',
    },
  },
  {
    files: ['service-worker.js'],
    languageOptions: {
      globals: {
        // Service Worker / Worker globals
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Cache: 'readonly',
        CacheStorage: 'readonly',
      },
    },
    rules: {
      // Relax JSDoc for this file only (your code modules still follow project rules)
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
    },
  },
  {
  files: ['src/compat/terminology_shim.js'],
  rules: {
    'jsdoc/require-jsdoc': 'off',
    'jsdoc/require-param-description': 'off',
    'jsdoc/require-returns-description': 'off',
    'jsdoc/require-returns': 'off',
    'jsdoc/no-undefined-types': 'off',
  },
},
];
