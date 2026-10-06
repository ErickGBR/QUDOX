/**
 * QUDOX - Rutas de centros de costo.
 *
 * Se montan bajo `/api/centros-costo`. Es el unico recurso sin parametro de
 * ruta, asi que no hay cadena de express-validator que anadir: no hay entrada
 * que validar.
 *
 *   GET /api/centros-costo
 */

import { Router } from 'express';
import { listarCentrosCostoCtrl } from '../controllers/centrosCosto.controller';

const rutas = Router();

/**
 * GET /api/centros-costo
 * Sin query params y sin body: siempre responde 200 con el catalogo completo
 * o 500 si la base de datos no responde.
 */
rutas.get('/', listarCentrosCostoCtrl);

export default rutas;