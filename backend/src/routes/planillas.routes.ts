/**
 * QUDOX - Rutas de planilla.
 *
 * Se montan bajo `/api/planillas` (ver src/routes/index.ts), de modo que las
 * rutas de este archivo se escriben relativas a ese prefijo y aqui solo
 * aparecen los segmentos que faltan. Las rutas COMPLETAS son:
 *
 *   GET  /api/planillas/:id
 *   GET  /api/planillas/:id/movimientos?centroCostoId=
 *   POST /api/planillas/:id/enviar-sap
 *
 * ------------------------------------------------------------------
 * EL ORDEN DE LOS MIDDLEWARE ES PARTE DEL CONTRATO, NO ESTILO
 * ------------------------------------------------------------------
 *   1. cadena de express-validator  -> acumula los fallos en `req`
 *   2. `validar`                     -> si hay fallos, lanza 422 y corta
 *   3. controller                    -> solo se ejecuta con entrada valida
 *
 * Si `validar` se moviera despues del controller, el controller leeria
 * `req.params.id` como texto y el service recibiria un id sin verificar.
 */

import { Router } from 'express';
import {
  obtenerMovimientosCtrl,
  obtenerPlanillaCtrl,
  registrarEnvioSapCtrl,
} from '../controllers/planillas.controller';
import { validar } from '../middleware/validar';
import {
  validarCentroCostoIdOpcional,
  validarIdPlanilla,
} from '../validators/planillas.validators';

const rutas = Router();

/**
 * GET /api/planillas/:id/movimientos?centroCostoId=
 * El query param es opcional; `centroCostoId=` vacio significa "todos".
 *
 * Va declarada ANTES de `/:id` por legibilidad (no por necesidad: `/:id`
 * solo matchea un segmento y no captura `/1/movimientos`).
 */
rutas.get(
  '/:id/movimientos',
  validarIdPlanilla,
  validarCentroCostoIdOpcional,
  validar,
  obtenerMovimientosCtrl,
);

/** GET /api/planillas/:id */
rutas.get('/:id', validarIdPlanilla, validar, obtenerPlanillaCtrl);

/**
 * POST /api/planillas/:id/enviar-sap
 * Body `{}` vacio por contrato: la transicion de estado no recibe parametros,
 * por eso aqui no hay validador de body (no habria ninguna regla que fallar).
 */
rutas.post('/:id/enviar-sap', validarIdPlanilla, validar, registrarEnvioSapCtrl);

export default rutas;