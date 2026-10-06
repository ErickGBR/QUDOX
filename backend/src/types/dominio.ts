/**
 * QUDOX - Tipos de dominio que viajan por la API.
 *
 * REGLA CRITICA (lectura obligatoria antes de tocar estos tipos):
 * los ids de este proyecto son `BigInt` en Prisma (IDENTITY de SQL Server),
 * ver backend/prisma/schema.prisma. `JSON.stringify` LANZA
 * `TypeError: Do not know how to serialize a BigInt` ante un BigInt crudo,
 * por eso TODOS los ids de la capa de API estan declarados como `string`.
 *
 * La conversion se hace en dos capas:
 *  1. Los services mapean cada fila con `id.toString()` antes de devolver.
 *  2. `enviarDatos` (src/utils/respuestas.ts) aplica un replacer de
 *     `JSON.stringify` que convierte cualquier BigInt que se escape.
 *
 * `monto` es `number` y no string por decision documentada: DECIMAL(18,2)
 * entra exactamente en el rango seguro de Number, y el frontend lo formatea
 * con `Intl.NumberFormat` (supuesto 9 del README). La aritmetica contable NO
 * se hace en el backend con floats; los totales salen de SQL con SUM().
 */

/** Estados validos de una planilla. El dominio los valida el DDL con CHECK. */
export type EstadoPlanilla = 'Borrador' | 'Aprobada' | 'EnviadaSAP';

/** Tipo del movimiento: 'D' debito, 'C' credito. */
export type TipoMovimiento = 'D' | 'C';

/**
 * Cabecera de planilla — respuesta de `GET /api/planillas/:id`.
 * Los ids van como string por la regla de BigInt documentada arriba.
 */
export interface PlanillaCabecera {
  planillaId: string;
  /** CHAR(7) con formato 'YYYY-MM'. */
  periodo: string;
  estado: EstadoPlanilla;
  totalDebitos: number;
  totalCreditos: number;
  /** Diagnosticos del incidente (supuestos 8 y 10 del README): null hasta el envio. */
  referenciaSap?: string | null;
  enviadaSapEn?: string | null;
}

/**
 * Movimiento de planilla — respuesta de
 * `GET /api/planillas/:id/movimientos`.
 *
 * NOTA DE DOMINIO: el movimiento NO tiene `centroCostoId` propio. El centro
 * de costo se alcanza navegando `detalle.empleado.centroCosto`. Este tipo
 * de API si lo expone porque el frontend lo necesita para
 * pintar y filtrar, pero sale de la relacion, nunca de una columna del
 * detalle.
 */
export interface Movimiento {
  detalleId: string;
  empleadoId: string;
  empleadoNombre: string;
  centroCostoId: string;
  centroCostoNombre: string;
  concepto: string;
  monto: number;
  tipo: TipoMovimiento;
}

/** Centro de costo — respuesta de `GET /api/centros-costo`. */
export interface CentroCosto {
  centroCostoId: string;
  nombre: string;
}

/**
 * Resultado del envio a SAP — respuesta de
 * `POST /api/planillas/:id/enviar-sap`.
 * `estado` siempre es 'EnviadaSAP' en una respuesta 200; la referencia y el
 * timestamp vienen del mock y se persistieron en la misma escritura atomica.
 */
export interface ResultadoEnvioSap {
  planillaId: string;
  estado: 'EnviadaSAP';
  referenciaSap: string;
  /** ISO 8601. */
  enviadaSapEn: string;
}

/** Respuesta de `GET /health` (data del sobre, exactamente el contrato). */
export interface EstadoSalud {
  status: 'ok';
  /** ISO 8601. */
  timestamp: string;
}

/**
 * Respuesta de `GET /api/health` (objeto plano, sin sobre `{ data }`).
 * `uptime` son segundos de proceso con decimales (`process.uptime()`).
 */
export interface EstadoSaludDetallado {
  status: 'ok';
  uptime: number;
  /** ISO 8601. */
  timestamp: string;
}
