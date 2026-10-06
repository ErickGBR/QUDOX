import type { Totales } from '../types'
import { formatearMonto } from './formato'

/**
 * Barra inferior de totales.
 *
 * `totales` viene DIRECTO del store (`payrollDetailStore.setMovimientos`
 * recalcula en la misma escritura que cambia las filas): aquí no se itera
 * sobre ningún movimiento, bajo ninguna forma. Es el punto exacto donde la
 * regla "los totales viven en el store" se hace visible.
 */

interface Props {
  totales: Totales
  /** Nº de filas visibles (las mismas sobre las que calculó el store). */
  cantidadFilas: number
}

export function BarraTotales({ totales, cantidadFilas }: Props) {
  /*
   * `resultado` es una resta de DOS valores que YA vienen del store — no es un
   * recálculo sobre las filas. El store no expone ese campo y no se le añade
   * uno solo para la vista: se deriva aquí, en un solo término, imposible de
   * desincronizar.
   */
  const resultado = totales.debitos - totales.creditos
  const cuadra = Math.abs(resultado) < 0.005 // redondeo a centavos

  return (
    <footer className="totales" aria-label="Totales de los movimientos visibles">
      <p className="totales__conteo">
        {cantidadFilas === 1 ? '1 movimiento visible' : `${cantidadFilas} movimientos visibles`}
      </p>
      <dl className="totales__lista">
        <div className="totales__item">
          <dt>Débitos</dt>
          <dd className="monto monto--D">{formatearMonto(totales.debitos)}</dd>
        </div>
        <div className="totales__item">
          <dt>Créditos</dt>
          <dd className="monto monto--C">{formatearMonto(totales.creditos)}</dd>
        </div>
        <div className="totales__item totales__item--resultado">
          <dt>Resultado (D − C)</dt>
          <dd className={cuadra ? 'monto' : 'monto monto--descuadre'}>
            {formatearMonto(resultado)}
          </dd>
        </div>
      </dl>
    </footer>
  )
}
