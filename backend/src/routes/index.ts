/**
 * QUDOX - Enrutador raiz.
 *
 * Este archivo es el mapa de la API: el unico lugar donde se decide que
 * prefijo corresponde a cada grupo de rutas. Los archivos de `routes/` declaran
 * solo la parte relativa, asi que la ruta completa siempre se lee aqui y en
 * un solo sitio.
 *
 * Mapa completo (contrato de la API):
 *
 *   GET  /api/planillas/:id
 *   GET  /api/planillas/:id/movimientos?centroCostoId=
 *   GET  /api/centros-costo
 *   POST /api/planillas/:id/enviar-sap
 *   GET  /health
 *
 * ------------------------------------------------------------------
 * NOTA SOBRE EL ORDEN EN QUE SE MONTA
 * ------------------------------------------------------------------
 * Los grupos especificos (`/api/planillas`, `/api/centros-costo`) se montan
 * ANTES que `/` de salud, para que el mapa se lea igual que el contrato.
 * Ninguno de los grupos tiene ruta comodin, asi que una peticion a
 * `/api/planillas` (sin id) NO coincide con ninguna y cae en el 404 de
 * src/middleware/errores.ts.
 */

import { Router } from 'express';
import rutasPlanillas from './planillas.routes';
import rutasCentrosCosto from './centrosCosto.routes';
import rutasSalud from './salud.routes';

const rutas = Router();

// Recursos de dominio bajo /api.
rutas.use('/api/planillas', rutasPlanillas);
rutas.use('/api/centros-costo', rutasCentrosCosto);

// Salud en la raiz.
rutas.use('/', rutasSalud);

export default rutas;