/**
 * Escenario: matriz COMPLETA de deshabilitado del botón «Enviar a SAP».
 *
 * Requisitos verificados — los cuatro estados
 * exigidos, uno por `it`:
 *  - `disabled` cuando `estado === 'Borrador'`.
 *  - `disabled` cuando `estado === 'EnviadaSAP'`.
 *  - `enabled` cuando `estado === 'Aprobada'`.
 *  - `disabled` mientras `envioEstado === 'pending'`.
 * Además: un botón apagado NO dispara `onEnviar` (esa es la mitad visible del
 * guard de doble POST; la otra vive en el store).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EstadoEnvio } from '../stores/payrollDetailStore'
import type { EstadoPlanilla, PlanillaHeader } from '../types'
import { BotonEnviarSap } from './BotonEnviarSap'

function planillaCon(estado: EstadoPlanilla, referenciaSap: string | null = null): PlanillaHeader {
  return {
    planillaId: '1',
    periodo: '2025-10',
    estado,
    totalDebitos: 0,
    totalCreditos: 0,
    referenciaSap,
    enviadaSapEn: null,
  }
}

function pintar(planilla: PlanillaHeader, envioEstado: EstadoEnvio) {
  const onEnviar = vi.fn()
  render(<BotonEnviarSap planilla={planilla} envioEstado={envioEstado} onEnviar={onEnviar} />)
  return { onEnviar, boton: screen.getByRole('button') }
}

describe('BotonEnviarSap — matriz de deshabilitado', () => {
  it("deshabilitado con estado 'Borrador' (transición inválida: el backend respondería 400)", () => {
    const { boton } = pintar(planillaCon('Borrador'), 'idle')

    expect(boton).toBeDisabled()
    expect(boton).toHaveTextContent('Enviar a SAP')
    // El POR QUÉ se publica como texto: un botón apagado sin explicación es inaccesible.
    expect(screen.getByText(/la planilla está en Borrador/)).toBeInTheDocument()
    expect(screen.getByText(/Solo se envían a SAP las planillas aprobadas/)).toBeInTheDocument()
  })

  it("deshabilitado con estado 'EnviadaSAP' (reenviar sería un doble envío: 409)", () => {
    const { boton } = pintar(planillaCon('EnviadaSAP', 'SAP-2025-000123'), 'idle')

    expect(boton).toBeDisabled()
    expect(screen.getByText(/ya fue enviada a SAP \(referencia SAP-2025-000123\)/)).toBeInTheDocument()
  })

  it("habilitado con estado 'Aprobada' y click que SÍ dispara onEnviar", async () => {
    const user = userEvent.setup()
    const { onEnviar, boton } = pintar(planillaCon('Aprobada'), 'idle')

    expect(boton).toBeEnabled()
    expect(screen.getByText('Planilla aprobada: lista para enviar a SAP.')).toBeInTheDocument()

    await user.click(boton)
    expect(onEnviar).toHaveBeenCalledTimes(1)
  })

  it("deshabilitado mientras envioEstado === 'pending' (segundo click no llega al handler)", async () => {
    const user = userEvent.setup()
    const { onEnviar, boton } = pintar(planillaCon('Aprobada'), 'pending')

    expect(boton).toBeDisabled()
    expect(boton).toHaveAttribute('aria-busy', 'true')
    expect(boton).toHaveTextContent('Enviando a SAP…')
    expect(screen.getByText(/Envío en curso/)).toBeInTheDocument()

    await user.click(boton)
    expect(onEnviar).not.toHaveBeenCalled()
  })
})

describe('BotonEnviarSap — motivos accesibles', () => {
  it("'EnviadaSAP' sin referencia explica el motivo con su propio texto", () => {
    pintar(planillaCon('EnviadaSAP'), 'idle')
    expect(screen.getByText('Deshabilitado: esta planilla ya fue enviada a SAP.')).toBeInTheDocument()
  })

  it("envioEstado 'success' explica el resultado aunque el estado de planilla siga llegando", () => {
    pintar(planillaCon('Aprobada'), 'success')
    expect(screen.getByText(/Envío completado: la planilla quedó en estado Enviada a SAP/)).toBeInTheDocument()
  })
})
