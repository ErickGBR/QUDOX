// ===================================================================
// QUDOX - Configuracion de ESLint (frontend)
//
// Flat config estilo ESLint v9+ (Vite 8 + React 19 + TS). Set estandar
// de Vite React, sin prettier:
//   - typescript-eslint/recommended  (reglas recomendadas de TS)
//   - eslint-plugin-react-hooks      (reglas de hooks de React)
//   - eslint-plugin-react-refresh    (reglas de Fast Refresh)
// package.json declara "type": "module", por eso export default.
// ===================================================================
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  {
    // Ignorados globales: build, dependencias y recursos de Docker.
    ignores: ['dist/**', 'node_modules/**', 'docker/**'],
  },

  // Reglas recomendadas de typescript-eslint.
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Reglas de hooks (rules-of-hooks y exhaustive-deps, mas las
      // reglas de "React Compiler" que trae el preset recommended).
      ...reactHooks.configs['recommended-latest'].rules,

      // Un modulo de React solo debe exportar componentes (Fast Refresh).
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Alineado con noUnusedLocals de tsconfig: lo prefijado con "_"
      // se declara a proposito.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
]
