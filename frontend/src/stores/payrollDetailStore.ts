/**
 * Estado compartido de la pantalla "Detalle de planilla" — contrato de
 * la vista de detalle.
 *
 * POR QUÉ EXISTE este store: el filtro, la tabla de movimientos, la barra de
 * totales y el botón "Enviar a SAP" son CUATRO componentes distintos que
 * leen y escriben LOS MISMOS datos — eso es exactamente lo que resuelve un
 * store. Zustand se usa SOLO aquí: en ningún otro punto de la aplicación hay
 * store (el resto del estado vive en los componentes con useState).
 *
 * QUÉ NO VIVE AQUÍ: la carga de lectura (fetch de planilla, movimientos
 * y centros de costo) se hace en el componente con useEffect — justificación
 * en `setCentroCostoId`. Los estados de carga/error de pantalla también son
 * locales al componente: este store solo guarda lo compartido.
 */
import { create } from 'zustand'
import type { CentroCosto, Movimiento, PlanillaHeader, Totales } from '../types'

/** Ciclo de vida del POST a SAP. El botón se deshabilita en 'pending'. */
export type EstadoEnvio = 'idle' | 'pending' | 'success' | 'error'

export interface DatosDetallePlanilla {
  planilla: PlanillaHeader | null
  movimientos: Movimiento[]
  centrosCosto: CentroCosto[]
  centroCostoId: string | null
  totales: Totales
  envioEstado: EstadoEnvio
  envioError: string | null
}

export interface AccionesDetallePlanilla {
  setPlanilla: (planilla: PlanillaHeader) => void
  setMovimientos: (movimientos: Movimiento[]) => void
  setCentrosCosto: (centros: CentroCosto[]) => void
  setCentroCostoId: (centroCostoId: string | null) => void
  setEnvioPending: () => void
  setEnvioSuccess: (referencia: string) => void
  setEnvioError: (mensaje: string) => void
  reset: () => void
}

/** Estado completo fijado por el contrato (datos + acciones). */
export type PayrollDetailState = DatosDetallePlanilla & AccionesDetallePlanilla

/**
 * Un SOLO reduce sobre el array EXACTO que la tabla renderiza (el del store).
 * Nunca se leen los totales del backend: son pre-filtro y no cuadrarían con
 * las filas visibles. `Monto` ya es `number`, así que `+=` suma y no concatena.
 */
function calcularTotales(movimientos: Movimiento[]): Totales {
  const totales: Totales = { debitos: 0, creditos: 0 }
  for (const movimiento of movimientos) {
    if (movimiento.tipo === 'D') totales.debitos += movimiento.monto
    else totales.creditos += movimiento.monto
  }
  return totales
}

/** Crea estados nuevos en cada llamada: nunca se comparten referencias de arrays/objetos. */
function crearEstadoInicial(): DatosDetallePlanilla {
  return {
    planilla: null,
    movimientos: [],
    centrosCosto: [],
    centroCostoId: null,
    totales: { debitos: 0, creditos: 0 },
    envioEstado: 'idle',
    envioError: null,
  }
}

export const useDetallePlanilla = create<PayrollDetailState>()((set) => ({
  ...crearEstadoInicial(),

  setPlanilla: (planilla) => set({ planilla }),

  /**
   * `totales` es derivado pero vive en el store a propósito: es la clave que
   * fija el contrato, y se recalcula DENTRO de la misma escritura que
   * reemplaza `movimientos` — misma escritura atómica ⇒ imposible que los
   * totales se desincronicen de las filas que la tabla dibuja. Ningún
   * componente vuelve a calcularlos (dos sitios con el mismo cálculo es la
   * forma clásica de que diverjan). Como el store solo guarda la respuesta
   * YA filtrada del servidor, este reduce es exactamente "sobre los
   * movimientos filtrados".
   */
  setMovimientos: (movimientos) => set({ movimientos, totales: calcularTotales(movimientos) }),

  /**
   * Opciones del desplegable: se capturan de la PRIMERA respuesta SIN FILTRAR
   * (o de GET /api/centros-costo) y se guardan en caché. BUG real que
   * previene: si la lista se recargara desde una respuesta filtrada, al
   * elegir un centro de costo el desplegable se colapsaría a UNA opción y el
   * usuario no podría volver a "Todos". Defensa en profundidad: aunque
   * alguien llame esto con una lista ya filtrada, aquí solo se AGREGAN
   * opciones, jamás se quitan.
   */
  setCentrosCosto: (centros) =>
    set((estado) => {
      if (estado.centrosCosto.length === 0) return { centrosCosto: centros }
      const conocidos = new Set(estado.centrosCosto.map((centro) => centro.centroCostoId))
      const nuevos = centros.filter((centro) => !conocidos.has(centro.centroCostoId))
      if (nuevos.length === 0) return estado
      return { centrosCosto: [...estado.centrosCosto, ...nuevos] }
    }),

  /**
   * Cambia el filtro. El REFETCH vive en el COMPONENTE, no aquí:
   * 1) el contrato fija 7 acciones síncronas tipo setter; meter fetch en
   *    el store las convertiría en acciones asíncronas y rompería el contrato;
   * 2) abortar la petición vieja al cambiar de filtro o al desmontar pertenece
   *    al ciclo de vida de React (useEffect + AbortController), que el store
   *    no ve;
   * 3) el store queda como caché compartida pasiva, sin estado imperativo
   *    escondido (el AbortController NO vive en el store).
   * Las filas anteriores se conservan mientras llega la nueva respuesta: el
   * estado de carga es local al componente y así la tabla no parpadea.
   */
  setCentroCostoId: (centroCostoId) => set({ centroCostoId }),

  /**
   * El botón se deshabilita con `envioEstado === 'pending'` para que dos
   * clicks no produzcan dos POST. Entre el primer click y el re-render hay
   * una ventana: el handler DEBE leer el estado SÍNCRONO
   * (`useDetallePlanilla.getState().envioEstado`) antes de disparar el POST —
   * setState en Zustand es síncrono, así que el segundo click ya ve
   * 'pending' y sale. Esta acción además es no-op si ya estaba pendiente
   * (defensa en profundidad).
   */
  setEnvioPending: () =>
    set((estado) => (estado.envioEstado === 'pending' ? estado : { envioEstado: 'pending', envioError: null })),

  /**
   * Éxito: guarda la referencia y actualiza el encabezado en la MISMA
   * escritura, para que cabecera y botón queden coherentes sin un refetch
   * extra. `enviadaSapEn` no se inventa aquí: si la pantalla necesita la hora
   * del servidor, se hidrata con `setPlanilla` usando la respuesta del POST.
   */
  setEnvioSuccess: (referencia) =>
    set((estado) => ({
      envioEstado: 'success',
      envioError: null,
      planilla:
        estado.planilla === null ? null : { ...estado.planilla, estado: 'EnviadaSAP', referenciaSap: referencia },
    })),

  /**
   * Error de envío. El MENSAJE llega ya específico desde la capa `api/`: un
   * 409 (otra petición ganó la carrera) tiene texto propio en
   * `MENSAJES_POR_DEFECTO` y jamás un "error genérico" — aquí no se
   * interpreta nada, se pinta tal cual. La distinción por código (status)
   * queda disponible en `ErrorDeApi.status` por si el componente la necesita.
   */
  setEnvioError: (mensaje) => set({ envioEstado: 'error', envioError: mensaje }),

  /**
   * Al navegar entre planillas: borra TODO lo compartido (encabezado,
   * movimientos, totales, filtro, estado de envío) para que no filtren datos
   * de la planilla anterior. `crearEstadoInicial()` genera arrays/totales
   * frescos: nada comparte referencias con un estado previo.
   */
  reset: () => set(crearEstadoInicial()),
}))
