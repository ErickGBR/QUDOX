/**
 * QUDOX - Controllers de salud (CAPA HTTP).
 *
 * Los dos endpoints de salud son los unicos sin dependencias: no tocan la
 * base de datos ni el mock de SAP, y sus services son sincronos. Por eso no
 * usan `envolverAsync`: no hay promesa que se pueda rechazar.
 *
 * Diferencia de formato (intencional y documentada en src/routes/salud.routes.ts):
 *  - `comprobarSaludCtrl`      envia el sobre `{ data }` del contrato.
 *  - `comprobarSaludApiCtrl`   envia el objeto PLANO `{ status, uptime,
 *                              timestamp }` que exige el chequeo de proceso.
 */

import type { Request, Response } from 'express';
import { comprobarSalud, comprobarSaludDetallada } from '../services/salud.service';
import { enviarDatos } from '../utils/respuestas';

/**
 * `GET /health`
 *
 * Respuesta 200: `{ data: { status: 'ok', timestamp: ISO8601 } }`
 * Errores: 500 (interno).
 */
export function comprobarSaludCtrl(_req: Request, res: Response): void {
  enviarDatos(res, comprobarSalud(), 200);
}

/**
 * `GET /api/health`
 *
 * Respuesta 200 (objeto plano, SIN sobre `{ data }`):
 * `{ status: 'ok', uptime: <segundos>, timestamp: ISO8601 }`
 * Errores: 500 (interno).
 *
 * `res.json` es seguro aqui sin el replacer de `enviarDatos` porque el
 * payload no contiene BigInt: solo strings y el numero de `process.uptime()`.
 */
export function comprobarSaludApiCtrl(_req: Request, res: Response): void {
  res.status(200).json(comprobarSaludDetallada());
}
