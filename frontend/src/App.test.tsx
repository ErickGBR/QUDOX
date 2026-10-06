/**
 * Escenario: integración de `App.tsx` con la capa de API COMPLETAMENTE MOCKEADA.
 *
 * Requisitos verificados:
 *  - "`vi.mock` the `src/api/*` module — zero real fetch calls".
 *  - Guard de doble POST de verdad: el handler `enviarASap` lee el estado
 *    SÍNCRONO con `getState()` antes de disparar el POST, así que un segundo
 *    click en vuelo no genera un segundo envío.
 *  - "Store: 409 sets conflict state": el 409 llega como `ErrorDeApi.status`
 *    y App levanta el panel de conflicto (el store guarda el mensaje).
 *  - Estado vacío de pantalla (`EstadoVacio`) cuando no hay movimientos.
 *
 * Se conservan las clases REALES de `src/api` (ErrorDeApi/ErrorDeRed): solo se
 * mockean las cuatro funciones de red, para que `instanceof` en el handler de
 * App sea exactamente el de producción.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  ErrorDeApi,
  enviarPlanillaASap,
  obtenerCentrosCosto,
  obtenerMovimientos,
  obtenerPlanilla,
} from './api'
import { useDetallePlanilla } from './stores/payrollDetailStore'
import type { CentroCosto, Movimiento, PlanillaHeader } from './types'

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>()
  return {
    ...original,
    obtenerPlanilla: vi.fn(),
    obtenerCentrosCosto: vi.fn(),
    obtenerMovimientos: vi.fn(),
    enviarPlanillaASap: vi.fn(),
  }
})

const MENSAJE_409 =
  'Otra petición ya envió esta planilla a SAP. Recargue para ver el estado actual.'

function planillaAprobada(): PlanillaHeader {
  return {
    planillaId: '1',
    periodo: '2025-10',
    estado: 'Aprobada',
    totalDebitos: 1000,
    totalCreditos: 800,
    referenciaSap: null,
    enviadaSapEn: null,
  }
}

const CENTROS: CentroCosto[] = [
  { centroCostoId: '10', nombre: 'Producción' },
  { centroCostoId: '20', nombre: 'Administración' },
]

const FILAS: Movimiento[] = [
  {
    detalleId: '1',
    empleadoId: 'E-1',
    empleadoNombre: 'Ana Pérez',
    centroCostoId: '10',
    centroCostoNombre: 'Producción',
    concepto: 'Sueldo base',
    monto: 1000,
    tipo: 'D',
  },
]

beforeEach(() => {
  // Limpia implementaciones ANTES de fijar las de este `it`: nada se hereda
  // del escenario anterior (el store además se reinicia con reset()).
  vi.resetAllMocks()
  // `resetAllMocks` también vació la guardia de red: se reinstala para que
  // cualquier fetch que se cuele sin mock falle de forma ruidosa.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('FETCH_SIN_MOCK_EN_TESTS'))),
  )
  useDetallePlanilla.getState().reset()
  vi.mocked(obtenerPlanilla).mockResolvedValue(planillaAprobada())
  vi.mocked(obtenerCentrosCosto).mockResolvedValue(CENTROS)
  vi.mocked(obtenerMovimientos).mockResolvedValue(FILAS)
})

describe('App — guard de doble POST', () => {
  it('un click dispara UN envío; mientras está en vuelo el botón se apaga y el segundo click no manda nada', async () => {
    // POST que nunca resuelve: la app queda en 'pending' de forma indefinida.
    vi.mocked(enviarPlanillaASap).mockReturnValue(new Promise<never>(() => {}))
    const user = userEvent.setup()

    render(<App />)
    const boton = await screen.findByRole('button', { name: 'Enviar a SAP' })
    expect(boton).toBeEnabled()

    await user.click(boton)

    const pendiente = await screen.findByRole('button', { name: /Enviando a SAP/ })
    expect(pendiente).toBeDisabled()
    expect(pendiente).toHaveAttribute('aria-busy', 'true')

    await user.click(pendiente)

    expect(vi.mocked(enviarPlanillaASap)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(enviarPlanillaASap)).toHaveBeenCalledWith('1')
    expect(useDetallePlanilla.getState().envioEstado).toBe('pending')
  })

  it('éxito: la planilla pasa a EnviadaSAP con su referencia y el botón queda deshabilitado', async () => {
    vi.mocked(enviarPlanillaASap).mockResolvedValue({
      planillaId: '1',
      estado: 'EnviadaSAP',
      referenciaSap: 'SAP-2025-000123',
      enviadaSapEn: '2025-10-05T10:00:00.000Z',
    })
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Enviar a SAP' }))

    expect(await screen.findByText('Planilla enviada a SAP')).toBeInTheDocument()
    expect(screen.getByText(/la referencia SAP-2025-000123/)).toBeInTheDocument()
    expect(screen.getByText('Enviada a SAP')).toBeInTheDocument() // badge del encabezado
    expect(screen.getByRole('button', { name: 'Enviar a SAP' })).toBeDisabled()
    expect(vi.mocked(enviarPlanillaASap)).toHaveBeenCalledTimes(1)
  })
})

describe('App — 409 (conflicto)', () => {
  it('un 409 levanta el panel de conflicto con el mensaje del servidor y la acción «Recargar planilla»', async () => {
    vi.mocked(enviarPlanillaASap).mockRejectedValue(
      new ErrorDeApi(409, 'carrera_doble_envio', MENSAJE_409),
    )
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Enviar a SAP' }))

    expect(await screen.findByText('Conflicto de envío (HTTP 409)')).toBeInTheDocument()
    // El mensaje en español llega TAL CUAL desde la capa api/ (no se genera texto genérico).
    expect(screen.getByText(MENSAJE_409)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar planilla' })).toBeInTheDocument()
    // El store queda en estado de conflicto: error con el mensaje, no 'pending'.
    expect(useDetallePlanilla.getState().envioEstado).toBe('error')
    expect(useDetallePlanilla.getState().envioError).toBe(MENSAJE_409)
  })

  it('un fallo NO-409 ofrece «Reintentar envío» en lugar de «Recargar planilla»', async () => {
    vi.mocked(enviarPlanillaASap).mockRejectedValue(
      new ErrorDeApi(502, 'sap_502', 'SAP no respondió correctamente. La planilla no se modificó; puede reintentar.'),
    )
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Enviar a SAP' }))

    expect(await screen.findByText('No se pudo enviar a SAP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar envío' })).toBeInTheDocument()
    expect(screen.queryByText('Conflicto de envío (HTTP 409)')).not.toBeInTheDocument()
  })
})

describe('App — pantalla sin movimientos', () => {
  it('muestra el estado vacío (no la tabla) cuando el servidor devuelve cero filas', async () => {
    vi.mocked(obtenerMovimientos).mockResolvedValue([])

    render(<App />)

    expect(await screen.findByText('Sin movimientos')).toBeInTheDocument()
    expect(
      screen.getByText('Esta planilla no tiene movimientos registrados.'),
    ).toBeInTheDocument()
    expect(screen.getByText('0 movimientos visibles')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // El filtro sigue disponible para ampliar la búsqueda.
    expect(screen.getByRole('combobox')).toBeEnabled()
  })
})

describe('App — filtro server-side', () => {
  it('cambiar el centro de costo re-solicita los movimientos con ?centroCostoId= al servidor', async () => {
    const user = userEvent.setup()

    render(<App />)
    await screen.findByRole('button', { name: 'Enviar a SAP' })

    expect(vi.mocked(obtenerMovimientos)).toHaveBeenNthCalledWith(1, '1', null, expect.anything())

    await user.selectOptions(screen.getByRole('combobox'), '20')

    // Nada de filtrado en cliente: la petición nueva lleva el id elegido.
    await waitFor(() =>
      expect(vi.mocked(obtenerMovimientos)).toHaveBeenLastCalledWith(
        '1',
        '20',
        expect.anything(),
      ),
    )
  })
})
