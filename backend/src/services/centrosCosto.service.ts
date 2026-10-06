/**
 * QUDOX - Servicio de centros de costo (CAPA DE LOGICA).
 *
 * Alimenta el selector del filtro de la Parte 3. El listado es corto (unos
 * pocos centros), asi que no lleva paginacion.
 */

import type { CentroCosto } from '../types/dominio';
import { obtenerPrisma } from '../utils/prisma';

/**
 * `GET /api/centros-costo` — catalogo COMPLETO de centros de costo.
 *
 * No depende del filtro de la pantalla: es la fuente del desplegable, asi
 * que siempre se devuelve el catalogo entero, ordenado por nombre para que
 * el desplegable salga estable entre visitas.
 *
 * La PK es `BigInt` autoincremental, no un UUID (ver la nota de
 * discrepancia en src/validators/planillas.validators.ts): se serializa con
 * `toString()` porque `JSON.stringify` lanza con un BigInt crudo.
 */
export async function listarCentrosCosto(): Promise<CentroCosto[]> {
  const prisma = obtenerPrisma();

  const centros = await prisma.centroCosto.findMany({ orderBy: { nombre: 'asc' } });

  return centros.map((centro): CentroCosto => ({
    centroCostoId: centro.centroCostoId.toString(),
    nombre: centro.nombre,
  }));
}
