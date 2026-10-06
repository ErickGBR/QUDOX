/**
 * Setup global de Vitest (se ejecuta antes de CADA archivo de pruebas).
 *
 * Dos responsabilidades:
 *  1. `@testing-library/jest-dom/vitest` → registra los matchers extendidos
 *     (`toBeDisabled`, `toBeInTheDocument`, `toBeEnabled`, …) sobre el `expect`
 *     de Vitest. Importarlo aquí (y no en cada test) hace que la augmentación de
 *     tipos esté disponible en todo el programa, sin tocar `tsconfig*.json`.
 *  2. Guardia de red: se instala un `fetch` que FALLA en cuanto se le llame sin
 *     mock. Regla del proyecto: "zero real fetch calls" — si algún test se
 *     cuela, el fallo es ruidoso e inmediato en lugar de un intento de red
 *     silencioso. Cada test que necesite una respuesta la sobrescribe con
 *     `vi.stubGlobal('fetch', …)` dentro del `it`, que se ejecuta DESPUÉS de
 *     este `beforeEach` y por tanto gana.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('FETCH_SIN_MOCK_EN_TESTS'))),
  )
})

// Testing Library solo hace auto-cleanup si existe un `afterEach` GLOBAL;
// Vitest corre con `globals: false` (los tests importan de 'vitest'), así que
// el cleanup se declara aquí explícitamente: sin él, el DOM de un test
// filtraría al siguiente.
afterEach(() => {
  cleanup()
})
