/**
 * QUDOX - Controller de centros de costo (CAPA HTTP).
 *
 * Es el endpoint mas simple de los cinco: sin parametros, sin validacion y
 * con un unico status posible de exito (200). Se mantiene la cadena completa
 * Routes -> Controller -> Service igual que en el resto, para que cualquier
 * consumidor de la API vea siempre la misma forma.
 */

import type { Request, Response } from 'express';
import { listarCentrosCosto } from '../services/centrosCosto.service';
import { enviarDatos } from '../utils/respuestas';
import { envolverAsync } from '../utils/async';

/**
 * `GET /api/centros-costo`
 *
 * Respuesta 200: `{ data: CentroCosto[] }`
 * Errores: 500 (interno).
 */
export const listarCentrosCostoCtrl = envolverAsync(async (_req: Request, res: Response) => {
  // El array va directo en `data`, sin envolverlo en un objeto con la
  // propiedad `centrosCosto`: el sobre YA es la envoltura que pide
  // el contrato.
  const centrosCosto = await listarCentrosCosto();
  enviarDatos(res, centrosCosto, 200);
});