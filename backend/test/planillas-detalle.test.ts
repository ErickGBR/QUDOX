/**
 * QUDOX — Pruebas de lectura: `GET /api/planillas/:id`,
 * `GET /api/planillas/:id/movimientos` y `GET /api/centros-costo`.
 *
 * Cada `it` nombra el escenario y la clausula del contrato que verifica.
 *
 * Igual que en enviar-sap.test.ts: `vi.mock('../src/utils/prisma')` sustituye
 * el singleton ANTES de que src/app.ts lo importe, asi que ninguna prueba de
 * este archivo abre una conexion a SQL Server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { crearApp } from '../src/app';
import { obtenerPrisma } from '../src/utils/prisma';

vi.mock('../src/utils/prisma', () => ({
  obtenerPrisma: vi.fn(),
  cerrarPrisma: vi.fn(),
}));

/** Fila de `Planillas` en memoria. */
interface FilaPlanilla {
  planillaId: bigint;
  periodo: string;
  estado: string;
  referenciaSap: string | null;
  enviadaSapEn: Date | null;
}

/** Fila de `PlanillaDetalle` con la travesia detalle -> empleado -> centroCosto. */
interface FilaDetalle {
  detalleId: bigint;
  concepto: string;
  monto: number;
  tipo: string;
  empleado: {
    empleadoId: bigint;
    nombre: string;
    centroCostoId: bigint;
    centroCosto: { centroCostoId: bigint; nombre: string };
  };
}

/** Doble de Prisma: los delegates que tocan los tres services de lectura. */
const prismaDoble = {
  planilla: { findUnique: vi.fn() },
  planillaDetalle: { aggregate: vi.fn(), findMany: vi.fn() },
  centroCosto: { findMany: vi.fn() },
};

/** Estado en memoria del doble. */
let almacen: { planilla: FilaPlanilla | null };

const app = crearApp();

/** Fila base de ejemplo (estado 'Aprobada'). */
function filaEjemplo(): FilaPlanilla {
  return {
    planillaId: 1n,
    periodo: '2026-06',
    estado: 'Aprobada',
    referenciaSap: null,
    enviadaSapEn: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Los ErrorAplicacion con `logDetalle` (422/500) se loguean por consola;
  // se silencian para que la salida del suite sea limpia.
  vi.spyOn(console, 'error').mockImplementation(() => {});

  vi.mocked(obtenerPrisma).mockReturnValue(prismaDoble as never);

  almacen = { planilla: filaEjemplo() };

  prismaDoble.planilla.findUnique.mockImplementation(
    async (args: { where: { planillaId: bigint } }) => {
      const fila = almacen.planilla;
      if (!fila || fila.planillaId !== args.where.planillaId) {
        return null;
      }
      return { ...fila };
    },
  );

  // Dos agregados (tipo 'D' y 'C') resueltos en paralelo por el service.
  prismaDoble.planillaDetalle.aggregate.mockImplementation(
    async (args: { where: { tipo: string } }) => ({
      _sum: { monto: args.where.tipo === 'D' ? 1200.5 : 1100.25 },
    }),
  );

  prismaDoble.planillaDetalle.findMany.mockResolvedValue([]);
  prismaDoble.centroCosto.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/planillas/:id — cabecera', () => {
  // Mapa HTTP (fila GET /api/planillas/:id): 200 con la cabecera y los
  // ids serializados con .toString() (JSON.stringify lanza con BigInt).
  it('planilla existente -> 200 con cabecera, totales y planillaId como string', async () => {
    const res = await request(app).get('/api/planillas/1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        planillaId: '1',
        periodo: '2026-06',
        estado: 'Aprobada',
        totalDebitos: 1200.5,
        totalCreditos: 1100.25,
        referenciaSap: null,
        enviadaSapEn: null,
      },
    });
    expect(res.text).not.toContain('Do not know how to serialize a BigInt');
    expect(prismaDoble.planilla.findUnique).toHaveBeenCalledWith({
      where: { planillaId: 1n },
    });
  });

  // TRAMPA documentada en planillas.service: `_sum` es null sin filas y el
  // `?? 0` lo normaliza — sin eso los totales desaparecerian del JSON.
  it('planilla sin detalles (_sum null) -> totales 0 en la respuesta', async () => {
    prismaDoble.planillaDetalle.aggregate.mockResolvedValue({ _sum: { monto: null } });

    const res = await request(app).get('/api/planillas/1');

    expect(res.status).toBe(200);
    expect(res.body.data.totalDebitos).toBe(0);
    expect(res.body.data.totalCreditos).toBe(0);
  });

  // Mapa HTTP (404: planilla no existe) con el sobre único de dos claves.
  it('planilla inexistente -> 404 PLANILLA_NO_ENCONTRADA', async () => {
    const res = await request(app).get('/api/planillas/999');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { codigo: 'PLANILLA_NO_ENCONTRADA', mensaje: expect.any(String) },
    });
    // Sin agregados: el flujo corto en la lectura.
    expect(prismaDoble.planillaDetalle.aggregate).not.toHaveBeenCalled();
  });

  // Mapa HTTP (422) + validacion (id con isInt({ min: 1 }), nunca isUUID): el
  // validador corta ANTES del controller, Prisma no se entera.
  it("id no entero ('xyz') -> 422 sin tocar Prisma", async () => {
    const res = await request(app).get('/api/planillas/xyz');

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { codigo: 'VALIDACION_FALLIDA', mensaje: expect.stringContaining('id:') },
    });
    expect(obtenerPrisma).not.toHaveBeenCalled();
  });

  // Defensa en profundidad (planillas.service.normalizarEstado): un estado
  // que el CHECK del DDL deberia impedir es 500 logueado, nunca un estado
  // inventado en la respuesta.
  it('estado desconocido en la fila -> 500 ERROR_INTERNO logueado', async () => {
    almacen.planilla = { ...filaEjemplo(), estado: 'Zombie' };

    const res = await request(app).get('/api/planillas/1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { codigo: 'ERROR_INTERNO', mensaje: expect.any(String) },
    });
    expect(res.text).not.toContain('Zombie');
    expect(vi.mocked(console.error)).toHaveBeenCalled();
  });
});

describe('GET /api/planillas/:id/movimientos — detalle', () => {
  // Fila de ejemplo con la travesia completa detalle -> empleado ->
  // centroCosto (el centro de costo NO esta en el detalle).
  function filaDetalle(tipo: string): FilaDetalle {
    return {
      detalleId: tipo === 'D' ? 10n : 20n,
      concepto: tipo === 'D' ? 'Sueldo' : 'Aportes',
      monto: tipo === 'D' ? 1500.75 : 300.25,
      tipo,
      empleado: {
        empleadoId: 5n,
        nombre: 'Ana Perez',
        centroCostoId: 2n,
        centroCosto: { centroCostoId: 2n, nombre: 'Operaciones' },
      },
    };
  }

  // Mapa HTTP (fila movimientos): 200 con el array de movimientos; ids
  // serializados con .toString() y monto numerico.
  it('planilla existente -> 200 con movimientos mapeados (ids string, monto number)', async () => {
    prismaDoble.planillaDetalle.findMany.mockResolvedValue([
      filaDetalle('D'),
      filaDetalle('C'),
    ]);

    const res = await request(app).get('/api/planillas/1/movimientos');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        detalleId: '10',
        empleadoId: '5',
        empleadoNombre: 'Ana Perez',
        centroCostoId: '2',
        centroCostoNombre: 'Operaciones',
        concepto: 'Sueldo',
        monto: 1500.75,
        tipo: 'D',
      },
      {
        detalleId: '20',
        empleadoId: '5',
        empleadoNombre: 'Ana Perez',
        centroCostoId: '2',
        centroCostoNombre: 'Operaciones',
        concepto: 'Aportes',
        monto: 300.25,
        tipo: 'C',
      },
    ]);
    expect(res.text).not.toContain('Do not know how to serialize a BigInt');

    // Sin filtro: el where NO lleva clave `empleado` (el filtro seria sobre
    // empleado.centroCostoId, jamas sobre una columna del detalle).
    expect(prismaDoble.planillaDetalle.findMany).toHaveBeenCalledWith({
      where: { planillaId: 1n },
      include: { empleado: { include: { centroCosto: true } } },
      orderBy: { detalleId: 'asc' },
    });
  });

  // Nota: el filtro `centroCostoId` se aplica sobre
  // `empleado.centroCostoId` — PlanillaDetalle no tiene columna propia.
  it('con ?centroCostoId=7 el filtro va sobre empleado.centroCostoId (BigInt)', async () => {
    prismaDoble.planillaDetalle.findMany.mockResolvedValue([filaDetalle('D')]);

    const res = await request(app).get('/api/planillas/1/movimientos?centroCostoId=7');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaDoble.planillaDetalle.findMany).toHaveBeenCalledWith({
      where: { planillaId: 1n, empleado: { centroCostoId: 7n } },
      include: { empleado: { include: { centroCosto: true } } },
      orderBy: { detalleId: 'asc' },
    });
  });

  // Mapa HTTP (404): planilla inexistente responde 404, NUNCA [] con 200
  // (seria indistinguible de "planilla sin movimientos").
  it('planilla inexistente -> 404 sin consultar los detalles', async () => {
    const res = await request(app).get('/api/planillas/999/movimientos');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { codigo: 'PLANILLA_NO_ENCONTRADA', mensaje: expect.any(String) },
    });
    expect(prismaDoble.planillaDetalle.findMany).not.toHaveBeenCalled();
  });

  // Mapa HTTP (422): centroCostoId mal formado = entrada invalida; corta
  // antes del controller y sin tocar la base.
  it("?centroCostoId=abc -> 422 VALIDACION_FALLIDA sin tocar Prisma", async () => {
    const res = await request(app).get('/api/planillas/1/movimientos?centroCostoId=abc');

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { codigo: 'VALIDACION_FALLIDA', mensaje: expect.stringContaining('centroCostoId:') },
    });
    expect(obtenerPrisma).not.toHaveBeenCalled();
  });
});

describe('GET /api/centros-costo — catalogo', () => {
  // Mapa HTTP (fila centros-costo): 200 con `[{ centroCostoId, nombre }]`
  // y la PK serializada con .toString() (BigInt, nunca UUID).
  it('catalogo -> 200 con centroCostoId serializado como string', async () => {
    prismaDoble.centroCosto.findMany.mockResolvedValue([
      { centroCostoId: 3n, nombre: 'Operaciones' },
      { centroCostoId: 4n, nombre: 'Administracion' },
    ]);

    const res = await request(app).get('/api/centros-costo');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        { centroCostoId: '3', nombre: 'Operaciones' },
        { centroCostoId: '4', nombre: 'Administracion' },
      ],
    });
    expect(res.text).not.toContain('Do not know how to serialize a BigInt');
    expect(prismaDoble.centroCosto.findMany).toHaveBeenCalledWith({
      orderBy: { nombre: 'asc' },
    });
  });
});
