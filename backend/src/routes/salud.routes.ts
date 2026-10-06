/**
 * QUDOX - Rutas de salud.
 *
 *   GET /health       (sobre `{ data }`)
 *   GET /api/health   (chequeo de proceso — objeto plano)
 *
 * ------------------------------------------------------------------
 * POR QUE DOS RUTAS Y NO UNA
 * ------------------------------------------------------------------
 * `/health` es el endpoint DEL CONTRATO: vive en la raiz, no consume el
 * dominio y responde dentro del sobre `{ "data": ... }` porque el contrato
 * lo exige para los cinco endpoints y no tiene excepcion. Su consumidor es
 * el frontend.
 *
 * `/api/health` es el chequeo de proceso que pide el contrato tecnico:
 * devuelve el objeto PLANO `{ status, uptime, timestamp }` en la
 * raiz del cuerpo, con `uptime` para detectar reinicios. Vive bajo `/api`
 * para que ambas rutas convivan sin pisarse ni ambiguedad de formato.
 *
 * Ninguna de las dos toca la base de datos (ver src/services/salud.service.ts).
 */

import { Router } from 'express';
import { comprobarSaludCtrl, comprobarSaludApiCtrl } from '../controllers/salud.controller';

const rutas = Router();

/** GET /health — version con sobre `{ data }`. */
rutas.get('/health', comprobarSaludCtrl);

/** GET /api/health — version plana con uptime del proceso. */
rutas.get('/api/health', comprobarSaludApiCtrl);

export default rutas;
