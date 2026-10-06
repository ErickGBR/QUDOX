/**
 * QUDOX — Pruebas unitarias del SAP simulado (src/services/sap.service.ts).
 *
 * Este archivo NO mockea el modulo: valida el mock real de SAP en sus dos
 * caminos, con la variable de entorno como interruptor determinista (sin
 * aleatoriedad, sin sleeps). No importa Prisma, asi que ninguna prueba aqui
 * abre una conexion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enviarPlanillaASap } from '../src/services/sap.service';
import { ErrorAplicacion } from '../src/types/errores';

beforeEach(() => {
  // Por defecto, camino sano aunque el entorno del host traiga la variable.
  vi.stubEnv('SAP_SIMULAR_FALLO', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('enviarPlanillaASap (mock de SAP)', () => {
  // Fallo del downstream (502): con SAP_SIMULAR_FALLO=true
  // el mock rechaza con ErrorAplicacion de status 502 — el codigo que el
  // mapa HTTP fija para el fallo del sistema externo.
  it('con SAP_SIMULAR_FALLO=true rechaza con ErrorAplicacion de status 502', async () => {
    vi.stubEnv('SAP_SIMULAR_FALLO', 'true');

    const resultado = await enviarPlanillaASap().catch((error: unknown) => error);

    expect(resultado).toBeInstanceOf(ErrorAplicacion);
    expect(resultado).toMatchObject({
      status: 502,
      codigo: 'SAP_NO_DISPONIBLE',
    });
  });

  // Camino sano: resuelve una referencia con el formato documentado
  // `SAP-YYYYMMDDHHMMSS-NNNN` (23 caracteres, dentro del VARCHAR(60) de
  // Planillas.ReferenciaSap) y nunca vacia.
  it('sin fallo simulado resuelve una referencia con formato SAP-YYYYMMDDHHMMSS-NNNN', async () => {
    const referencia = await enviarPlanillaASap();

    expect(referencia).toMatch(/^SAP-\d{14}-\d{4}$/);
    expect(referencia.length).toBeLessThanOrEqual(60);
  });
});
