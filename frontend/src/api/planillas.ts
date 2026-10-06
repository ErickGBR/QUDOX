/**
 * Un endpoint = una función. Tipos de retorno ya normalizados (ver `cliente.ts`).
 */
import type { CentroCosto, EstadoPlanilla, Movimiento, PlanillaHeader, ResultadoEnvioSap, TipoMovimiento } from '../types'
import { aLista, aMonto, aTexto, aTextoOpt, errorFormato, esObjeto, pedir } from './cliente'

function aEstadoPlanilla(valor: unknown): EstadoPlanilla {
  if (valor === 'Borrador' || valor === 'Aprobada' || valor === 'EnviadaSAP') return valor
  throw errorFormato(`estado de planilla desconocido: ${JSON.stringify(valor)}`)
}

function aTipoMovimiento(valor: unknown): TipoMovimiento {
  if (valor === 'D' || valor === 'C') return valor
  throw errorFormato(`tipo de movimiento desconocido: ${JSON.stringify(valor)}`)
}

function aPlanillaHeader(datos: unknown): PlanillaHeader {
  if (!esObjeto(datos)) throw errorFormato('planilla')
  return {
    planillaId: aTexto(datos.planillaId, 'planillaId'),
    periodo: aTexto(datos.periodo, 'periodo'),
    estado: aEstadoPlanilla(datos.estado),
    totalDebitos: aMonto(datos.totalDebitos, 'totalDebitos'),
    totalCreditos: aMonto(datos.totalCreditos, 'totalCreditos'),
    referenciaSap: aTextoOpt(datos.referenciaSap),
    enviadaSapEn: aTextoOpt(datos.enviadaSapEn),
  }
}

function aMovimiento(datos: unknown): Movimiento {
  if (!esObjeto(datos)) throw errorFormato('movimiento')
  return {
    detalleId: aTexto(datos.detalleId, 'detalleId'),
    empleadoId: aTexto(datos.empleadoId, 'empleadoId'),
    empleadoNombre: aTexto(datos.empleadoNombre, 'empleadoNombre'),
    centroCostoId: aTexto(datos.centroCostoId, 'centroCostoId'),
    centroCostoNombre: aTexto(datos.centroCostoNombre, 'centroCostoNombre'),
    concepto: aTexto(datos.concepto, 'concepto'),
    monto: aMonto(datos.monto, 'monto'),
    tipo: aTipoMovimiento(datos.tipo),
  }
}

function aCentroCosto(datos: unknown): CentroCosto {
  if (!esObjeto(datos)) throw errorFormato('centro de costo')
  return {
    centroCostoId: aTexto(datos.centroCostoId, 'centroCostoId'),
    nombre: aTexto(datos.nombre, 'nombre'),
  }
}

function aResultadoEnvio(datos: unknown): ResultadoEnvioSap {
  if (!esObjeto(datos)) throw errorFormato('resultado del envío a SAP')
  return {
    planillaId: aTexto(datos.planillaId, 'planillaId'),
    estado: 'EnviadaSAP',
    referenciaSap: aTextoOpt(datos.referenciaSap),
    enviadaSapEn: aTextoOpt(datos.enviadaSapEn),
  }
}

/** GET /api/planillas/:id — encabezado con estado y totales informativos. */
export async function obtenerPlanilla(idPlanilla: string, signal?: AbortSignal): Promise<PlanillaHeader> {
  const datos = await pedir(`/api/planillas/${encodeURIComponent(idPlanilla)}`, { signal })
  return aPlanillaHeader(datos)
}

/**
 * GET /api/planillas/:id/movimientos?centroCostoId= — el filtro va AL SERVIDOR;
 * `centroCostoId` omitido o null = todos los movimientos.
 *
 * `signal` no es adorno: si el usuario cambia el filtro dos veces rápido, la
 * respuesta lenta puede llegar la ULTIMA y pisar los datos nuevos. El
 * componente aborta la petición anterior con AbortController; el AbortError se
 * propaga sin envolver para que el llamador lo descarte como obsoleto y NO lo
 * pinte como error.
 */
export async function obtenerMovimientos(
  idPlanilla: string,
  centroCostoId?: string | null,
  signal?: AbortSignal,
): Promise<Movimiento[]> {
  const base = `/api/planillas/${encodeURIComponent(idPlanilla)}/movimientos`
  const consulta = centroCostoId ? `?centroCostoId=${encodeURIComponent(centroCostoId)}` : ''
  const datos = await pedir(base + consulta, { signal })
  return aLista(datos, 'movimientos').map(aMovimiento)
}

/** GET /api/centros-costo — fuente del desplegable de filtro (lista COMPLETA, no depende del filtro). */
export async function obtenerCentrosCosto(signal?: AbortSignal): Promise<CentroCosto[]> {
  const datos = await pedir('/api/centros-costo', { signal })
  return aLista(datos, 'centros-costo').map(aCentroCosto)
}

/**
 * POST /api/planillas/:id/enviar-sap — el backend llama a SAP PRIMERO (fuera
 * de la transacción) y solo después cambia el estado con `updateMany`.
 * Un 409 = otra petición ganó la carrera; su mensaje específico se hereda tal
 * cual desde el sobre de error.
 */
export async function enviarPlanillaASap(idPlanilla: string): Promise<ResultadoEnvioSap> {
  const datos = await pedir(`/api/planillas/${encodeURIComponent(idPlanilla)}/enviar-sap`, {
    metodo: 'POST',
    cuerpo: '{}',
  })
  return aResultadoEnvio(datos)
}
