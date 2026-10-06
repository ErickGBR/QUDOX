/**
 * Tipos de dominio de la pantalla "Detalle de planilla".
 *
 * Son los tipos que consume la interfaz: ya normalizados (los montos son
 * `number`, nunca crudos de JSON) y sin ningún cast en los componentes.
 */

/** Estado de una planilla — dominio fijado con CHECK en la base de datos. */
export type EstadoPlanilla = 'Borrador' | 'Aprobada' | 'EnviadaSAP'

/** Tipo de movimiento: D = débito, C = crédito (CHECK en PlanillaDetalle). */
export type TipoMovimiento = 'D' | 'C'

/**
 * Monto en USD normalizado a `number`.
 *
 * El backend expone DECIMAL(18,2) y en JSON puede llegar como `number` o
 * como `string` (Prisma serializa Decimal como string). Esa unión
 * `number | string` solo existe DENTRO de la capa `api/`, donde se valida y
 * se normaliza una única vez al entrar. Si el dominio mantuviera la unión,
 * `total += m.monto` compilaría como concatenación de texto y arruinaría los
 * totales en silencio — por eso el dominio expone `number`.
 * Al mostrar, SIEMPRE con Intl.NumberFormat: nunca el número crudo.
 */
export type Monto = number

/** Encabezado de la planilla — GET /api/planillas/:id. */
export interface PlanillaHeader {
  planillaId: string
  periodo: string // CHAR(7), formato 'YYYY-MM'
  estado: EstadoPlanilla
  /** Informativo del backend: la pantalla usa SIEMPRE los totales recalculados en cliente. */
  totalDebitos: Monto
  totalCreditos: Monto
  /** Ausente o null hasta que la planilla se envía a SAP. */
  referenciaSap: string | null
  enviadaSapEn: string | null
}

/**
 * Una fila de la tabla de movimientos, ya unida con su empleado y su centro
 * de costo en el servidor (la tabla no hace peticiones extra por fila).
 * El centro de costo viene de `empleado.centroCostoId` (única fuente de verdad).
 */
export interface Movimiento {
  detalleId: string
  empleadoId: string
  empleadoNombre: string
  centroCostoId: string
  centroCostoNombre: string
  concepto: string
  monto: Monto
  tipo: TipoMovimiento
}

/** Opción del desplegable de filtro — GET /api/centros-costo. */
export interface CentroCosto {
  centroCostoId: string
  nombre: string
}

/** Respuesta de POST /api/planillas/:id/enviar-sap (la referencia puede ser null si el mock no la devuelve). */
export interface ResultadoEnvioSap {
  planillaId: string
  estado: 'EnviadaSAP'
  referenciaSap: string | null
  enviadaSapEn: string | null
}

/** Totales que la barra inferior muestra junto a la tabla. */
export interface Totales {
  debitos: number
  creditos: number
}
