/**
 * QUDOX - Envoltorio para handlers `async`.
 *
 * ------------------------------------------------------------------
 * EL PROBLEMA QUE RESUELVE (trampa clasica de Express 4)
 * ------------------------------------------------------------------
 * Express 4 NO captura los rechazos de promesa de un handler `async`. Si el
 * service hace `await prisma...` y la base de datos esta caida, la funcion
 * devuelve una promesa rechazada, el handler la ignora y Express NUNCA se
 * entera: la peticion queda colgada hasta que el cliente agota su tiempo de
 * espera, y el middleware de errores de src/middleware/errores.ts no llega a
 * ejecutarse. El sintoma es un endpoint que "se cuelga" en vez de un 500.
 *
 * (Express 5 ya lo hace nativo; en Express 4 el envoltorio es obligatorio.)
 *
 * `envolverAsync` conecta el rechazo con `next(err)`, que es el canal que
 * Express ya entiende, y de ahi el error llega al sobre unico de error.
 */

import type { NextFunction, Request, Response } from 'express';

/** Firma de un handler asincrono sin `next` (el `next` lo pone el envoltorio). */
export type HandlerAsincrono = (req: Request, res: Response) => Promise<void>;

/**
 * Convierte un handler `async` en un middleware de Express de 3 parametros,
 * con los rechazos conectados al manejador de errores.
 */
export function envolverAsync(handler: HandlerAsincrono) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}