/**
 * QUDOX — Pruebas de `POST /api/planillas/:id/enviar-sap`.
 *
 * Cada `it` nombra el escenario y la clausula del contrato que verifica
 * (mapa HTTP, supuestos 6 y 12, serializacion de BigInt).
 *
 * ------------------------------------------------------------------
 * DOBLES: NINGUNA PRUEBA ABRE LA BASE NI LLAMA AL SAP REAL
 * ------------------------------------------------------------------
 * - `vi.mock('../src/utils/prisma')`: el singleton `PrismaClient` real jamas
 *   se importa ni se instancia. El doble guarda el "estado de la base" en una
 *   fila en memoria (`almacen`), de modo que el guard atomico es observable:
 *   si `updateMany` no casa el `where`, el almacen NO cambia (409 sin
 *   cambio de estado).
 * - `vi.mock('../src/services/sap.service')`: el SAP simulado se controla por
 *   prueba (resuelve / rechaza) y su ORDEN de invocacion se verifica con
 *   `invocationCallOrder`, sin variables de entorno ni aleatoriedad.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { crearApp } from '../src/app';
import { enviarPlanillaASap } from '../src/services/sap.service';
import { obtenerPrisma } from '../src/utils/prisma';
import { errorSapNoDisponible } from '../src/types/errores';

vi.mock('../src/services/sap.service', () => ({
  enviarPlanillaASap: vi.fn(),
}));

vi.mock('../src/utils/prisma', () => ({
  obtenerPrisma: vi.fn(),
  cerrarPrisma: vi.fn(),
}));

/** Fila de `Planillas` en memoria: el "estado de la base" del doble. */
interface FilaPlanilla {
  planillaId: bigint;
  periodo: string;
  estado: string;
  referenciaSap: string | null;
  enviadaSapEn: Date | null;
}

/** Argumentos que el service pasa a `planilla.updateMany` (el guard atomico). */
interface ArgsUpdateMany {
  where: { planillaId: bigint; estado: string };
  data: { estado: string; referenciaSap: string; enviadaSapEn: Date };
}

/**
 * Doble de Prisma. Solo los delegates que toca `planillas.service`:
 * `findUnique` (lectura) y `updateMany` (escritura condicional). `update` se
 * declara para afirmar que el service NUNCA lo usa (ADVERTENCIA 2).
 */
const prismaDoble = {
  planilla: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
};

/** Referencia SAP que el doble devuelve en el camino feliz. */
const REF_SAP = 'SAP-TEST-0001';
/** Formato ISO8601 que exige el contrato para `enviadaSapEn`. */
const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Estado en memoria: solo cambia si el guard de `updateMany` casa. */
let almacen: { planilla: FilaPlanilla | null };

const app = crearApp();

beforeEach(() => {
  vi.resetAllMocks();
  // Los ErrorAplicacion con `logDetalle` (422/502/500) se loguean con
  // console.error; se silencian aqui para que la salida del suite sea limpia.
  vi.spyOn(console, 'error').mockImplementation(() => {});

  vi.mocked(obtenerPrisma).mockReturnValue(prismaDoble as never);
  vi.mocked(enviarPlanillaASap).mockResolvedValue(REF_SAP);

  almacen = {
    planilla: {
      planillaId: 1n,
      periodo: '2026-06',
      estado: 'Aprobada',
      referenciaSap: null,
      enviadaSapEn: null,
    },
  };

  // Lectura: la fila existe solo si el id coincide (el service ya valida el
  // id con isInt({ min: 1 }) antes de llegar aqui).
  prismaDoble.planilla.findUnique.mockImplementation(
    async (args: { where: { planillaId: bigint } }) => {
      const fila = almacen.planilla;
      if (!fila || fila.planillaId !== args.where.planillaId) {
        return null;
      }
      return { ...fila };
    },
  );

  // Escritura atomica: replica el guard real `where: { planillaId, estado }`.
  // Si no casa, devuelve count 0 SIN tocar el almacen (carrera perdida).
  prismaDoble.planilla.updateMany.mockImplementation(async (args: ArgsUpdateMany) => {
    const fila = almacen.planilla;
    if (!fila || fila.planillaId !== args.where.planillaId || fila.estado !== args.where.estado) {
      return { count: 0 };
    }
    fila.estado = args.data.estado;
    fila.referenciaSap = args.data.referenciaSap;
    fila.enviadaSapEn = args.data.enviadaSapEn;
    return { count: 1 };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/planillas/:id/enviar-sap — camino feliz', () => {
  // Mapa HTTP (fila enviar-sap): 200 -> `{ planillaId, estado:
  // "EnviadaSAP", referenciaSap, enviadaSapEn }`. Supuesto 6: SAP primero,
  // despues la escritura condicional `updateMany` con estado 'Aprobada'.
  it('Aprobada + SAP ok + count 1 -> 200, estado "EnviadaSAP" y guard where estado=Aprobada', async () => {
    const res = await request(app).post('/api/planillas/1/enviar-sap').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        planillaId: '1',
        estado: 'EnviadaSAP',
        referenciaSap: REF_SAP,
        enviadaSapEn: expect.stringMatching(ISO8601),
      },
    });

    // El guard es EXACTAMENTE este: updateMany condicional sobre
    // `estado: 'Aprobada'` + data con la referencia y el timestamp.
    expect(prismaDoble.planilla.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaDoble.planilla.updateMany).toHaveBeenCalledWith({
      where: { planillaId: 1n, estado: 'Aprobada' },
      data: { estado: 'EnviadaSAP', referenciaSap: REF_SAP, enviadaSapEn: expect.any(Date) },
    });

    // ADVERTENCIA 2 (planillas.service): el guard obliga `updateMany`;
    // `update()` no acepta `estado` en el where y jamas debe usarse.
    expect(prismaDoble.planilla.update).not.toHaveBeenCalled();

    // El id viaja como BigInt a Prisma y se serializa con .toString().
    expect(prismaDoble.planilla.findUnique).toHaveBeenCalledWith({
      where: { planillaId: 1n },
    });

    // El estado del "sistema" (almacen) quedo en EnviadaSAP: la escritura
    // ocurrio de verdad y con la referencia de ESTA peticion.
    expect(almacen.planilla?.estado).toBe('EnviadaSAP');
    expect(almacen.planilla?.referenciaSap).toBe(REF_SAP);
    expect(almacen.planilla?.enviadaSapEn).toBeInstanceOf(Date);
  });

  // Item 9 del alcance: `JSON.stringify` lanza `TypeError: Do not know how
  // to serialize a BigInt` con un BigInt crudo. Si eso
  // pasara, el handler caeria en 500; aqui se afirma 200 + JSON parseable.
  it('la respuesta 200 serializa los ids BigInt como string (sin TypeError de serializacion)', async () => {
    const res = await request(app).post('/api/planillas/1/enviar-sap').send({});

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Do not know how to serialize a BigInt');
    expect(typeof res.body.data.planillaId).toBe('string');

    const cuerpo = JSON.parse(res.text) as { data: { planillaId: string; estado: string } };
    expect(cuerpo.data.planillaId).toBe('1');
    expect(cuerpo.data.estado).toBe('EnviadaSAP');
  });

  // Item 10 del alcance: orden OBLIGATORIO lectura -> SAP -> escritura
  // (supuesto 6 del contrato: "SAP se llama antes de escribir estado").
  // Se verifica con `invocationCallOrder` de los mocks, sin sleeps.
  it('orden obligatorio: lectura -> SAP -> escritura (SAP ANTES del write)', async () => {
    const res = await request(app).post('/api/planillas/1/enviar-sap').send({});

    expect(res.status).toBe(200);
    expect(enviarPlanillaASap).toHaveBeenCalledTimes(1);
    expect(prismaDoble.planilla.updateMany).toHaveBeenCalledTimes(1);

    const ordenLectura = prismaDoble.planilla.findUnique.mock.invocationCallOrder[0];
    const ordenSap = vi.mocked(enviarPlanillaASap).mock.invocationCallOrder[0];
    const ordenEscritura = prismaDoble.planilla.updateMany.mock.invocationCallOrder[0];

    expect(ordenLectura).toBeDefined();
    expect(ordenSap).toBeDefined();
    expect(ordenEscritura).toBeDefined();
    expect(ordenLectura).toBeLessThan(ordenSap);
    expect(ordenSap).toBeLessThan(ordenEscritura);
  });
});

describe('POST /api/planillas/:id/enviar-sap — 409 doble envio / guard', () => {
  // Item 3 del alcance + mapa HTTP (409: doble envio concurrente /
  // updateMany count === 0). Se programa el caso carrera: el updateMany
  // devuelve count 0 (otra peticion gano) y hay que probar que NO hubo
  // cambio de estado en el almacen.
  it('updateMany count 0 (carrera perdida) -> 409 y SIN cambio de estado', async () => {
    prismaDoble.planilla.updateMany.mockResolvedValue({ count: 0 });
    const antes = { ...almacen.planilla };

    const res = await request(app).post('/api/planillas/1/enviar-sap').send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { codigo: 'CONFLICTO_ENVIO', mensaje: expect.any(String) },
    });

    // El perdedor intento UNA escritura con el guard correcto y escribio 0
    // filas: el estado del sistema queda exactamente igual (sin referencia,
    // sin timestamp) — el 409 no corrompe nada.
    expect(prismaDoble.planilla.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaDoble.planilla.updateMany).toHaveBeenCalledWith({
      where: { planillaId: 1n, estado: 'Aprobada' },
      data: { estado: 'EnviadaSAP', referenciaSap: REF_SAP, enviadaSapEn: expect.any(Date) },
    });
    expect(almacen.planilla).toEqual(antes);
    expect(almacen.planilla?.estado).toBe('Aprobada');
    expect(almacen.planilla?.referenciaSap).toBeNull();
    expect(almacen.planilla?.enviadaSapEn).toBeNull();

    // Supuesto 6: SAP se llamo ANTES del intento de escritura; el fallo es
    // del guard, no del downstream.
    expect(enviarPlanillaASap).toHaveBeenCalledTimes(1);
  });

  // Mapa HTTP (409): la planilla ya esta en 'EnviadaSAP' al leerla =
  // doble envio. El frontend debe recargar, no reintentar: y SIN gastar una
  // llamada SAP nueva ni tocar la fila.
  it('ya EnviadaSAP -> 409 sin llamar a SAP ni escribir', async () => {
    almacen.planilla.estado = 'EnviadaSAP';
    almacen.planilla.referenciaSap = 'SAP-ANTERIOR';
    const antes = { ...almacen.planilla };

    const res = await request(app).post('/api/planillas/1/enviar-sap').send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { codigo: 'CONFLICTO_ENVIO', mensaje: expect.any(String) },
    });
    expect(enviarPlanillaASap).not.toHaveBeenCalled();
    expect(prismaDoble.planilla.updateMany).not.toHaveBeenCalled();
    expect(almacen.planilla).toEqual(antes);
    expect(almacen.planilla?.referenciaSap).toBe('SAP-ANTERIOR');
  });
});

describe('POST /api/planillas/:id/enviar-sap — 400 transicion invalida', () => {
  // Mapa HTTP (400: estado 'Borrador' = transicion invalida). Solo se
  // envia a SAP desde 'Aprobada'; ni SAP ni escritura deben ejecutarse.
  it('Borrador -> 400 TRANSICION_INVALIDA sin llamar a SAP ni escribir', async () => {
    almacen.planilla.estado = 'Borrador';

    const res = await request(app).post('/api/planillas/1/enviar-sap').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { codigo: 'TRANSICION_INVALIDA', mensaje: expect.any(String) },
    });
    expect(enviarPlanillaASap).not.toHaveBeenCalled();
    expect(prismaDoble.planilla.updateMany).not.toHaveBeenCalled();
    expect(almacen.planilla?.estado).toBe('Borrador');
  });
});

describe('POST /api/planillas/:id/enviar-sap — 404 inexistente', () => {
  // Mapa HTTP (404: planilla no existe). La lectura corta el flujo antes
  // de gastar la llamada SAP.
  it('id inexistente (999) -> 404 PLANILLA_NO_ENCONTRADA sin llamar a SAP', async () => {
    const res = await request(app).post('/api/planillas/999/enviar-sap').send({});

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { codigo: 'PLANILLA_NO_ENCONTRADA', mensaje: expect.any(String) },
    });
    expect(prismaDoble.planilla.findUnique).toHaveBeenCalledWith({
      where: { planillaId: 999n },
    });
    expect(enviarPlanillaASap).not.toHaveBeenCalled();
    expect(prismaDoble.planilla.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/planillas/:id/enviar-sap — 422 id invalido', () => {
  // Item 7 del alcance + mapa HTTP (422: fallo express-validator; ids
  // validados con isInt({ min: 1 }), NUNCA isUUID). La validacion
  // corta ANTES del controller: Prisma ni se entera.
  it("id no entero ('abc') -> 422 con lista de errores de validacion", async () => {
    const res = await request(app).post('/api/planillas/abc/enviar-sap').send({});

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { codigo: 'VALIDACION_FALLIDA', mensaje: expect.stringContaining('id:') },
    });

    // El contrato fija UN sobre de error de dos claves: la lista de campos
    // invalidos viaja plegada dentro de `mensaje` (src/middleware/validar.ts),
    // no como un campo `errors` aparte. Aqui se reconstruye esa lista.
    const errores = String(res.body.error.mensaje).split('; ');
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.some((detalle) => detalle.includes('id:'))).toBe(true);

    expect(obtenerPrisma).not.toHaveBeenCalled();
    expect(enviarPlanillaASap).not.toHaveBeenCalled();
  });

  // id 0 no es un entero positivo >= 1 -> entrada invalida,
  // 422 (nunca 404: no se llega a consultar la base).
  it('id 0 -> 422 VALIDACION_FALLIDA sin tocar Prisma', async () => {
    const res = await request(app).post('/api/planillas/0/enviar-sap').send({});

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { codigo: 'VALIDACION_FALLIDA', mensaje: expect.stringContaining('id:') },
    });
    expect(obtenerPrisma).not.toHaveBeenCalled();
  });
});

describe('POST /api/planillas/:id/enviar-sap — 502 SAP caido', () => {
  // Item 8 del alcance + mapa HTTP (502: SAP falla / downstream): si
  // SAP falla, la planilla permanece en 'Aprobada' para
  // que el reintento sea idempotente. La escritura NUNCA se intenta.
  it('SAP rechaza -> 502 SAP_NO_DISPONIBLE y la planilla sigue en Aprobada', async () => {
    vi.mocked(enviarPlanillaASap).mockRejectedValue(
      errorSapNoDisponible('Timeout del SAP simulado en la prueba.'),
    );

    const res = await request(app).post('/api/planillas/1/enviar-sap').send({});

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: { codigo: 'SAP_NO_DISPONIBLE', mensaje: expect.any(String) },
    });

    // Sin escritura: el flujo se corto en el paso SAP.
    expect(prismaDoble.planilla.updateMany).not.toHaveBeenCalled();
    expect(prismaDoble.planilla.update).not.toHaveBeenCalled();

    // Estado intacto = reintento seguro (el 502 jamas deja un fantasma
    // 'EnviadaSAP').
    expect(almacen.planilla?.estado).toBe('Aprobada');
    expect(almacen.planilla?.referenciaSap).toBeNull();
    expect(almacen.planilla?.enviadaSapEn).toBeNull();

    // El detalle del fallo (logDetalle) se loguea y NO se filtra al cliente.
    expect(res.text).not.toContain('Timeout del SAP simulado en la prueba.');
  });
});

describe('POST /api/planillas/:id/enviar-sap — 500 error interno', () => {
  // Mapa HTTP (500: error interno, logueado, NO filtrado). Un rechazo que
  // no es ErrorAplicacion (p. ej. fallo del motor) llega al manejador de
  // errores generico: sobre único, detalle solo en el log.
  it('error inesperado (no ErrorAplicacion) -> 500 sin filtrar el detalle', async () => {
    prismaDoble.planilla.findUnique.mockRejectedValue(
      new Error('detalle-secreto-del-motor'),
    );

    const res = await request(app).post('/api/planillas/1/enviar-sap').send({});

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { codigo: 'ERROR_INTERNO', mensaje: expect.any(String) },
    });
    // El mensaje del cliente NUNCA arrastra el detalle interno…
    expect(res.text).not.toContain('detalle-secreto-del-motor');
    // …pero si queda en el log del servidor.
    expect(vi.mocked(console.error)).toHaveBeenCalled();

    expect(enviarPlanillaASap).not.toHaveBeenCalled();
    expect(prismaDoble.planilla.updateMany).not.toHaveBeenCalled();
  });
});
