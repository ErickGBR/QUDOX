/**
 * Escenario: filtro por centro de costo (desplegable controlado).
 *
 * Requisitos verificados:
 *  - "renders options".
 *  - "change calls handler with the chosen `centroCostoId`".
 *
 * Nota de diseño que este test protege: el componente NO filtra en el cliente;
 * SOLO notifica. Por eso lo único que se verifica del cambio es la llamada a
 * `onChange` con el id elegido (o `null` para «Todos»).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CentroCosto } from '../types'
import { FiltroCentroCosto } from './FiltroCentroCosto'

const CENTROS: CentroCosto[] = [
  { centroCostoId: '10', nombre: 'Producción' },
  { centroCostoId: '20', nombre: 'Administración' },
  { centroCostoId: '30', nombre: 'Logística' },
]

describe('FiltroCentroCosto — opciones', () => {
  it('renderiza «Todos» + una opción por cada centro de costo', () => {
    const onChange = vi.fn()
    render(<FiltroCentroCosto centros={CENTROS} valor={null} onChange={onChange} />)

    const opciones = screen.getAllByRole('option')
    expect(opciones).toHaveLength(1 + CENTROS.length)
    expect(screen.getByRole('option', { name: 'Todos los centros de costo' })).toBeInTheDocument()
    for (const centro of CENTROS) {
      expect(screen.getByRole('option', { name: centro.nombre })).toBeInTheDocument()
    }
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('lista vacía → solo «Todos los centros de costo» (el desplegable nunca queda roto)', () => {
    render(<FiltroCentroCosto centros={[]} valor={null} onChange={vi.fn()} />)
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('refleja el valor controlado recibido del store', () => {
    render(<FiltroCentroCosto centros={CENTROS} valor="20" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveValue('20')
  })
})

describe('FiltroCentroCosto — cambio', () => {
  it('al elegir un centro llama a onChange con ESE centroCostoId', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FiltroCentroCosto centros={CENTROS} valor={null} onChange={onChange} />)

    await user.selectOptions(screen.getByRole('combobox'), '30')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('30')
  })

  it('al elegir «Todos» llama a onChange con null (sin filtro server-side)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FiltroCentroCosto centros={CENTROS} valor="10" onChange={onChange} />)

    await user.selectOptions(screen.getByRole('combobox'), '')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('deshabilitado → el select queda inoperativo (carga en curso)', () => {
    render(
      <FiltroCentroCosto centros={CENTROS} valor={null} onChange={vi.fn()} deshabilitado />,
    )
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
