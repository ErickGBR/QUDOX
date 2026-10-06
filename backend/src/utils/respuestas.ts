/**
 * QUDOX - Helper central del sobre de exito.
 *
 * ------------------------------------------------------------------
 * POR QUE EXISTE
 * ------------------------------------------------------------------
 * El contrato exige que TODAS las respuestas exitosas usen el mismo
 * sobre `{ "data": <T> }`. Repetir `res.json({ data: ... })` en cada uno de
 * los cinco handlers es la forma rapida de que un endpoint se desvíe del
 * contrato. Con un unico helper, el sobre se escribe una sola vez.
 *
 * ------------------------------------------------------------------
 * POR QUE NO USAMOS `res.json(sobre, replacer)`
 * ------------------------------------------------------------------
 * Express 4 no expone el `replacer` de `JSON.stringify` en la firma de
 * `res.json`, asi que se fija la cabecera a mano y se envia la cadena ya
 * serializada. El resultado en la red es identico a `res.json`.
 *
 * ------------------------------------------------------------------
 * POR QUE SE SERIALIZA EL BigInt AQUI Y NO EN CADA HANDLER
 * ------------------------------------------------------------------
 * Los ids del schema son `BigInt` (IDENTITY de SQL Server). `JSON.stringify`
 * LANZA `TypeError: Do not know how to serialize a BigInt` con un BigInt
 * crudo, lo que convertiria un endpoint correcto en un 500 confuso.
 * El service mapea las filas a los tipos de src/types/dominio.ts (donde los
 * ids ya son `string`) y este replacer es la red de seguridad: si a un id se
 * le olvida convertirlo, sale `"1"` en vez de romper la respuesta.
 */

import type { Response } from 'express';
import type { SobreExito } from '../types/api';

/**
 * Reemplacer de `JSON.stringify`: convierte BigInt a string.
 * Se aplica a TODO el arbol de la respuesta, sin configuracion por endpoint.
 */
export function serializarBigInt(_clave: string, valor: unknown): unknown {
  return typeof valor === 'bigint' ? valor.toString() : valor;
}

/**
 * Envia una respuesta exitosa con el sobre unico `{ "data": <T> }`.
 *
 * @param res    Respuesta de Express.
 * @param datos  Payload ya mapeado al tipo de dominio.
 * @param status Codigo HTTP (200 por defecto).
 */
export function enviarDatos<T>(res: Response, datos: T, status = 200): void {
  const sobre: SobreExito<T> = { data: datos };
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(sobre, serializarBigInt));
}