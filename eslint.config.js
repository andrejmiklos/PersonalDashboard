import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/', '**/.wrangler/', '**/coverage/', '**/node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['*.js', '*.ts', 'scripts/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/display/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The tablet runs Chrome 95 (docs/tablet-compat-results.md). Newer JS built-ins are already type errors
    // (lib ES2022); these are the web APIs the DOM typings know but Chrome 95 lacks. Tests run in Node.
    files: ['apps/display/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'structuredClone', message: 'Chrome 98+; not on the Chrome 95 tablet.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'AbortSignal',
          property: 'timeout',
          message: 'Chrome 103+; use AbortController + setTimeout.',
        },
        { object: 'AbortSignal', property: 'any', message: 'Chrome 116+; not on the Chrome 95 tablet.' },
        {
          object: 'Response',
          property: 'json',
          message: 'Chrome 105+; use new Response(JSON.stringify(…)).',
        },
        { object: 'URL', property: 'canParse', message: 'Chrome 120+; use try { new URL(…) }.' },
        {
          object: 'document',
          property: 'startViewTransition',
          message: 'Chrome 111+; not on the Chrome 95 tablet.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[property.name=/^(checkVisibility|showPicker|throwIfAborted|formatRange|showPopover|hidePopover|togglePopover)$/]',
          message: 'Web API newer than Chrome 95; not on the tablet.',
        },
      ],
    },
  },
  {
    // Copied to the tablet without transpiling: must stay ES5.
    files: ['apps/display/public/**/*.js'],
    languageOptions: { ecmaVersion: 5, sourceType: 'script', globals: globals.browser },
  },
  {
    // Syntax probes of the compatibility spike use newer syntax on purpose.
    files: ['apps/display/public/spike-es2015.js', 'apps/display/public/spike-es2017.js'],
    languageOptions: { ecmaVersion: 2017 },
  },
  prettier,
);
