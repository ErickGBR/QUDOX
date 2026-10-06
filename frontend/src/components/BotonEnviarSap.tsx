import type { EstadoEnvio } from '../stores/payrollDetailStore'
import type { PlanillaHeader } from '../types'

/**
 * Botón «Enviar a SAP» con TODA la matriz de deshabilitado en un solo lugar.
 *
 * `disabled` cuando:
 *  - `estado !== 'Aprobada'` → cubre 'Borrador' (transición inválida, 400 en el
 *    backend) y 'EnviadaSAP' (ya enviada: reenviar sería un doble envío, 409);
 *  - `envioEstado === 'pending'` → mientras el POST está en vuelo, para que un
 *    segundo click no dispare un segundo POST (el store además es no-op si ya
 *    estaba pendiente: defensa en profundidad).
 *
 * El POR QUÉ del deshabilitado se publica como texto visible y con
 * `aria-describedby`: un botón apagado sin explicación es inaccesible.
 */

interface Props {
  planilla: PlanillaHeader
  envioEstado: EstadoEnvio
  onEnviar: () => void
}

export function BotonEnviarSap({ planilla, envioEstado, onEnviar }: Props) {
  const pendiente = envioEstado === 'pending'
  const aprobada = planilla.estado === 'Aprobada'
  const deshabilitado = !aprobada || pendiente

  return (
    <div className="envio">
      <button
        type="button"
        className="boton boton--primario envio__boton"
        onClick={onEnviar}
        disabled={deshabilitado}
        aria-busy={pendiente}
        aria-describedby="envio-sap-reason"
      >
        {pendiente && <span className="boton__pulso" aria-hidden="true" />}
        {pendiente ? 'Enviando a SAP…' : 'Enviar a SAP'}
      </button>

      <p className="envio__motivo" id="envio-sap-reason">
        {motivo(planilla, envioEstado)}
      </p>
    </div>
  )
}

/** Texto del motivo — una sola función para que botón y explicación no diverjan. */
function motivo(planilla: PlanillaHeader, envioEstado: EstadoEnvio): string {
  if (envioEstado === 'pending') {
    return 'Envío en curso: no cierre esta ventana hasta ver el resultado.'
  }
  if (envioEstado === 'success') {
    return 'Envío completado: la planilla quedó en estado Enviada a SAP.'
  }
  if (planilla.estado === 'Borrador') {
    return 'Deshabilitado: la planilla está en Borrador. Solo se envían a SAP las planillas aprobadas.'
  }
  if (planilla.estado === 'EnviadaSAP') {
    return planilla.referenciaSap === null
      ? 'Deshabilitado: esta planilla ya fue enviada a SAP.'
      : `Deshabilitado: esta planilla ya fue enviada a SAP (referencia ${planilla.referenciaSap}).`
  }
  return 'Planilla aprobada: lista para enviar a SAP.'
}
