/**
 * Cliente HTTP compartido de la pantalla de planilla.
 *
 * Por qué fetch puro y no React Query/SWR/axios: la pantalla son tres GETs
 * con sobres tipados y las pruebas cubren el flujo completo, así que una capa
 * pesada de datos no tiene retorno y sí cuesta explicabilidad. Un wrapper fino,
 * tipado y auditable en un solo archivo se defiende en una frase.
 */
import type { SobreError } from '../types'

/**
 * Base de la API: variable `VITE_API_URL` con fallback local, para que la
 * app apunte al backend desde UN solo lugar (`.env` del frontend).
 * Se recibe como `unknown` y se valida: jamás se usa `any`.
 */
function leerUrlBase(): string {
  const valor: unknown = import.meta.env.VITE_API_URL
  if (typeof valor === 'string' && valor.trim() !== '') {
    return valor.replace(/\/+$/, '') // sin barra final: evita rutas '//api/...'
  }
  return 'http://localhost:3000'
}

export const URL_BASE_API: string = leerUrlBase()

/** Fallo de red: el servidor NUNCA respondió (red caída, DNS, CORS). */
export class ErrorDeRed extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDeRed'
  }
}

/** El servidor SÍ respondió, pero con un error HTTP o un sobre de error. */
export class ErrorDeApi extends Error {
  readonly status: number
  readonly codigo: string
  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDeApi'
    this.status = status
    this.codigo = codigo
  }
}

/**
 * Mensajes de respaldo en español por si el backend no envía `mensaje`.
 * El 409 tiene el SUYO: significa que OTRA petición ganó la carrera del doble
 * envío — un "error genérico" engañaría al usuario (debe recargar, no
 * reintentar a ciegas). Igual el 502: SAP falló pero la planilla sigue en
 * 'Aprobada', así que el reintento es seguro y se dice.
 */
const MENSAJES_POR_DEFECTO: Record<number, string> = {
  400: 'La solicitud no es válida para el estado o los parámetros actuales.',
  404: 'El recurso solicitado no existe.',
  409: 'Otra petición ya envió esta planilla a SAP. Recargue para ver el estado actual.',
  422: 'Los datos enviados no son válidos.',
  500: 'Error interno del servidor.',
  502: 'SAP no respondió correctamente. La planilla no se modificó; puede reintentar.',
}

function mensajePorDefecto(status: number): string {
  return MENSAJES_POR_DEFECTO[status] ?? 'Error inesperado del servidor.'
}

export function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

/** Cancelación (AbortError): se propaga tal cual, no es un fallo. */
function esCancelacion(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** Extrae `{ error: { codigo, mensaje } }` si el cuerpo lo trae; si no, null. */
function extraerSobreError(cuerpo: unknown): SobreError | null {
  if (!esObjeto(cuerpo)) return null
  const error: unknown = cuerpo.error
  if (!esObjeto(error)) return null
  const codigo = typeof error.codigo === 'string' ? error.codigo : 'desconocido'
  const mensaje = typeof error.mensaje === 'string' ? error.mensaje : ''
  return { error: { codigo, mensaje } }
}

/** Error propio para una respuesta 2xx con un cuerpo que viola el contrato de sobres. */
export function errorFormato(detalle: string): ErrorDeApi {
  return new ErrorDeApi(500, 'formato_invalido', `Respuesta del servidor con formato inesperado (${detalle}).`)
}

/* ------------------------------------------------------------------ *
 * Normalizadores: única validación de forma en toda la app.           *
 * Reciben `unknown` (el JSON ya parseado) y devuelven tipos de        *
 * dominio — por eso ningún componente necesita `any` ni casts `as`.   *
 * ------------------------------------------------------------------ */

export function aTexto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string') {
    throw errorFormato(`el campo "${campo}" no es texto`)
  }
  return valor
}

export function aTextoOpt(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null
}

/** Acepta el crudo `number | string` de DECIMAL(18,2) y lo normaliza. Ver comentario en `Monto`. */
export function aMonto(valor: unknown, campo: string): number {
  const numero = typeof valor === 'string' ? Number(valor) : valor
  if (typeof numero !== 'number' || !Number.isFinite(numero)) {
    throw errorFormato(`el monto "${campo}" no es numérico`)
  }
  return numero
}

export function aLista(valor: unknown, campo: string): unknown[] {
  if (!Array.isArray(valor)) {
    throw errorFormato(`"${campo}" no es una lista`)
  }
  return valor
}

interface OpcionesPeticion {
  metodo?: 'GET' | 'POST'
  signal?: AbortSignal
  cuerpo?: string
}

/**
 * Envoltorio ÚNICO de fetch. Centraliza los sobres `{ data }` / `{ error }`
 * y distingue tres finalidades porque la pantalla las pinta distinto:
 *
 * - `ErrorDeRed` → "no hay conexión con el servidor" (el servidor no respondió).
 * - `ErrorDeApi` → el servidor respondió con un problema; su `mensaje` (español)
 *   se muestra AL USUARIO, nunca un texto genérico inventado por el cliente.
 * - `AbortError` → se propaga SIN envolver: es una cancelación por cambio de
 *   filtro o desmonte, y el llamador debe ignorarla (respuesta obsoleta).
 */
export async function pedir(ruta: string, opciones: OpcionesPeticion = {}): Promise<unknown> {
  const { metodo = 'GET', signal, cuerpo } = opciones

  let respuesta: Response
  try {
    respuesta = await fetch(`${URL_BASE_API}${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo,
      signal,
    })
  } catch (error) {
    if (esCancelacion(error)) throw error
    throw new ErrorDeRed('No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.')
  }

  let cuerpoRespuesta: unknown = null
  try {
    cuerpoRespuesta = await respuesta.json()
  } catch {
    cuerpoRespuesta = null // cuerpo no JSON: se cubre con los mensajes por defecto
  }

  const sobre = extraerSobreError(cuerpoRespuesta)
  const codigo = sobre?.error.codigo ?? String(respuesta.status)
  const mensaje = sobre?.error.mensaje || mensajePorDefecto(respuesta.status)

  if (!respuesta.ok) throw new ErrorDeApi(respuesta.status, codigo, mensaje)
  if (sobre !== null) throw new ErrorDeApi(respuesta.status, codigo, mensaje) // defensivo: 2xx con sobre de error
  if (!esObjeto(cuerpoRespuesta) || !('data' in cuerpoRespuesta)) {
    throw errorFormato('falta el sobre { data }')
  }
  return cuerpoRespuesta.data
}
