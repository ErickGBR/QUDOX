/**
 * Sobres de la API — fijados por el contrato de la API.
 * Todo endpoint responde O `{ data }` O `{ error }`, nunca otra cosa.
 */

/** Sobre de éxito: `{ "data": T }`. */
export interface SobreExito<T> {
  data: T
}

/** Sobre de error: `{ "error": { codigo, mensaje } }` — `mensaje` va en español y se muestra al usuario. */
export interface SobreError {
  error: {
    codigo: string
    mensaje: string
  }
}
