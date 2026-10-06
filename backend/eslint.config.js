// ===================================================================
// QUDOX - Configuracion de ESLint (backend)
//
// Flat config estilo ESLint v9+ (este repo instala ESLint 10, que ya
// solo acepta flat config). Se usa un unico preset:
//   - typescript-eslint/recommended  (reglas recomendadas de TS)
// El backend es CommonJS (package.json sin "type": "module"), por eso
// este archivo se exporta con module.exports y no con export default.
// ===================================================================
const tseslint = require('typescript-eslint');

module.exports = [
  {
    // Ignorados globales: artefactos de build, dependencias y recursos
    // de Docker (los Dockerfile/docker/** se gestionan aparte).
    ignores: ['dist/**', 'node_modules/**', 'docker/**', 'prisma/**'],
  },

  // Reglas recomendadas de typescript-eslint, acotadas a los .ts:
  // el backend es CommonJS y su propio eslint.config.js usa require(),
  // asi que no debe pasar por las reglas de TS ("no-require-imports").
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),

  {
    // El lint se centra en el codigo fuente real del servicio.
    files: ['src/**/*.ts'],
    rules: {
      // Alineado con noUnusedParameters de tsconfig: los argumentos y
      // variables prefijados con "_" se declaran a proposito.
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
];
