import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Configuración de Vitest — archivo PROPIO, separado de `vite.config.ts`.
 *
 * POR QUÉ no se edita `vite.config.ts`: ese archivo define el build de
 * producción y las pruebas no deben tocarlo (`npm run build` tiene que seguir
 * saliendo 0 y sin cambios). Vitest prioriza `vitest.config.ts` y deja el
 * config de Vite intacto.
 *
 * - `plugins: [react()]` → transformación JSX automática, EXACTAMENTE la misma
 *   que en la app: un componente se compila igual en pruebas que en producción.
 * - `environment: 'jsdom'` → DOM real para Testing Library; sin servidor y sin
 *   navegador real.
 * - `setupFiles` → matchers de jest-dom (`toBeDisabled`, …) y guardia de red
 *   que impide cualquier `fetch` no mockeado (ver `src/test/setup.ts`).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
