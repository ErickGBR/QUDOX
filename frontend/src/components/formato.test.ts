/**
 * Escenario: formateo compartido de montos, periodo y fecha.
 *
 * Requisito verificado:
 *  - "`formato.ts`: `formatearMonto` yields Spanish 2-decimal formatting".
 *
 * Regla de dominio que protege (`types/dominio.ts`): un monto NUNCA se muestra
 * crudo; siempre pasa por Intl con 2 decimales y separador español, para que
 * tabla y barra de totales no puedan divergir.
 */
import { describe, expect, it } from 'vitest'
import { formatearFechaHora, formatearMonto, formatearPeriodo } from './formato'

describe('formatearMonto', () => {
  it('usa coma decimal y EXACTAMENTE 2 decimales (formato es-ES)', () => {
    expect(formatearMonto(1234.5)).toBe('1234,50')
    expect(formatearMonto(0)).toBe('0,00')
    expect(formatearMonto(-1500)).toBe('-1500,00')
  })

  it('agrupa con punto de millar cuando el entero supera 4 cifras', () => {
    // En es-ES el separador de millar aparece a partir de 5 dígitos
    // (1234 → «1234», 12345 → «12.345»): por eso el primer caso de arriba no
    // lleva punto y éste sí. Ambos siguen siendo formato español.
    expect(formatearMonto(12345.678)).toBe('12.345,68')
    expect(formatearMonto(1234567.891)).toBe('1.234.567,89')
    expect(formatearMonto(1000000000.1)).toBe('1.000.000.000,10')
  })

  it('redondea a centavos (no truncar: 999.999 ⇒ 1000,00)', () => {
    expect(formatearMonto(999.999)).toBe('1000,00')
    expect(formatearMonto(0.005)).toBe('0,01')
  })
})

describe('formatearPeriodo', () => {
  it("CHAR(7) válido → nombre del mes en español ('2025-10' ⇒ 'octubre de 2025')", () => {
    expect(formatearPeriodo('2025-10')).toBe('octubre de 2025')
    expect(formatearPeriodo('2025-01')).toBe('enero de 2025')
    expect(formatearPeriodo('2025-12')).toBe('diciembre de 2025')
  })

  it('periodo mal formado se devuelve TAL CUAL: mejor un dato feo que uno inventado', () => {
    expect(formatearPeriodo('2025')).toBe('2025')
    expect(formatearPeriodo('2025-13')).toBe('2025-13')
    expect(formatearPeriodo('')).toBe('')
  })
})

describe('formatearFechaHora', () => {
  it('null o vacío → null (la planilla todavía no se envió a SAP)', () => {
    expect(formatearFechaHora(null)).toBeNull()
    expect(formatearFechaHora('')).toBeNull()
  })

  it('fecha inválida se devuelve tal cual: no se inventa una fecha', () => {
    expect(formatearFechaHora('no-es-una-fecha')).toBe('no-es-una-fecha')
  })
})
