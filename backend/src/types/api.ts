/**
 * QUDOX - Tipos del sobre de la API (contrato de la API).
 *
 * El contrato esta BLOQUEADO: hay exactamente un sobre de exito y
 * exactamente un sobre de error para los cinco endpoints. No se agregan
 * campos extra porque el frontend ya esta escrito contra esto.
 */

/** Sobre unico de exito: `{ "data": <T> }`. */
export interface SobreExito<T> {
  data: T;
}

/** Cuerpo del sobre unico de error. Solo dos campos, nada mas. */
export interface CuerpoError {
  codigo: string;
  mensaje: string;
}

/** Sobre unico de error: `{ "error": { "codigo": "...", "mensaje": "..." } }`. */
export interface SobreError {
  error: CuerpoError;
}

/**
 * Envoltura funcional del sobre de exito.
 * Existe para que los tipos viajen juntos y no se separen.
 */
export function envolverExito<T>(data: T): SobreExito<T> {
  return { data };
}

/** Envoltura funcional del sobre de error (usada por el middleware). */
export function envolverError(codigo: string, mensaje: string): SobreError {
  return { error: { codigo, mensaje } };
}