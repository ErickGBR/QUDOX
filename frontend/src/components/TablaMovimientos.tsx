import type { Movimiento } from '../types'
import { formatearMonto } from './formato'

/**
 * Tabla de movimientos. Pura de presentación: recibe las filas YA filtradas
 * por el servidor y YA con totales calculados en el store; aquí no se filtra
 * ni se suma nada.
 *
 * Convención contable visible: `tipo` 'D' = débito, 'C' = crédito. El signo NO
 * se altera en el monto (siempre valor absoluto con 2 decimales) — el lado de la
 * partida lo indica la columna "Tipo", así la columna "Monto" queda alineada y
 * sumable a la vista.
 */

interface Props {
  movimientos: Movimiento[]
}

export function TablaMovimientos({ movimientos }: Props) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        {/* Caption oculto visualmente: aporta contexto al lector de pantalla. */}
        <caption className="visually-hidden">
          Movimientos de la planilla. Montos en dólares con dos decimales.
        </caption>
        <thead>
          <tr>
            <th scope="col">Empleado</th>
            <th scope="col">Centro de costo</th>
            <th scope="col">Concepto</th>
            <th scope="col" className="tabla__celda--centro">
              Tipo
            </th>
            <th scope="col" className="tabla__celda--monto">
              Monto
            </th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((movimiento) => (
            <tr key={movimiento.detalleId} data-tipo={movimiento.tipo}>
              <td>{movimiento.empleadoNombre}</td>
              <td>{movimiento.centroCostoNombre}</td>
              <td>{movimiento.concepto}</td>
              <td className="tabla__celda--centro">
                <span className={`tipo tipo--${movimiento.tipo}`}>
                  {movimiento.tipo === 'D' ? 'Débito' : 'Crédito'}
                </span>
              </td>
              <td className="tabla__celda--monto">
                <span className={`monto monto--${movimiento.tipo}`}>
                  {formatearMonto(movimiento.monto)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
