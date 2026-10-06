/**
 * QUDOX - Servicio de planillas (CAPA DE LOGICA).
 *
 * ------------------------------------------------------------------
 * DONDE VIVE LA LOGICA Y POR QUE
 * ------------------------------------------------------------------
 * El controller no habla con Prisma: traduce HTTP <-> dominio. El service
 * habla con Prisma y conoce el estado de la planilla. Asi el orden
 * SAP-primero y el guard atomico se pueden razonar (y auditar) en un solo
 * archivo, sin saltos entre capas.
 *
 * ------------------------------------------------------------------
 * ADVERTENCIA 1 — EL CENTRO DE COSTO NO ESTA EN EL DETALLE
 * ------------------------------------------------------------------
 * `PlanillaDetalle` NO tiene columna `CentroCostoId` (correccion).
 * El centro de costo de un movimiento se alcanza
 * navegando `detalle.empleado.centroCosto`. El filtro `centroCostoId` se
 * aplica sobre `empleado.centroCostoId`, NUNCA sobre un campo inexistente
 * en el detalle. Escribir `where: { centroCostoId: ... }` sobre
 * PlanillaDetalle no compila y, si se "arreglara" denormalizando la
 * columna, se crearia una segunda fuente de verdad que puede divergir del
 * empleado.
 *
 * ------------------------------------------------------------------
 * ADVERTENCIA 2 — EL GUARD ATOMICO OBLIGA A `updateMany`
 * ------------------------------------------------------------------
 * `prisma.planilla.update()` NO admite `estado` en su `where`: Prisma solo
 * acepta alli la clave primaria o un campo `@unique`, y `estado` no lo es.
 * El `update({ where: { planillaId }, data: { estado } })` ingenuo SI
 * compila, SI pasa la prueba manual y SI tiene la condicion de carrera: dos
 * peticiones concurrentes leen 'Aprobada' y las dos escriben. La escritura
 * atomica condicional exige `updateMany` + guard de `count` (ver
 * `registrarEnvioSap`).
 *
 * ------------------------------------------------------------------
 * SERIALIZACION DE BigInt (regla del contrato, ver tambien respuestas.ts)
 * ------------------------------------------------------------------
 * Los ids son `BigInt` (IDENTITY de SQL Server). `JSON.stringify` LANZA
 * `TypeError: Do not know how to serialize a BigInt` con un BigInt crudo,
 * por eso AQUI se mapea cada fila al tipo de dominio con `id.toString()`,
 * y `enviarDatos` (src/utils/respuestas.ts) ademas aplica un replacer de
 * seguridad sobre todo el arbol.
 */

import type {
  EstadoPlanilla,
  Movimiento,
  PlanillaCabecera,
  ResultadoEnvioSap,
  TipoMovimiento,
} from '../types/dominio';
import {
  CODIGOS_ERROR,
  ErrorAplicacion,
  errorConflictoEnvio,
  errorPlanillaNoEncontrada,
  errorTransicionInvalida,
} from '../types/errores';
import { obtenerPrisma } from '../utils/prisma';
import { enviarPlanillaASap } from './sap.service';

/**
 * Normaliza el `estado` leido de la base al dominio de la API.
 *
 * El DDL garantiza con `CHECK (Estado IN ('Borrador','Aprobada','EnviadaSAP'))`
 * que solo pueden aparecer esos tres valores; esta funcion es la defensa en
 * profundidad por si esa garantia se pierde (dato migrado, mano en SQL).
 * Ante un valor desconocido la respuesta es 500 con el detalle en el log,
 * nunca un estado inventado en la respuesta.
 */
function normalizarEstado(estado: string): EstadoPlanilla {
  if (estado === 'Borrador' || estado === 'Aprobada' || estado === 'EnviadaSAP') {
    return estado;
  }
  throw new ErrorAplicacion(
    CODIGOS_ERROR.ERROR_INTERNO,
    500,
    'La planilla tiene un estado desconocido.',
    `Estado inesperado en Planillas: ${JSON.stringify(estado)}`,
  );
}

/**
 * `GET /api/planillas/:id` — cabecera con totales informativos.
 *
 * @param planillaId Entero ya validado por express-validator (`isInt({min:1})`).
 *        Prisma espera `BigInt` para la PK, de ahi el `BigInt(planillaId)`.
 * @returns Cabecera con los totales agregados con `SUM()` del motor (no con
 *          un reduce en JS: el backend no hace aritmetica contable con floats).
 * @throws {ErrorAplicacion} 404 `PLANILLA_NO_ENCONTRADA` si no existe.
 */
export async function obtenerPlanilla(planillaId: number): Promise<PlanillaCabecera> {
  // Cliente singleton: NUNCA hacer `new PrismaClient()` aqui.
  const prisma = obtenerPrisma();
  const id = BigInt(planillaId);

  const planilla = await prisma.planilla.findUnique({ where: { planillaId: id } });
  if (!planilla) {
    throw errorPlanillaNoEncontrada(String(planillaId));
  }

  // Dos agregados en paralelo, ambos cubiertos por IX_PlanillaDetalle_PlanillaId_Tipo.
  const [debitos, creditos] = await Promise.all([
    prisma.planillaDetalle.aggregate({ where: { planillaId: id, tipo: 'D' }, _sum: { monto: true } }),
    prisma.planillaDetalle.aggregate({ where: { planillaId: id, tipo: 'C' }, _sum: { monto: true } }),
  ]);

  return {
    planillaId: planilla.planillaId.toString(),
    periodo: planilla.periodo,
    estado: normalizarEstado(planilla.estado),
    // TRAMPA: `_sum` es `null` cuando no hay filas (planilla sin detalles).
    // `?? 0` lo normaliza; sin eso el total desapareceria del JSON en vez
    // de ser 0. `Number(...)` convierte el Decimal(18,2) al number del API
    // (rango exacto hasta 2^53; un total de nomina no lo alcanza).
    totalDebitos: Number(debitos._sum.monto ?? 0),
    totalCreditos: Number(creditos._sum.monto ?? 0),
    // Diagnosticos del incidente (supuesto 8): null hasta que se envia a SAP.
    referenciaSap: planilla.referenciaSap,
    enviadaSapEn: planilla.enviadaSapEn?.toISOString() ?? null,
  };
}

/**
 * `GET /api/planillas/:id/movimientos?centroCostoId=` — detalle de la planilla.
 *
 * @param planillaId    Entero ya validado.
 * @param centroCostoId Opcional. `undefined` (param omitido o vacio) =
 *                      todos los movimientos. Ver ADVERTENCIA 1: el filtro
 *                      se aplica sobre `empleado.centroCostoId`.
 * @returns Movimientos ordenados por `detalleId` ascendente (orden estable:
 *          el frontend hace un `reduce` sobre este mismo array).
 * @throws {ErrorAplicacion} 404 si la planilla no existe. NO se devuelve un
 *         `[]` con 200: seria indistinguible de "planilla sin movimientos".
 */
export async function obtenerMovimientos(
  planillaId: number,
  centroCostoId?: number,
): Promise<Movimiento[]> {
  const prisma = obtenerPrisma();
  const id = BigInt(planillaId);

  const planilla = await prisma.planilla.findUnique({
    where: { planillaId: id },
    select: { planillaId: true },
  });
  if (!planilla) {
    throw errorPlanillaNoEncontrada(String(planillaId));
  }

  const filas = await prisma.planillaDetalle.findMany({
    where: {
      planillaId: id,
      // Filtro sobre la RELACION (empleado -> centroCostoId), jamas sobre
      // una columna del detalle: PlanillaDetalle no la tiene (ADVERTENCIA 1).
      ...(centroCostoId !== undefined && {
        empleado: { centroCostoId: BigInt(centroCostoId) },
      }),
    },
    // Travesia obligatoria: detalle -> empleado -> centroCosto (el detalle
    // no tiene columna propia de centro de costo).
    include: { empleado: { include: { centroCosto: true } } },
    orderBy: { detalleId: 'asc' },
  });

  return filas.map((fila): Movimiento => {
    const tipo = fila.tipo;
    if (tipo !== 'D' && tipo !== 'C') {
      // Defensa en profundidad: el CHECK del DDL lo impide, pero un tipo
      // desconocido aqui romperia el union del frontend. 500 + log.
      throw new ErrorAplicacion(
        CODIGOS_ERROR.ERROR_INTERNO,
        500,
        'Un movimiento tiene un tipo desconocido.',
        `Tipo inesperado en PlanillaDetalle: ${JSON.stringify(tipo)}`,
      );
    }
    const tipoMovimiento: TipoMovimiento = tipo;

    return {
      detalleId: fila.detalleId.toString(),
      empleadoId: fila.empleado.empleadoId.toString(),
      empleadoNombre: fila.empleado.nombre,
      // Viene de Empleados.CentroCostoId (unica fuente de verdad).
      centroCostoId: fila.empleado.centroCostoId.toString(),
      centroCostoNombre: fila.empleado.centroCosto.nombre,
      concepto: fila.concepto,
      monto: Number(fila.monto),
      tipo: tipoMovimiento,
    };
  });
}

/**
 * `POST /api/planillas/:id/enviar-sap` — transicion -> 'EnviadaSAP'.
 *
 * ORDEN OBLIGATORIO (constraint del contrato):
 *
 *   1. LEER la planilla          -> no existe: 404.
 *   2. Validar estado            -> 'EnviadaSAP': 409 (estado en conflicto /
 *                                   doble envio). Distinto de 'Aprobada'
 *                                   (p. ej. 'Borrador'): 400 (transicion
 *                                   invalida).
 *   3. Llamar al mock de SAP     -> FUERA de cualquier transaccion de Prisma.
 *                                   Falla: 502 y la planilla sigue en
 *                                   'Aprobada' (el reintento es idempotente).
 *   4. `updateMany` condicional  -> where: { planillaId, estado: 'Aprobada' },
 *                                   data: { estado: 'EnviadaSAP', ... }.
 *                                   `count === 0` -> 409: otra peticion gano
 *                                   la carrera entre el paso 2 y este.
 *
 * Por que SAP primero: si se escribiera el estado primero y el proceso
 * muriera antes de llamar a SAP, quedaria un 'EnviadaSAP' fantasma — una
 * mentira silenciosa que exige deteccion humana. Con SAP primero el peor
 * caso es que la planilla se quede en 'Aprobada', que se cura solo.
 *
 * Por que NO se usa `prisma.update()`: no acepta `estado` en el `where`
 * (solo PK o `@unique`) — ver ADVERTENCIA 2.
 *
 * @returns Resultado ya con `estado: 'EnviadaSAP'`, la referencia y el
 *          timestamp. Compuestos con los valores locales de ESTA peticion:
 *          si `count === 1` esta peticion es la unica que escribio, asi que
 *          releer la fila no podria devolver nada distinto.
 */
export async function registrarEnvioSap(planillaId: number): Promise<ResultadoEnvioSap> {
  const prisma = obtenerPrisma();
  const id = BigInt(planillaId);

  // --- 1) Lectura y validacion de estado (ANTES de gastar la llamada SAP) ---
  const planilla = await prisma.planilla.findUnique({ where: { planillaId: id } });
  if (!planilla) {
    throw errorPlanillaNoEncontrada(String(planillaId));
  }

  if (planilla.estado === 'EnviadaSAP') {
    // Ya fue enviada: estado en conflicto con el envio pedido. 409 (el
    // frontend pide "recargar", no "reintentar").
    throw errorConflictoEnvio();
  }
  if (planilla.estado !== 'Aprobada') {
    // 'Borrador' (y, defensivamente, cualquier estado desconocido que el
    // CHECK deberia impedir): transicion invalida -> 400.
    throw errorTransicionInvalida(planilla.estado);
  }

  // --- 2) SAP PRIMERO, fuera de toda transaccion Prisma ---
  // Si falla lanza 502 y el flujo se corta aqui: la planilla permanece en
  // 'Aprobada' y el usuario puede reintentar sin riesgo de doble envio.
  const referenciaSap = await enviarPlanillaASap();
  const enviadaSapEn = new Date();

  // --- 3) Escritura atomica condicional (el "transaccion" del contrato) ---
  // Un solo UPDATE condicional: atomico por definicion, sin $transaction
  // explicita necesaria. La condicion `estado: 'Aprobada'` en el where es
  // el guard: quien pierde la carrera escribe 0 filas.
  const resultado = await prisma.planilla.updateMany({
    where: { planillaId: id, estado: 'Aprobada' },
    data: { estado: 'EnviadaSAP', referenciaSap, enviadaSapEn },
  });

  if (resultado.count === 0) {
    // Otra peticion gano la carrera entre la lectura y este UPDATE.
    // La planilla ya esta 'EnviadaSAP' (la gano otra), asi que el estado
    // del sistema es consistente; solo esta peticion no puede reclamarlo.
    throw errorConflictoEnvio();
  }

  return {
    planillaId: planilla.planillaId.toString(),
    estado: 'EnviadaSAP',
    referenciaSap,
    enviadaSapEn: enviadaSapEn.toISOString(),
  };
}
