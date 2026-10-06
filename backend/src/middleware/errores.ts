/**
 * QUDOX - Middleware de errores: el UNICO lugar donde se escribe el sobre
 * de error `{ "error": { "codigo": "...", "mensaje": "..." } }`.
 *
 * ------------------------------------------------------------------
 * POR QUE CENTRALIZARLO
 * ------------------------------------------------------------------
 * El contrato fija un sobre de error unico para los cinco endpoints.
 * Si cada controller escribiera su propio `res.status(400).json({ error })`
 * seria facil que uno se olvide de una clave, que dos usen nombres de codigo
 * distintos o que un mensaje interno de SQL Server se filtre al cliente.
 * Con este middleware, un controller SOLO lanza `ErrorAplicacion`
 * (src/types/errores.ts) y el sobre se arma aqui, una unica vez.
 *
 * Ademas separa el detalle de diagnostico del mensaje de usuario:
 * `ErrorAplicacion.logDetalle` se loguea en el servidor y jamas sale en la
 * respuesta HTTP.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ErrorAplicacion, CODIGOS_ERROR } from '../types/errores';
import { envolverError } from '../types/api';

/**
 * 404 de ruta: se registra DESPUES de todas las rutas y ANTES del manejador de
 * errores. Si ninguna ruta respondio, se lanza el error de dominio y el
 * manejador de abajo lo convierte en el sobre correcto.
 *
 * Se declara con el tipo `RequestHandler` de Express y no con una firma
 * propia a proposito: Express tipa `use()` contra esa interfaz de tres
 * parametros, y una firma de dos (p. ej. `req, next`) no es asignable y el
 * compilador la interpretaria como un PathParams.
 */
export const noEncontrado: RequestHandler = (req, _res, _next) => {
  throw new ErrorAplicacion(
    CODIGOS_ERROR.RUTA_NO_ENCONTRADA,
    404,
    `No existe el recurso ${req.method} ${req.originalUrl}.`,
  );
};

/**
 * Manejador de errores. Debe tener EXACTAMENTE 4 parametros: Express lo
 * distingue de un middleware normal por la aridad, y con menos parametros
 * lo trataria como middleware corriente y nunca se ejecutaria.
 *
 * @param _next No se usa porque aqui la peticion termina siempre; el nombre
 *              con `_` documenta que es obligatorio solo por aridad.
 */
export function manejadorErrores(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Si la respuesta ya empezo a salir, no se puede reescribir: se delega en el
  // manejador por defecto de Express para que cierre la conexion.
  if (res.headersSent) {
    return;
  }

  // --- Caso 1: error de dominio, controlado y con status ya decidido ---
  if (err instanceof ErrorAplicacion) {
    if (err.logDetalle) {
      console.error(
        `[error-controlado] ${req.method} ${req.originalUrl} ` +
          `codigo=${err.codigo} detalle=${err.logDetalle}`,
      );
    }
    res.status(err.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(envolverError(err.codigo, err.mensaje)));
    return;
  }

  // --- Caso 2: JSON malformado en el body (express.json) ---
  // No es un bug del servidor sino una peticion invalida: 422, igual que un
  // fallo de express-validator. Se distingue por la marca que deja body-parser.
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    res.status(422);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(
      JSON.stringify(
        envolverError(
          CODIGOS_ERROR.VALIDACION_FALLIDA,
          'El cuerpo de la peticion no es JSON valido.',
        ),
      ),
    );
    return;
  }

  // --- Caso 3: cualquier otra cosa es un bug. 500 y logueado. ---
  // El stackTrace completo se loguea aqui y NUNCA se devuelve: filtrar el
  // detalle por consola es como se filtran nombres de tablas y de usuarios.
  const mensaje = err instanceof Error ? err.message : String(err);
  const pila = err instanceof Error ? err.stack : '(sin stack)';
  console.error(`[error-interno] ${req.method} ${req.originalUrl}`);
  console.error(`[error-interno] mensaje: ${mensaje}`);
  console.error(`[error-interno] pila: ${pila}`);

  res.status(500);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(
    JSON.stringify(
      envolverError(
        CODIGOS_ERROR.ERROR_INTERNO,
        'Error interno del servidor. El detalle se registro en el log del servidor.',
      ),
    ),
  );
}