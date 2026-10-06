/**
 * Escenario: tabla de movimientos (presentación pura).
 *
 * Requisitos verificados:
 *  - "renders rows".
 *  - "shows empty state when there are none".
 *
 * Nota: el componente es una tabla SIN lógica (ni filtra ni suma). Su "estado
 * vacío" es no dibujar NI UNA fila y conservar la cabecera para que la tabla
 * siga siendo navegable por lector de pantalla. El mensaje visible
 * «Sin movimientos» (EstadoVacio) vive en `App.tsx` y se cubre en
 * `App.test.tsx`, que es quien decide cuándo se muestra.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Movimiento } from '../types'
import { TablaMovimientos } from './TablaMovimientos'

function crearMovimiento(detalleId: string, sobrante: Partial<Movimiento>): Movimiento {
  return {
    detalleId,
    empleadoId: `E-${detalleId}`,
    empleadoNombre: `Empleado ${detalleId}`,
    centroCostoId: 'CC-10',
    centroCostoNombre: 'Producción',
    concepto: 'Concepto',
    monto: 0,
    tipo: 'D',
    ...sobrante,
  }
}

const FILAS: Movimiento[] = [
  crearMovimiento('1', {
    empleadoNombre: 'Ana Pérez',
    concepto: 'Sueldo base',
    monto: 1234.5,
    tipo: 'D',
  }),
  crearMovimiento('2', {
    empleadoNombre: 'Luis Gómez',
    centroCostoNombre: 'Administración',
    concepto: 'Ajuste',
    monto: 12345.678,
    tipo: 'C',
  }),
]

describe('TablaMovimientos — filas', () => {
  it('renderiza una fila por movimiento con empleado, centro, concepto, tipo y monto formateado', () => {
    render(<TablaMovimientos movimientos={FILAS} />)

    const cuerpo = within(screen.getAllByRole('rowgroup')[1])
    const filas = cuerpo.getAllByRole('row')
    expect(filas).toHaveLength(FILAS.length)

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument()
    expect(screen.getByText('Administración')).toBeInTheDocument()
    expect(screen.getByText('Sueldo base')).toBeInTheDocument()

    // Convención contable visible: 'D' ⇒ Débito, 'C' ⇒ Crédito…
    expect(screen.getByText('Débito')).toBeInTheDocument()
    expect(screen.getByText('Crédito')).toBeInTheDocument()
    // …y el monto SIEMPRE con formato es-ES de 2 decimales (nunca crudo).
    expect(screen.getByText('1234,50')).toBeInTheDocument()
    expect(screen.getByText('12.345,68')).toBeInTheDocument()
  })

  it('la fila expone su tipo en data-tipo (enganche para pruebas/estilos sin romper texto)', () => {
    render(<TablaMovimientos movimientos={FILAS} />)
    const cuerpo = within(screen.getAllByRole('rowgroup')[1])
    const [primera, segunda] = cuerpo.getAllByRole('row')

    expect(primera).toHaveAttribute('data-tipo', 'D')
    expect(segunda).toHaveAttribute('data-tipo', 'C')
  })
})

describe('TablaMovimientos — estado vacío', () => {
  it('sin movimientos NO se dibuja ninguna fila (solo queda la cabecera)', () => {
    render(<TablaMovimientos movimientos={[]} />)

    const grupos = screen.getAllByRole('rowgroup')
    const cuerpo = within(grupos[1])
    expect(cuerpo.queryAllByRole('row')).toHaveLength(0)
    // La cabecera se conserva: la tabla sigue siendo interpretable.
    expect(screen.getAllByRole('row')).toHaveLength(1)
    expect(screen.getByRole('columnheader', { name: 'Empleado' })).toBeInTheDocument()
    expect(screen.queryByText('Sin movimientos')).not.toBeInTheDocument()
  })
})
