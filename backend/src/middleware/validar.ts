/**
 * QUDOX - Middleware que convierte el resultado de express-validator en el
 * error 422 del contrato.
 *
 * ------------------------------------------------------------------
 * POR QUE UN MIDDLEWARE Y NO VALIDAR DENTRO DEL HANDLER
 * ------------------------------------------------------------------
 * express-validator acumula los errores en `req` y no lanza nada: si nadie
 * los revisa, una peticion invalida llegaria hasta el service. Este
 * middleware es el unico que consulta `validationResult`, y va SIEMPRE
 * despues de la cadena de validadores y antes del controller. Con eso los
 * controllers no repiten el chequeo y el 422 sale siempre con el mismo
 * formato de sobre.
 *
 * El mensaje reune los campos fallidos dentro del unico campo `mensaje` que
 * permite el contrato: el sobre de error tiene exactamente dos claves, asi
 * que la lista de campos se texto, no se agrega un campo nuevo.
 */

import type { RequestHandler } from 'express';
import { validationResult } from 'express-validator';
import { CODIGOS_ERROR, ErrorAplicacion } from '../types/errores';

/**
 * Forma de un error de validacion tal como lo entrega express-validator 7.
 * `path` llega como `string` en los errores de campo y como arreglo en
 * algunos errores de campo anidado, por eso se aceptan las dos formas y se
 * normalizan a texto con `.` como separador.
 */
interface DetalleValidacion {
  path?: string | (string | number)[];
  param?: string;
  msg?: unknown;
}

/**
 * Formatea un error de validacion como `campo: motivo`.
 * El campo se lee igual que en el contrato (`centroCostoId`, `id`).
 */
function formatearDetalle(detalle: DetalleValidacion): string {
  const ruta = detalle.path;
  const campo = Array.isArray(ruta) ? ruta.join('.') : (ruta ?? detalle.param ?? 'parametro');
  const motivo = typeof detalle.msg === 'string' ? detalle.msg : 'valor invalido';
  return `${campo}: ${motivo}`;
}

/**
 * Middleware de validacion. Si hay errores lanza `ErrorAplicacion` con
 * status 422 y el codigo `VALIDACION_FALLIDA`; si no, sigue la cadena.
 * El detalle se registra en el log del servidor y no viaja al cliente.
 */
export const validar: RequestHandler = (req, _res, next) => {
  const resultado = validationResult(req);

  if (resultado.isEmpty()) {
    next();
    return;
  }

  const detalles = resultado.array().map(formatearDetalle);

  throw new ErrorAplicacion(
    CODIGOS_ERROR.VALIDACION_FALLIDA,
    422,
    `Peticion invalida. ${detalles.join('; ')}`,
    `validacion fallida en ${req.method} ${req.originalUrl}: ${detalles.join(' | ')}`,
  );
};