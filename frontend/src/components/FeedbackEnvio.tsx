import type { EstadoEnvio } from '../stores/payrollDetailStore'
import type { PlanillaHeader } from '../types'

/**
 * Retroalimentación del envío a SAP — tres superficies VISUALMENTE distintas:
 *
 *  - `success` → aviso verde con la referencia SAP.
 *  - `error` con 409 → PANEL DE CONFLICTO: la carrera del doble envío ya la
 *    ganó otra petición. Se explica en español (el mensaje sale del sobre de
 *    error del servidor, con texto propio en `cliente.ts`) y se ofrece
 *    RECARGAR — recargar es la única acción correcta: reintentar a ciegas
 *    produciría un 409 otra vez.
 *  - `error` sin 409 → aviso rojo con el mensaje del servidor y, si la
 *    planilla sigue Aprobada, un reintento de envío.
 *
 * El store NO guarda el status HTTP (solo `envioError: string`); el 409 se
 * detecta en `App.tsx` con `ErrorDeApi.status` y llega aquí como `esConflicto`.
 */

interface Props {
  envioEstado: EstadoEnvio
  envioError: string | null
  esConflicto: boolean
  planilla: PlanillaHeader | null
  /** Recarga cabecera + movimientos desde el servidor (acción para el 409). */
  onRecargar: () => void
  /** Reintenta el POST (solo tiene sentido si sigue en 'Aprobada'). */
  onReintentar: () => void
}

export function FeedbackEnvio({
  envioEstado,
  envioError,
  esConflicto,
  planilla,
  onRecargar,
  onReintentar,
}: Props) {
  if (envioEstado === 'success') {
    return (
      <div className="aviso aviso--exito" role="status">
        <p className="aviso__titulo">Planilla enviada a SAP</p>
        <p>
          {planilla?.referenciaSap
            ? `El servidor confirmó el envío con la referencia ${planilla.referenciaSap}.`
            : 'El servidor confirmó el envío.'}
        </p>
      </div>
    )
  }

  if (envioEstado === 'error' && esConflicto) {
    const yaEnviada = planilla?.estado === 'EnviadaSAP'
    return (
      <div className="aviso aviso--conflicto" role="alert">
        <p className="aviso__titulo">Conflicto de envío (HTTP 409)</p>
        <p>{envioError}</p>
        <p className="aviso__detalle">
          {yaEnviada
            ? 'La recarga confirmó que esta planilla ya figura como Enviada a SAP: no hay nada más que enviar.'
            : 'Otra petición envió esta planilla mientras usted operaba. Recargue para ver el estado real antes de cualquier otro intento.'}
        </p>
        {!yaEnviada && (
          <button type="button" className="boton boton--secundario" onClick={onRecargar}>
            Recargar planilla
          </button>
        )}
      </div>
    )
  }

  if (envioEstado === 'error') {
    return (
      <div className="aviso aviso--error" role="alert">
        <p className="aviso__titulo">No se pudo enviar a SAP</p>
        <p>{envioError}</p>
        {planilla?.estado === 'Aprobada' && (
          <button type="button" className="boton boton--secundario" onClick={onReintentar}>
            Reintentar envío
          </button>
        )}
      </div>
    )
  }

  return null
}
