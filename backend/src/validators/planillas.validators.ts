/**
 * QUDOX - Definiciones de validacion con express-validator.
 *
 * ------------------------------------------------------------------
 * TIPO DE ID: ENTERO POSITIVO (ya sin discrepancia)
 * ------------------------------------------------------------------
 * El schema (backend/prisma/schema.prisma) declara los ids como
 *
 *     empleadoId     BigInt @id @default(autoincrement()) @map("EmpleadoId")
 *     centroCostoId  BigInt @id @default(autoincrement()) @map("CentroCostoId")
 *
 * es decir IDENTITY de SQL Server: un entero autoincremental. El contrato
 * quedo alineado con esto y anota el query
 * param `centroCostoId?` como "(entero >= 1)", consistente con
 * `database/payroll.sql`. Tres fuentes, un mismo tipo.
 *
 * Por eso TODA la validacion de ids es `.isInt({ min: 1 })`: validar como
 * texto libre dejaria los endpoints abiertos a entradas que Prisma rechaza
 * al convertir a BigInt, y un id que no es un entero es entrada invalida.
 *
 * ------------------------------------------------------------------
 * POR QUE 422 Y NO 400
 * ------------------------------------------------------------------
 * El mapa HTTP del contrato reserva 400 para la transicion invalida
 * (planilla en 'Borrador') y 422 para el fallo de validacion de entrada.
 * Un id que no es un entero es entrada invalida, no un problema de estado.
 */

import { param, query } from 'express-validator';

/**
 * `:id` de los endpoints de planilla.
 * Se valida como entero positivo porque las PK son `BigInt` autoincrementales
 * (ver la nota de discrepancia al inicio de este archivo).
 * `.bail()` evita que se acumulen errores encadenados del mismo campo.
 */
export const validarIdPlanilla = [
  param('id')
    .exists({ values: 'falsy' })
    .withMessage('El id de la planilla es obligatorio.')
    .bail()
    .isInt({ min: 1, max: Number.MAX_SAFE_INTEGER })
    .withMessage('El id de la planilla debe ser un entero positivo.')
    .toInt(),
];

/**
 * `?centroCostoId=` — query param OPCIONAL.
 *
 * `optional({ values: 'falsy' })` trata como AUSENTE tanto el parametro que
 * no viene como el que viene vacio (`?centroCostoId=`), que es justo la
 * semantica que pide el contrato: "omitido o vacio significa todos".
 * Sin esto, el cliente que limpiase el filtro mandaria `?centroCostoId=` y
 * recibiria un 422 en vez de la lista completa.
 */
export const validarCentroCostoIdOpcional = [
  query('centroCostoId')
    .optional({ values: 'falsy' })
    .bail()
    .isInt({ min: 1, max: Number.MAX_SAFE_INTEGER })
    .withMessage('El centroCostoId debe ser un entero positivo.')
    .toInt(),
];

/**
 * Body de `POST /api/planillas/:id/enviar-sap`.
 *
 * El contrato define el body como `{}` (vacio) a proposito: la transicion
 * de estado no recibe parametros. NO se anaden reglas de validacion de body
 * porque ninguna regla podria fallar, y reglas que nunca fallan son ruido.
 */