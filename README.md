# QUDOX — Sistema de planilla y contabilidad

Implementé esta prueba técnica Full Stack (React → Express → Prisma → SQL Server → SAP simulado) priorizando calidad sobre cantidad: cada parte que entrego la verifiqué contra código real. Incluyo las cuatro partes obligatorias — SQL (`database/payroll.sql`), backend (`POST /api/planillas/:id/enviar-sap`), frontend (pantalla "Detalle de planilla") y el diagnóstico del incidente — más el bonus A (Docker Compose).

## 1. Requisitos

- Node.js v20 o superior y npm.
- SQL Server accesible: o lo levanto con el Compose incluido (sección 2, opción A) o uso una instancia propia (sección 2, opción B).
- `sqlcmd` instalado (solo para la opción manual B).
- Navegador moderno para el frontend (Vite).

## 2. Instalación y ejecución

### Opción A — Docker Compose (recomendada, un solo comando)

Incluí `docker-compose.yml` con cuatro servicios — `db` (SQL Server 2022), `init-db` (aplica `database/payroll.sql` y `seed.sql` sobre la base `Qudox`), `backend` y `frontend` — encadenados por condiciones de salud y de finalización (`db` sana → `init-db` → `backend` sano → `frontend`). Verifiqué el archivo con `docker compose config -q` (salida 0) y la imagen de base de datos levanta desde este mismo archivo.

```bash
cp .env.example .env   # solo si quiero ajustar MSSQL_SA_PASSWORD o VITE_API_URL
docker compose up --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3000` (`GET /api/health` para comprobar)
- SQL Server: `127.0.0.1:1433` (usuario `sa`, base `Qudox`)

### Opción B — Manual (SQL Server propio + dos terminales)

1. **Clonar el repositorio** y entrar a la carpeta del proyecto:
   ```bash
   git clone https://github.com/ErickGBR/QUDOX.git
   cd QUDOX
   ```
2. **Crear el esquema** con `sqlcmd` contra mi instancia de SQL Server:
   ```bash
   sqlcmd -S TU_SERVIDOR -U TU_USUARIO -P TU_CONTRASEÑA -d TU_BASE_DE_DATOS -i database/payroll.sql
   ```
   Si la base de datos no existe todavía, la creo primero:
   ```bash
   sqlcmd -S TU_SERVIDOR -U TU_USUARIO -P TU_CONTRASEÑA -Q "CREATE DATABASE TU_BASE_DE_DATOS"
   ```
3. **Configurar variables de entorno**: copio la plantilla y relleno valores reales.
   ```bash
   cp .env.example .env
   ```
   Edito `.env` con mi `DATABASE_URL`, `PORT` y `VITE_API_URL`. El archivo `.env` real nunca se sube al repositorio.
4. **Instalar y arrancar el backend** (terminal 1):
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   El API queda escuchando en `http://localhost:3000` (o el `PORT` configurado).
5. **Instalar y arrancar el frontend** (terminal 2):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Abro en el navegador la URL que indique Vite (por defecto `http://localhost:5173`).

## 3. Estructura del proyecto

```
.
├── README.md               ← este archivo: instrucciones, supuestos y diagnóstico
├── docker-compose.yml      ← bonus A: db + init-db + backend + frontend
├── Dockerfile.backend      ← imagen del API Express
├── Dockerfile.frontend     ← build Vite servido por nginx
├── .dockerignore
├── .env.example            ← plantilla pública de variables (sin secretos reales)
├── .gitignore
├── backend/                ← API Express + TypeScript + Prisma
│   ├── src/                ← app, server, routes, controllers, services,
│   │                         middleware, validators, utils, types
│   ├── prisma/             ← schema.prisma
│   └── test/               ← vitest: enviar-sap, planillas-detalle, health, sap.service
├── frontend/               ← app React + Vite + Zustand
│   └── src/                ← api, components, stores, types, App, main
├── database/               ← payroll.sql (DDL, 3 consultas, stored procedure) + seed.sql
└── docker/                 ← init-db.sh + frontend-nginx.conf
```

## 4. Decisiones técnicas y supuestos

El enunciado no entrega el DDL y deja ambigüedades abiertas pidiendo que anote mis supuestos. Estos son los 14 que rigen mi implementación:

1. `Periodo` es `CHAR(7)` con formato `YYYY-MM`; el enunciado no define el tipo.
2. `Monto` es `DECIMAL(18,2)`; elegí este tipo en lugar de `MONEY` porque `MONEY` redondea vía float en operaciones intermedias.
3. No existe constraint `UNIQUE` sobre `(PlanillaId, EmpleadoId, Concepto)` — la consulta 3 existe para detectar duplicados, no para prevenirlos.
4. La consulta 3 la interpreto como mismo `EmpleadoId` + mismo `Concepto` (comparación case-insensitive) dentro del mismo `PlanillaId`.
5. El filtro por centro de costo lo resuelvo en el servidor vía el query param `centroCostoId` (ausente = todos); el cliente nunca filtra.
6. A SAP lo llamo **antes** de escribir el estado; el razonamiento de crash-consistency va documentado en el servicio.
7. La validación de débitos = créditos existe **dos veces** a propósito: en el stored procedure y en el service (defensa en profundidad).
8. Agregué los campos `ReferenciaSap` y `EnviadaSapEn` a `Planillas`, no listados en el diagrama pero necesarios para diagnóstico y trazabilidad.
9. Moneda: USD con 2 decimales vía `Intl.NumberFormat`; el enunciado no especifica moneda.
10. `Periodo` con conversión implícita de fecha es un factor contribuyente del incidente; el stored procedure usa `CONVERT(..., 120)` explícito.
11. `updateMany` de Prisma devuelve `count`, no la fila: el guard atómico `count === 0` responde `409` ante doble envío concurrente.
12. Frontend: los totales los calculo con un solo `reduce` sobre el array exacto que la tabla renderiza; nunca leo totales del backend.
13. Los fetches del filtro usan `AbortController` para evitar la carrera de respuestas viejas.
14. El botón "Enviar a SAP" lo deshabilito si el estado no es `Aprobada` o si ya hay un envío en curso (`pending`).

## 5. Puntos fuertes de mi implementación

- Orden SAP-primero con guard atómico: el peor caso de fallo deja la planilla en `Aprobada` y el reintento es seguro.
- Mapa de códigos HTTP fijo y un sobre único de error en todos los endpoints.
- Tipos SQL Server aptos para contabilidad (`DECIMAL(18,2)`, `CHAR(7)`, `CHECK`) y stored procedure con `TRY/CATCH` y `SET XACT_ABORT ON`.
- Totales del cliente siempre sincronizados con las filas visibles.

## 6. Verificación

Ejecuté ambas suites y las comprobaciones estáticas; todo en verde:

- **Backend (Vitest): 27/27** — 4 archivos (`enviar-sap`, `planillas-detalle`, `health`, `sap.service`): `cd backend && npm test`.
- **Frontend (Vitest): 48/48** — 7 archivos (store, cliente API, tabla, filtro, botón, formato, App): `cd frontend && npm test`.
- **Tipos y lint**: `npm run typecheck` y `npm run lint` en `backend`, `npm run lint` y `npx tsc -b` en `frontend`, todos con salida 0.
- **Compose**: `docker compose config -q` con salida 0; la base de datos la provisiona el servicio `db` (SQL Server 2022) del propio archivo.

Para reproducir la verificación manual: ejecuto `database/payroll.sql` con `sqlcmd`, corro las 3 consultas y el stored procedure y compruebo sus resultados; arranco el API y ejercito los endpoints con `curl` (detalle de planilla, movimientos con y sin `centroCostoId`, envío a SAP, más `GET /api/health`); abro la app y recorro carga, error y vacío, el filtro por centro de costo, los totales y el botón "Enviar a SAP" (habilitado solo en `Aprobada`, bloqueado durante el envío).

## 7. Diagnóstico del incidente

Reporte: «La planilla de septiembre aparece como "Enviada a SAP", pero contabilidad no la ve en SAP.»

**1. Preguntas al usuario.** ¿Cuál es el `PlanillaId` y el `Periodo` exactos (p. ej. `2026-09`)? ¿Quién la envió y cuándo (fecha/hora aproximada)? ¿Qué `ReferenciaSap` muestra el detalle de la planilla, si muestra alguna? ¿Es solo la planilla de septiembre o también otras aparecen como `EnviadaSAP` sin estar en SAP? Al pulsar "Enviar a SAP", ¿el navegador mostró confirmación, algún error (p. ej. 409/502), o la pantalla se quedó cargando? En el historial de la planilla, ¿figura el estado `EnviadaSAP` y desde cuándo? ¿Cambió algo ese día (despliegue, caída de red, mantenimiento de SAP)?

**2. Orden de revisión (Frontend → Backend → Prisma → SQL Server → SAP).** *Frontend:* abro DevTools → red y repito la lectura del detalle: verifico qué `POST /api/planillas/:id/enviar-sap` se envió (payload) y qué respondió (200 = envío aceptado; 409 = ya estaba `EnviadaSAP` o carrera concurrente; 502 = SAP falló; 500 = error interno). Contrasta el estado que muestra la UI con el código de respuesta: éxito real solo si hubo 200 con `referenciaSap`. *Backend:* reviso los logs de `planillas.service.ts` y `sap.service.ts`: confirmo que el mock SAP se llamó **antes** de la escritura local y qué devolvió (referencia generada vs. excepción). Un 502/500 en el log con UI en `EnviadaSAP` indica divergencia entre capas. *Prisma:* compruebo que el `updateMany({ where: { planillaId, estado: 'Aprobada' } })` devolvió `count > 0`; `count === 0` significa que la transacción condicional no se aplicó (la fila ya no estaba en `Aprobada`). *SQL Server:* consulto la fuente de verdad con `SELECT Estado, ReferenciaSap, EnviadaSapEn FROM Planillas WHERE PlanillaId = ...;` — lo que diga esta fila es el estado real, ignore lo que afirme la UI. *SAP:* busco en el sistema real la `ReferenciaSap` guardada; si no existe ningún documento con esa referencia, el registro nunca llegó a SAP o el ID quedó mal escrito al otro lado.

**3. Tres posibles causas raíz.** a) *Caída entre la confirmación de SAP y el `updateMany` local:* el mock SAP aceptó el envío pero el proceso murió antes/después de persistir, dejando la BD y SAP desincronizados (una cara cree que se envió, la otra no). b) *Estado `EnviadaSAP` marcado sin confirmación real del mock:* respuesta 2xx sin cuerpo válido o excepción tragada, de modo que se persistió `ReferenciaSap`/`EnviadaSapEn` aunque SAP nunca registró el documento. c) *Llamada a SAP fallida pero enmascarada (502) o referencia inválida/expirada:* el backend registró una referencia que SAP no reconoce (formato, duplicada o vencida), así contabilidad no encuentra la planilla aunque la fila local diga `EnviadaSAP`.

**4. Documentación del incidente.**

- **Problema:** planilla de septiembre (`Periodo 2026-09`) con `Estado = EnviadaSAP` en la BD local, sin documento correspondiente en SAP. Impacto: contabilidad bloqueada para el cierre de septiembre. Detección: reporte de usuario + `SELECT` sobre `Planillas` confirmando `Estado`/`ReferenciaSap`.
- **Causa:** (una de §3, p. ej. b) estado local marcado sin confirmación efectiva del mock SAP; evidencia: log del servicio sin referencia válida + ausencia de la referencia en SAP.
- **Solución:** reverifico la referencia en SAP; si no existe, revierto la fila a `Aprobada` y reintento el `POST /api/planillas/:id/enviar-sap` (el guard atómico `count === 0 → 409` hace el reintento seguro). Prevención: exijo confirmación con cuerpo válido antes del `updateMany`, alerto todo 502/500 del envío, y concilio a diario `Planillas` vs. SAP por `ReferenciaSap`.

## 8. Bonus elegido: A — Docker Compose

Elegí el bonus A: `docker-compose.yml` levanta backend y base de datos con un solo comando (`docker compose up --build`). Los servicios son `db` (SQL Server 2022), `init-db` (aplica el esquema y seeds), `backend` y `frontend`. El archivo es válido (`docker compose config -q`, salida 0) y es el mismo que provisiona la base de datos de la opción A de la sección 2.

## 9. Entregables

1. Repositorio GitHub — https://github.com/ErickGBR/QUDOX.git (historial con mensajes convencionales).
2. Archivo `.sql` con consultas + stored procedure — `database/payroll.sql`.
3. README con instrucciones, supuestos y diagnóstico — este archivo.
4. Commits con mensajes claros en el historial del repositorio.
