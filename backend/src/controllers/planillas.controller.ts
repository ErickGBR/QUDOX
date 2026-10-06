/**
 * QUDOX - Controllers de planilla (CAPA HTTP).
 *
 * ------------------------------------------------------------------
 * QUE HACE Y QUE NO HACE UN CONTROLLER
 * ------------------------------------------------------------------
 * Hace: leer y validar `req`, delegar en el service, y responder con el
 *       sobre unico usando `enviarDatos`.
 * No hace: decisiones de negocio, ni consultas a Prisma, ni try/catch.
 *
 * ------------------------------------------------------------------
 * POR QUE NO HAY TRY/CATCH EN ESTE ARCHIVO
 * ------------------------------------------------------------------
 * Express 4 NO captura errores de handlers `async`. Sin un try/catch, una
 * promesa rechazada se convierte en una peticion colgada hasta que el cliente
 * agota el tiempo de espera, y el middleware de errores nunca se entera.
 * Por eso se envuelve con `envolverAsync`, que encadena el rechazo al
 * `next(err)` de Express y asi el error llega al sobre unico.
 *
 * Los codigos HTTP (404/400/409/422/502/500) los decide el service o el
 * middleware de validacion; aqui no se fija ninguno salvo el 200.
 */

import type { Request, Response } from 'express';
import {
  obtenerMovimientos,
  obtenerPlanilla,
  registrarEnvioSap,
} from '../services/planillas.service';
import { enviarDatos } from '../utils/respuestas';
import { envolverAsync } from '../utils/async';

/**
 * `GET /api/planillas/:id`
 *
 * Respuesta 200: `{ data: PlanillaCabecera }`
 * Errores: 404 (no existe), 422 (id no numerico), 500 (interno).
 */
export const obtenerPlanillaCtrl = envolverAsync(async (req: Request, res: Response) => {
  // `req.params.id` ya viene como `number`: la cadena de validacion de
  // src/validators/planillas.validators.ts lo limpio con `.toInt()` y el
  // middleware `validar` ya corto con 422 si no era un entero valido.
  const planillaId = req.params.id as unknown as number;

  const planilla = await obtenerPlanilla(planillaId);
  enviarDatos(res, planilla, 200);
});

/**
 * `GET /api/planillas/:id/movimientos?centroCostoId=`
 *
 * Respuesta 200: `{ data: Movimiento[] }`
 * Errores: 404 (planilla inexistente), 422 (id o centroCostoId no
 * numericos), 500 (interno).
 *
 * Nota sobre el 400 de la tabla del contrato: la fila de este endpoint
 * lista 400 entre los posibles, pero el mapa HTTP fijo asigna el 400 a la
 * transicion de estado invalida, que es exclusiva de `enviar-sap`. Un
 * `centroCostoId` mal formado es entrada invalida y cae en el 422 de
 * express-validator, no en un 400 inventado aqui.
 *
 * ADVERTENCIA de dominio: `PlanillaDetalle` NO tiene
 * columna `CentroCostoId`. El filtro se aplica sobre `empleado.centroCostoId`
 * dentro del service; `req.query.centroCostoId` es solo el dato de entrada.
 */
export const obtenerMovimientosCtrl = envolverAsync(async (req: Request, res: Response) => {
  const planillaId = req.params.id as unknown as number;

  // Si el query param no vino o vino vacio, el validador lo omite y queda
  // `undefined`, que el service interpreta como "todos los movimientos".
  // NO usar `Number(req.query.centroCostoId)`: `Number('')` es 0, que parece
  // un id valido y filtraria por un centro de costo inexistente.
  const query = req.query as { centroCostoId?: number };
  const centroCostoId = query.centroCostoId;

  const movimientos = await obtenerMovimientos(planillaId, centroCostoId);
  enviarDatos(res, movimientos, 200);
});

/**
 * `POST /api/planillas/:id/enviar-sap`
 *
 * Respuesta 200: `{ data: ResultadoEnvioSap }`
 * Errores: 404 (no existe), 400 (estado 'Borrador' = transicion invalida),
 * 409 (doble envio / count === 0), 422 (id no numerico), 502 (SAP caido),
 * 500 (interno).
 *
 * El body es `{}` vacio por contrato: la transicion no recibe parametros,
 * asi que no hay nada que leer de `req.body`. El orden SAP-primero y el
 * guard atomico viven en src/services/planillas.service.ts.
 */
export const registrarEnvioSapCtrl = envolverAsync(async (req: Request, res: Response) => {
  const planillaId = req.params.id as unknown as number;

  const resultado = await registrarEnvioSap(planillaId);
  enviarDatos(res, resultado, 200);
});
