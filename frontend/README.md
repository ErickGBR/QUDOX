# Frontend — Detalle de planilla

Pantalla "Detalle de planilla" de la prueba técnica QUDOX: tabla de movimientos
con filtro por centro de costos, barra de totales (debe/haber), botón "Enviar a
SAP" deshabilitado si la planilla no está aprobada, y estados de carga y error.

## Stack

- **React 19 + TypeScript 6** — componentes tipados de extremo a extremo.
- **Vite 8** — desarrollo con HMR y build de producción.
- **Zustand** — estado global ligero (ver más abajo).
- **Oxlint** — análisis estático de código.
- **Vitest + Testing Library** — pruebas de unidad e integración (ver abajo).

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # desarrollo en http://localhost:5173
npm run lint       # análisis estático
npm test           # pruebas con Vitest (48 escenarios)
npm run build      # typecheck (tsc -b) + build de producción en dist/
npm run preview    # servir el build de producción
```

Typecheck aislado, sin emisión: `npx tsc --noEmit -p tsconfig.app.json`.

## ¿Por qué Zustand?

Cuatro componentes comparten un mismo estado: el **filtro por centro de costos**,
la **tabla de movimientos**, la **barra de totales** y el **botón "Enviar a SAP"**.
Al cambiar el filtro, tabla y totales deben recalcularse al instante y el botón
depende de la aprobación de la planilla; ese estado vive en un único store de
Zustand fuera del árbol, evitando prop-drilling y re-renders innecesarios sin la
pesadez de Redux para un caso de uso acotado.

## Pruebas

`npm test` corre la suite con **Vitest + Testing Library**: 48 escenarios en
7 archivos — store, cliente HTTP, formateo, los tres componentes y la
integración de `App.tsx` con la capa de API mockeada. La guardia de red del
setup (`src/test/setup.ts`) hace fallar de inmediato cualquier `fetch` real
que se cuele sin mock.
