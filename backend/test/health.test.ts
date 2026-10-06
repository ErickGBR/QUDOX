/**
 * QUDOX — Pruebas de salud y de mapa de rutas.
 *
 * Cada `it` nombra el escenario y la clausula del contrato que verifica.
 *
 * ------------------------------------------------------------------
 * COMO SE GARANTIZA QUE NINGUNA PRUEBA ABRE LA BASE
 * ------------------------------------------------------------------
 * `vi.mock('../src/utils/prisma')` sustituye el modulo singleton ANTES de que
 * src/app.ts lo importe: el `PrismaClient` real jamas se instancia. Ademas el
 * doble `obtenerPrisma` de este archivo LANZA si alguien lo invocara, de modo
 * que un health check que intentara tocar la base haria fallar la prueba en
 * vez de abrir una conexion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { crearApp } from '../src/app';
import { obtenerPrisma } from '../src/utils/prisma';

vi.mock('../src/utils/prisma', () => ({
  obtenerPrisma: vi.fn(),
  cerrarPrisma: vi.fn(),
}));

const app = crearApp();

beforeEach(() => {
  vi.resetAllMocks();
  // Trampa de red: un health check NUNCA debe llegar hasta Prisma.
  vi.mocked(obtenerPrisma).mockImplementation(() => {
    throw new Error('Un health check no debe tocar la base de datos.');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/health (chequeo de proceso)', () => {
  // `GET /api/health` -> 200 con objeto PLANO
  // `{ status, uptime, timestamp }`, sin sobre `{ data }`.
  it('responde 200 con objeto plano { status, uptime, timestamp }', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Sin sobre `{ data }`: el consumidor lee los campos en la raiz.
    expect(res.body).not.toHaveProperty('data');
  });

  // El health del contrato vive en la RAIZ `/health` y responde
  // DENTRO del sobre único `{ data }` como los otros cuatro endpoints.
  it('GET /health responde 200 dentro del sobre { data }', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        status: 'ok',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      },
    });
  });

  // Ningun endpoint de salud consulta la base (src/services/salud.service.ts):
  // el doble lanza si lo intentara, y aqui ademas se afirma la no-invocacion.
  it('no invoca Prisma: el chequeo de salud no abre conexion a la base', async () => {
    await request(app).get('/api/health');
    await request(app).get('/health');

    expect(obtenerPrisma).not.toHaveBeenCalled();
  });

  // 404 = recurso/ruta inexistente, SIEMPRE con el sobre único
  // `{ error: { codigo, mensaje } }` (las dos claves exactas del contrato).
  it('ruta inexistente -> 404 con sobre de error RUTA_NO_ENCONTRADA', async () => {
    const res = await request(app).get('/ruta/que/no/existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        codigo: 'RUTA_NO_ENCONTRADA',
        mensaje: expect.any(String),
      },
    });
  });
});
