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
