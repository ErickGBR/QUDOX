/**
 * Escenarios del store compartido de «Detalle de planilla».
 *
 * Requisitos verificados:
 *  1. "Store: totals derived correctly (débitos/créditos/resultado)".
 *  2. "Store: double-POST guard blocks a second send while `pending`".
 *  3. "Store: 409 sets conflict state".
 *  4. "Store: reset clears".
 *
 * El store es un singleton de módulo: `beforeEach` lo reinicia con `reset()` para
 * que ningún escenario herede el estado del anterior.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { CentroCosto, Movimiento, PlanillaHeader, TipoMovimiento } from '../types'
import { useDetallePlanilla } from './payrollDetailStore'

/** Fila mínima válida: el resto de campos no intervienen en lo que se verifica. */
function crearMovimiento(detalleId: string, tipo: TipoMovimiento, monto: number): Movimiento {
  return {
    detalleId,
    empleadoId: `E-${detalleId}`,
    empleadoNombre: `Empleado ${detalleId}`,
    centroCostoId: 'CC-10',
    centroCostoNombre: 'Producción',
    concepto: 'Concepto de prueba',
    monto,
    tipo,
  }
}

function planillaCon(estado: PlanillaHeader['estado']): PlanillaHeader {
  return {
    planillaId: '1',
    periodo: '2025-10',
    estado,
    totalDebitos: 0,
    totalCreditos: 0,
    referenciaSap: null,
    enviadaSapEn: null,
  }
}

const CENTROS: CentroCosto[] = [
  { centroCostoId: 'CC-10', nombre: 'Producción' },
  { centroCostoId: 'CC-20', nombre: 'Administración' },
]

beforeEach(() => {
  useDetallePlanilla.getState().reset()
})

/* ------------------------------------------------------------------ *
 * 1) Totales derivados                                               *
 * ------------------------------------------------------------------ */

describe('totales derivados', () => {
  it('suma débitos y créditos POR SEPARADO y el resultado es D − C', () => {
    useDetallePlanilla.getState().setMovimientos([
      crearMovimiento('1', 'D', 1000.5),
      crearMovimiento('2', 'D', 200),
      crearMovimiento('3', 'C', 700.25),
      crearMovimiento('4', 'C', 1.5),
    ])

    const { totales } = useDetallePlanilla.getState()
    expect(totales.debitos).toBe(1200.5)
    expect(totales.creditos).toBe(701.75)
    // El "resultado (D − C)" que pinta BarraTotales sale de ESTOS dos valores.
    expect(totales.debitos - totales.creditos).toBe(498.75)
  })

  it('RECALCULA en cada escritura: nunca acumula la suma anterior', () => {
    const store = useDetallePlanilla.getState()
    store.setMovimientos([crearMovimiento('1', 'D', 100)])
    useDetallePlanilla.getState().setMovimientos([crearMovimiento('2', 'D', 50)])

    expect(useDetallePlanilla.getState().totales.debitos).toBe(50) // no 150
    expect(useDetallePlanilla.getState().movimientos).toHaveLength(1)
  })

  it('lista vacía → totales en cero (sin residuos de la consulta anterior)', () => {
    useDetallePlanilla.getState().setMovimientos([crearMovimiento('1', 'D', 999)])
    useDetallePlanilla.getState().setMovimientos([])

    expect(useDetallePlanilla.getState().totales).toEqual({ debitos: 0, creditos: 0 })
  })

  it("el reduce usa `movimiento.monto` como number: 'D' y 'C' suman, no concatenan", () => {
    // Regresión del dominio: si `Monto` volviera a ser `string` (DECIMAL crudo
    // de Prisma), += concatenaría texto y los totales mentirían en silencio.
    useDetallePlanilla.getState().setMovimientos([crearMovimiento('1', 'C', 20)])
    expect(typeof useDetallePlanilla.getState().totales.creditos).toBe('number')
    expect(useDetallePlanilla.getState().totales.creditos).toBe(20)
  })
})

/* ------------------------------------------------------------------ *
 * 2) Guard de doble POST                                             *
 * ------------------------------------------------------------------ */

describe('guard de doble envío (pending)', () => {
  it('la segunda llamada a setEnvioPending mientras está pending es NO-OP: no emite estado ⇒ no re-render ⇒ no segundo POST', () => {
    const emisiones: string[] = []
    const unsubscribe = useDetallePlanilla.subscribe((estado) => emisiones.push(estado.envioEstado))

    useDetallePlanilla.getState().setEnvioPending() // primer click
    useDetallePlanilla.getState().setEnvioPending() // segundo click, aún en vuelo

    expect(emisiones).toEqual(['pending'])
    expect(useDetallePlanilla.getState().envioEstado).toBe('pending')
    unsubscribe()
  })

  it('setEnvioPending limpia el error previo: tras un fallo se permite reintentar', () => {
    useDetallePlanilla.getState().setEnvioError('SAP no respondió correctamente.')
    expect(useDetallePlanilla.getState().envioError).toBe('SAP no respondió correctamente.')

    useDetallePlanilla.getState().setEnvioPending()

    expect(useDetallePlanilla.getState().envioEstado).toBe('pending')
    expect(useDetallePlanilla.getState().envioError).toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * 3) 409 → estado de conflicto                                       *
 * ------------------------------------------------------------------ */

describe('409 (carrera del doble envío)', () => {
  it('pasa a "error" con el mensaje de conflicto TAL CUAL, sin texto genérico', () => {
    // Este es exactamente el mensaje por defecto que produce `api/cliente.ts`
    // para un 409 (ver `api/cliente.test.ts`): el store no lo interpreta.
    const mensajeDeConflicto =
      'Otra petición ya envió esta planilla a SAP. Recargue para ver el estado actual.'

    useDetallePlanilla.getState().setEnvioPending()
    useDetallePlanilla.getState().setEnvioError(mensajeDeConflicto)

    const estado = useDetallePlanilla.getState()
    expect(estado.envioEstado).toBe('error')
    expect(estado.envioError).toBe(mensajeDeConflicto)
    expect(estado.envioError).toContain('Otra petición')
    // El estado sale de 'pending': el botón vuelve a estar disponible para
    // recargar/reintentar, no queda clavado en "Enviando…".
    expect(estado.envioEstado).not.toBe('pending')
  })

  it('setEnvioSuccess (respuesta 200) lleva la planilla a EnviadaSAP con su referencia en la MISMA escritura', () => {
    useDetallePlanilla.getState().setPlanilla(planillaCon('Aprobada'))
    useDetallePlanilla.getState().setEnvioPending()

    useDetallePlanilla.getState().setEnvioSuccess('SAP-2025-000123')

    const estado = useDetallePlanilla.getState()
    expect(estado.envioEstado).toBe('success')
    expect(estado.envioError).toBeNull()
    expect(estado.planilla?.estado).toBe('EnviadaSAP')
    expect(estado.planilla?.referenciaSap).toBe('SAP-2025-000123')
  })
})

/* ------------------------------------------------------------------ *
 * 4) reset                                                            *
 * ------------------------------------------------------------------ */

describe('reset', () => {
  it('borra TODO lo compartido y no deja referencias de la planilla anterior', () => {
    const store = useDetallePlanilla.getState()
    store.setPlanilla(planillaCon('Aprobada'))
    store.setMovimientos([crearMovimiento('1', 'D', 100)])
    store.setCentrosCosto(CENTROS)
    store.setCentroCostoId('CC-10')
    store.setEnvioPending()
    store.setEnvioError('algo falló')
    const movimientosPrevios = useDetallePlanilla.getState().movimientos

    useDetallePlanilla.getState().reset()

    const limpio = useDetallePlanilla.getState()
    expect(limpio.planilla).toBeNull()
    expect(limpio.movimientos).toEqual([])
    expect(limpio.centrosCosto).toEqual([])
    expect(limpio.centroCostoId).toBeNull()
    expect(limpio.totales).toEqual({ debitos: 0, creditos: 0 })
    expect(limpio.envioEstado).toBe('idle')
    expect(limpio.envioError).toBeNull()
    // Arrays/Totales frescos: nada comparte referencia con el estado previo.
    expect(limpio.movimientos).not.toBe(movimientosPrevios)
    expect(limpio.totales).not.toBe(store.totales)
  })
})

/* ------------------------------------------------------------------ *
 * Extras con valor real: defensa del desplegable y acciones afines   *
 * ------------------------------------------------------------------ */

describe('setCentrosCosto', () => {
  it('solo AGREGA opciones: una respuesta ya filtrada no colapsa el desplegable', () => {
    useDetallePlanilla.getState().setCentrosCosto(CENTROS)
    // Respuesta filtrada que solo trae UN centro: no debe borrar los demás
    // (bug real que impide volver a «Todos los centros de costo»).
    useDetallePlanilla.getState().setCentrosCosto([CENTROS[0]])

    expect(useDetallePlanilla.getState().centrosCosto).toHaveLength(2)

    useDetallePlanilla.getState().setCentrosCosto([{ centroCostoId: 'CC-30', nombre: 'Logística' }])

    expect(useDetallePlanilla.getState().centrosCosto).toHaveLength(3)
  })
})

describe('setCentroCostoId', () => {
  it('guarda el filtro tal cual (null = «Todos», sin filtro server-side)', () => {
    useDetallePlanilla.getState().setCentroCostoId('CC-10')
    expect(useDetallePlanilla.getState().centroCostoId).toBe('CC-10')

    useDetallePlanilla.getState().setCentroCostoId(null)
    expect(useDetallePlanilla.getState().centroCostoId).toBeNull()
  })
})
