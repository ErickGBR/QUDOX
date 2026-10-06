/**
 * Formateo compartido de la pantalla "Detalle de planilla".
 *
 * Regla del dominio (ver `types/dominio.ts`): los montos NUNCA se muestran
 * crudos; siempre pasan por Intl con 2 decimales y separador de miles. Aquí
 * vive esa regla una sola vez para que tabla y totales no puedan divergir.
 */

/**
 * 1234.5 → "1.234,50" (es-ES: punto de millar, coma decimal).
 * Se fija también `maximumFractionDigits` para que el resultado tenga
 * exactamente 2 decimales aunque el número venga con más (o con menos).
 */
export function formatearMonto(monto: number): string {
  return monto.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const MESES_EN_ESPANOL: string[] = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * '2025-10' → 'octubre de 2025'. Si el periodo no cumple CHAR(7) se devuelve
 * tal cual: mejor un dato feo que un dato inventado.
 */
export function formatearPeriodo(periodo: string): string {
  const partes = periodo.split('-')
  const anio = partes[0]
  const mes = partes[1]
  if (anio === undefined || mes === undefined) return periodo
  const indice = Number(mes) - 1
  const nombreMes = MESES_EN_ESPANOL[indice]
  if (nombreMes === undefined) return periodo
  return `${nombreMes} de ${anio}`
}

/** ISO-8601 → fecha legible en español; null si no hay fecha (aún no se envió). */
export function formatearFechaHora(iso: string | null): string | null {
  if (iso === null || iso === '') return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso // respeta lo que mandó el servidor
  return fecha.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
}
