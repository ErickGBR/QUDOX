import { useEffect, useState } from 'react'
import './App.css'
import type { CentroCosto, Movimiento } from './types'
import {
  ErrorDeApi,
  ErrorDeRed,
  enviarPlanillaASap,
  obtenerCentrosCosto,
  obtenerMovimientos,
  obtenerPlanilla,
} from './api'
import { useDetallePlanilla } from './stores/payrollDetailStore'
import { BarraTotales } from './components/BarraTotales'
import { BotonEnviarSap } from './components/BotonEnviarSap'
import { EncabezadoPlanilla } from './components/EncabezadoPlanilla'
import { EstadoVacio, IndicadorCarga, PanelError } from './components/Estados'
import { FeedbackEnvio } from './components/FeedbackEnvio'
import { FiltroCentroCosto } from './components/FiltroCentroCosto'
import { TablaMovimientos } from './components/TablaMovimientos'

/**
 * Pantalla «Detalle de planilla» (Parte 3 del enunciado QUDOX).
 *
 * DIVISIÓN DE RESPONSABILIDADES — no se toca lo que ya existe:
 *  - `api/`      → transporte, sobres { data } / { error } y normalización.
 *  - `stores/`   → datos compartidos, totales derivados y ciclo del POST a SAP
 *                  (doble-click, success, error/409). Aquí SOLO se leen y se
 *                  invocan sus acciones: ningún total ni guarda se reimplementa.
 *  - `App.tsx`   → carga de lectura (useEffect + AbortController) y
 *                  estados de pantalla (carga / error / vacío / envío).
 *  - `components/`→ presentación pura.
 *
 * FILTRO: `centroCostoId` viaja AL SERVIDOR (`?centroCostoId=`). No hay ningún
 * `.filter()` sobre las filas en el cliente: la tabla dibuja exactamente lo que
 * devolvió el endpoint, y el store recalcula los totales sobre esas mismas filas.
 */

/** Id por defecto cuando la URL no trae `/planillas/:id` (no hay router: no se añaden dependencias). */
const ID_PLANILLA_DEFECTO = '1'

/** Lee `/planillas/123` del path actual; si no hay id numérico, el de defecto. */
function leerIdPlanilla(): string {
  const segmentos = window.location.pathname.split('/').filter((segmento) => segmento !== '')
  const posicion = segmentos.findIndex((segmento) => segmento === 'planillas')
  const candidato = posicion >= 0 ? segmentos[posicion + 1] : ''
  return /^\d+$/.test(candidato) ? candidato : ID_PLANILLA_DEFECTO
}

const ID_PLANILLA = leerIdPlanilla()

/** AbortError = cancelación (cambio de filtro o desmonte), NO es un fallo. */
function esCancelacion(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Mensaje para el usuario. Solo lo que la capa `api/` garantiza en español
 * (`ErrorDeApi`/`ErrorDeRed`); cualquier otra excepción se traduce a un texto
 * genérico y jamás se filtra un mensaje crudo de origen desconocido.
 */
function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorDeApi || error instanceof ErrorDeRed) return error.message
  return 'Error inesperado del servidor. Intente de nuevo.'
}

/**
 * Centros de costo que aparecen en una respuesta SIN FILTRAR, para poblar el
 * desplegable aunque `GET /api/centros-costo` falle. El store solo AGREGA
 * opciones (nunca quita), así que esto no colapsa la lista al filtrar.
 */
function centrosDeMovimientos(movimientos: Movimiento[]): CentroCosto[] {
  const vistos = new Set<string>()
  const centros: CentroCosto[] = []
  for (const movimiento of movimientos) {
    if (vistos.has(movimiento.centroCostoId)) continue
    vistos.add(movimiento.centroCostoId)
    centros.push({ centroCostoId: movimiento.centroCostoId, nombre: movimiento.centroCostoNombre })
  }
  return centros
}

function App() {
  /* ── Store compartido (una suscripción por campo: selectores primitivos) ── */
  const planilla = useDetallePlanilla((estado) => estado.planilla)
  const movimientos = useDetallePlanilla((estado) => estado.movimientos)
  const centrosCosto = useDetallePlanilla((estado) => estado.centrosCosto)
  const centroCostoId = useDetallePlanilla((estado) => estado.centroCostoId)
  const totales = useDetallePlanilla((estado) => estado.totales)
  const envioEstado = useDetallePlanilla((estado) => estado.envioEstado)
  const envioError = useDetallePlanilla((estado) => estado.envioError)
  const setPlanilla = useDetallePlanilla((estado) => estado.setPlanilla)
  const setMovimientos = useDetallePlanilla((estado) => estado.setMovimientos)
  const setCentrosCosto = useDetallePlanilla((estado) => estado.setCentrosCosto)
  const setCentroCostoId = useDetallePlanilla((estado) => estado.setCentroCostoId)
  const setEnvioPending = useDetallePlanilla((estado) => estado.setEnvioPending)
  const setEnvioSuccess = useDetallePlanilla((estado) => estado.setEnvioSuccess)
  const setEnvioError = useDetallePlanilla((estado) => estado.setEnvioError)

  /* ── Estados de pantalla (locales: el store solo guarda lo compartido) ── */
  const [cargandoCabecera, setCargandoCabecera] = useState(true)
  const [errorCabecera, setErrorCabecera] = useState<string | null>(null)
  const [cargandoMovimientos, setCargandoMovimientos] = useState(true)
  const [errorMovimientos, setErrorMovimientos] = useState<string | null>(null)
  /** true → el último fallo de envío fue un 409 (carrera del doble envío). */
  const [esConflicto, setEsConflicto] = useState(false)
  /** Contadores de reintento: incrementarlos re-ejecuta el effect correspondiente. */
  const [intentoCabecera, setIntentoCabecera] = useState(0)
  const [intentoMovimientos, setIntentoMovimientos] = useState(0)

  /* 1) Cabecera + opciones del filtro. Se piden juntas: si alguna falla, la
        pantalla entera ofrece reintento (no hay nada fiable que mostrar).
        El estado de carga/error se reinicia en el MANEJADOR que dispara la
        recarga (retry/recargar), no aquí: un setState síncrono dentro del
        effect provoca renders en cascada (regla react/set-state-in-effect). */
  useEffect(() => {
    let cancelado = false
    const controlador = new AbortController()

    Promise.all([
      obtenerPlanilla(ID_PLANILLA, controlador.signal),
      obtenerCentrosCosto(controlador.signal),
    ])
      .then(([planillaObtenida, centros]) => {
        if (cancelado) return
        setPlanilla(planillaObtenida)
        setCentrosCosto(centros)
      })
      .catch((error: unknown) => {
        if (cancelado || esCancelacion(error)) return
        setErrorCabecera(mensajeDeError(error))
      })
      .finally(() => {
        if (!cancelado) setCargandoCabecera(false)
      })

    return () => {
      cancelado = true
      controlador.abort()
    }
  }, [intentoCabecera, setPlanilla, setCentrosCosto])

  /* 2) Movimientos. El effect depende de `centroCostoId`: cambiar el filtro
        re-solicita AL SERVIDOR con ?centroCostoId=. La petición anterior se
        aborta en la limpieza para que una respuesta lenta no pise una nueva.
        El reinicio de error/carga vive en `cambiarCentroCosto` y en los
        reintentos (mismo motivo que arriba). */
  useEffect(() => {
    let cancelado = false
    const controlador = new AbortController()

    obtenerMovimientos(ID_PLANILLA, centroCostoId, controlador.signal)
      .then((filas) => {
        if (cancelado) return
        setMovimientos(filas)
        // Desplegable también desde la respuesta SIN FILTRAR (ver `setCentrosCosto`).
        if (centroCostoId === null) setCentrosCosto(centrosDeMovimientos(filas))
      })
      .catch((error: unknown) => {
        if (cancelado || esCancelacion(error)) return
        setErrorMovimientos(mensajeDeError(error))
      })
      .finally(() => {
        if (!cancelado) setCargandoMovimientos(false)
      })

    return () => {
      cancelado = true
      controlador.abort()
    }
  }, [centroCostoId, intentoMovimientos, setMovimientos, setCentrosCosto])

  /**
   * Enviar a SAP. El GUARD síncrono es el que documenta el store: leer
   * `envioEstado` con `getState()` antes del await cierra la ventana de doble
   * click (y `setEnvioPending` vuelve a ser no-op si ya estaba pendiente).
   */
  async function enviarASap(): Promise<void> {
    const estadoActual = useDetallePlanilla.getState()
    if (estadoActual.envioEstado === 'pending') return

    const planillaActual = estadoActual.planilla
    if (planillaActual === null || planillaActual.estado !== 'Aprobada') return

    setEsConflicto(false)
    setEnvioPending()

    try {
      const resultado = await enviarPlanillaASap(planillaActual.planillaId)
      // `setEnvioSuccess` pasa a 'EnviadaSAP' en la MISMA escritura que el estado del envío.
      setEnvioSuccess(resultado.referenciaSap ?? '')
      // Hidratar la hora del servidor (previsto en el comentario de `setEnvioSuccess`):
      // la escritura anterior pone el estado; ésta trae referencia y fecha tal cual.
      setPlanilla({
        ...planillaActual,
        estado: 'EnviadaSAP',
        referenciaSap: resultado.referenciaSap,
        enviadaSapEn: resultado.enviadaSapEn,
      })
    } catch (error) {
      // 409 → otra petición ganó la carrera: se marca para el panel de conflicto.
      // El mensaje en español viene del servidor (o del default de `cliente.ts`).
      if (error instanceof ErrorDeApi && error.status === 409) setEsConflicto(true)
      setEnvioError(mensajeDeError(error))
    }
  }

  /*
   * Reinicios de carga/error: van en el MANEJADOR que dispara la petición
   * (evento de usuario), nunca de forma síncrona dentro del effect — esa es
   * la regla react/set-state-in-effect y el motivo de este bloque.
   */
  const reintentarCabecera = (): void => {
    setErrorCabecera(null)
    setCargandoCabecera(true)
    setIntentoCabecera((valor) => valor + 1)
  }

  const reintentarMovimientos = (): void => {
    setErrorMovimientos(null)
    setCargandoMovimientos(true)
    setIntentoMovimientos((valor) => valor + 1)
  }

  /** Acción correcta ante un 409: pedir el estado real al servidor. */
  const recargarTodo = (): void => {
    setErrorCabecera(null)
    setCargandoCabecera(true)
    setErrorMovimientos(null)
    setCargandoMovimientos(true)
    setIntentoCabecera((valor) => valor + 1)
    setIntentoMovimientos((valor) => valor + 1)
  }

  /**
   * Cambio de filtro: limpia el error de la tabla y marca "actualizando"
   * (las filas anteriores se quedan a la vista) antes de que el effect
   * re-solicite los movimientos con el nuevo `centroCostoId`.
   */
  const cambiarCentroCosto = (nuevoCentro: string | null): void => {
    setErrorMovimientos(null)
    setCargandoMovimientos(true)
    setCentroCostoId(nuevoCentro)
  }

  return (
    <main className="pantalla">
      <h1 className="pantalla__titulo">Detalle de planilla</h1>

      {planilla === null ? (
        errorCabecera !== null ? (
          <PanelError
            titulo="No se pudo cargar la planilla"
            mensaje={errorCabecera}
            textoReintentar="Reintentar carga"
            onReintentar={reintentarCabecera}
          />
        ) : (
          <IndicadorCarga texto={cargandoCabecera ? 'Cargando planilla…' : 'Cargando…'} />
        )
      ) : (
        <>
          {/* Cabecera ya visible: si una recarga falló, el error se muestra EN VIVO
              sin ocultar los datos que sí se tienen. */}
          {errorCabecera !== null && (
            <PanelError
              titulo="No se pudo actualizar la cabecera"
              mensaje={errorCabecera}
              textoReintentar="Reintentar"
              onReintentar={reintentarCabecera}
            />
          )}

          <EncabezadoPlanilla planilla={planilla} />

          {/* Recarga de cabecera (retry): feedback mientras siguen visibles los datos. */}
          {cargandoCabecera && (
            <p className="actualizando" role="status">
              Actualizando cabecera…
            </p>
          )}

          <section className="panel" aria-label="Movimientos de la planilla">
            <div className="panel__barra">
              <FiltroCentroCosto
                centros={centrosCosto}
                valor={centroCostoId}
                onChange={cambiarCentroCosto}
              />
              {/* Carga del filtro: las filas anteriores se mantienen para no
                  parpadear; el aviso dice que están llegando datos nuevos. */}
              {cargandoMovimientos && (
                <span className="actualizando" role="status">
                  Actualizando…
                </span>
              )}
            </div>

            <div className="panel__contenido" aria-busy={cargandoMovimientos}>
              {errorMovimientos !== null ? (
                <PanelError
                  titulo="No se pudieron cargar los movimientos"
                  mensaje={errorMovimientos}
                  textoReintentar="Reintentar"
                  onReintentar={reintentarMovimientos}
                />
              ) : cargandoMovimientos && movimientos.length === 0 ? (
                <IndicadorCarga texto="Cargando movimientos…" />
              ) : movimientos.length === 0 ? (
                <EstadoVacio
                  detalle={
                    centroCostoId === null
                      ? 'Esta planilla no tiene movimientos registrados.'
                      : 'Ningún movimiento corresponde al centro de costo seleccionado. Elija «Todos los centros de costo» para ver la planilla completa.'
                  }
                />
              ) : (
                <TablaMovimientos movimientos={movimientos} />
              )}
            </div>

            {/* Totales SIEMPRE del store: nunca se suman filas en el JSX. */}
            <BarraTotales totales={totales} cantidadFilas={movimientos.length} />
          </section>

          <section className="panel panel--envio" aria-label="Envío a SAP">
            <BotonEnviarSap planilla={planilla} envioEstado={envioEstado} onEnviar={enviarASap} />
            <FeedbackEnvio
              envioEstado={envioEstado}
              envioError={envioError}
              esConflicto={esConflicto}
              planilla={planilla}
              onRecargar={recargarTodo}
              onReintentar={enviarASap}
            />
          </section>
        </>
      )}
    </main>
  )
}

export default App
