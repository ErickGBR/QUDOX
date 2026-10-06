import type { EstadoPlanilla, PlanillaHeader } from '../types'
import { formatearFechaHora, formatearPeriodo } from './formato'

/**
 * Cabecera de identidad de la planilla: periodo legible, estado (badge) y
 * trazabilidad SAP cuando existe. Recibe la planilla YA cargada; los estados
 * de carga/error del fetch viven en `App.tsx`.
 */

/** Etiqueta visible de cada estado (dominio: 'Borrador' | 'Aprobada' | 'EnviadaSAP'). */
const ETIQUETA_ESTADO: Record<EstadoPlanilla, string> = {
  Borrador: 'Borrador',
  Aprobada: 'Aprobada',
  EnviadaSAP: 'Enviada a SAP',
}

/** Clase del badge — un solo punto de mapeo para no repetir la condición. */
const CLASE_ESTADO: Record<EstadoPlanilla, string> = {
  Borrador: 'borrador',
  Aprobada: 'aprobada',
  EnviadaSAP: 'enviada',
}

interface Props {
  planilla: PlanillaHeader
}

export function EncabezadoPlanilla({ planilla }: Props) {
  const fechaEnvio = formatearFechaHora(planilla.enviadaSapEn)

  return (
    <header className="cabecera">
      <div className="cabecera__identidad">
        <p className="cabecera__periodo">{formatearPeriodo(planilla.periodo)}</p>
        {/*
          El estado NO depende solo del color: la etiqueta escrita siempre
          acompaña al badge (y `data-estado` deja el valor crudo para pruebas).
        */}
        <span
          className={`badge badge--${CLASE_ESTADO[planilla.estado]}`}
          data-estado={planilla.estado}
        >
          {ETIQUETA_ESTADO[planilla.estado]}
        </span>
      </div>

      <dl className="cabecera__datos">
        <div className="cabecera__dato">
          <dt>Periodo</dt>
          <dd>{planilla.periodo}</dd>
        </div>
        <div className="cabecera__dato">
          <dt>Planilla</dt>
          <dd>#{planilla.planillaId}</dd>
        </div>
        {planilla.referenciaSap !== null && (
          <div className="cabecera__dato">
            <dt>Referencia SAP</dt>
            <dd>{planilla.referenciaSap}</dd>
          </div>
        )}
        {fechaEnvio !== null && (
          <div className="cabecera__dato">
            <dt>Enviada el</dt>
            <dd>{fechaEnvio}</dd>
          </div>
        )}
      </dl>
    </header>
  )
}
