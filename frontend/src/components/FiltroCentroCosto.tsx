import type { CentroCosto } from '../types'

/**
 * Filtro por centro de costo.
 *
 * IMPORTANTE: este componente NO filtra. Solo elige y notifica; el valor viaja
 * a `App.tsx`, que re-solicita los movimientos con `?centroCostoId=` al
 * servidor (filtro server-side). Ninguna fila se descarta en el cliente.
 */

interface Props {
  centros: CentroCosto[]
  /** null = "Todos" (sin filtro). */
  valor: string | null
  onChange: (centroCostoId: string | null) => void
  deshabilitado?: boolean
}

export function FiltroCentroCosto({ centros, valor, onChange, deshabilitado = false }: Props) {
  return (
    <div className="filtro">
      <label className="filtro__etiqueta" htmlFor="filtro-centro-costo">
        Centro de costo
      </label>
      <select
        id="filtro-centro-costo"
        className="filtro__select"
        value={valor ?? ''}
        disabled={deshabilitado}
        onChange={(evento) => {
          const seleccion = evento.currentTarget.value
          onChange(seleccion === '' ? null : seleccion)
        }}
      >
        <option value="">Todos los centros de costo</option>
        {centros.map((centro) => (
          <option key={centro.centroCostoId} value={centro.centroCostoId}>
            {centro.nombre}
          </option>
        ))}
      </select>
    </div>
  )
}
