/**
 * QUDOX - Cliente Prisma compartido (instancia unica / singleton).
 *
 * ------------------------------------------------------------------
 * POR QUE ESTE ARCHIVO EXISTE Y NO UN `new PrismaClient()` POR ARCHIVO
 * ------------------------------------------------------------------
 * Cada `new PrismaClient()` abre su propio POOL DE CONEXIONES contra SQL
 * Server. Si dos archivos instancian el cliente, la app tiene dos pools, y
 * si el pool se creara por peticion HTTP, cada request abriria conexiones
 * nuevas y SQL Server acabaria rechazando el servidor.
 *
 * En desarrollo esto es PEOR, porque `tsx watch` reinicia el proceso Node en
 * cada guardado. Cada reinicio crea un cliente nuevo; si el anterior no se
 * cerro, sus conexiones quedan huerfanas y se acumulan hasta agotar el pool
 * del servidor. De ahi el cache en `globalThis` de abajo: es la unica forma
 * de que el pool sobreviva al hot-reload.
 *
 * ------------------------------------------------------------------
 * POR QUE LA CREACION ES PEREZOSA (dentro de una funcion)
 * ------------------------------------------------------------------
 * `obtenerPrisma()` construye el cliente la PRIMERA vez que se usa, no al
 * importar el modulo. Motivo practico: `@prisma/client` sin `prisma generate`
 * ejecutado lanza "@prisma/client did not initialize yet" en el momento de
 * instanciar. Con creacion perezosa el proceso arranca igual, `GET /health`
 * responde, y el error aparece solo cuando un endpoint realmente toca la
 * base de datos — en vez de tumbar todo el servidor al importar.
 *
 * ------------------------------------------------------------------
 * REGLA PARA EL AGENTE QUE IMPLEMENTE LA LOGICA (F2)
 * ------------------------------------------------------------------
 * Importar UNICAMENTE lo que existe sin generar:
 *   - `PrismaClient`  -> OK, compila antes y despues de `prisma generate`
 *   - `prisma.planilla.findUnique(...)` -> OK, compila (delegate en `any`)
 * En cambio `Prisma.Decimal`, `Prisma.PlanillaGetPayload` y
 * `Prisma.PlanillaDelegate` SOLO compilan DESPUES de `prisma generate`.
 * Por eso este archivo no importa el namespace `Prisma`.
 * Consecuencia: los ids son `BigInt` y hay que envolverlos
 * (`BigInt(id)`) antes de meterlos en un `where`.
 */

import { PrismaClient } from '@prisma/client';

/**
 * Cache del cliente en el ambito global de Node.
 * En desarrollo la recarga en caliente reevalua este modulo pero conserva
 * `globalThis`, y con el cache el pool NO se duplica.
 * En produccion el proceso corre una sola vez, asi que la rama nueva nunca
 * se toma.
 */
const simboloPrisma = Symbol.for('qudox.prisma');

type GlobalConPrisma = typeof globalThis & {
  [simboloPrisma]?: PrismaClient;
};

const globalConPrisma = globalThis as GlobalConPrisma;

/**
 * Devuelve la instancia unica del cliente Prisma, creandola en la primera
 * llamada. Todas las capas (services) deben obtener el cliente SIEMPRE por
 * aqui y nunca instanciarlo por su cuenta.
 *
 * @throws {Error} Si se usa antes de ejecutar `npx prisma generate`.
 */
export function obtenerPrisma(): PrismaClient {
  const existente = globalConPrisma[simboloPrisma];
  if (existente) {
    return existente;
  }

  try {
    const cliente = new PrismaClient({
      // Log de consultas solo en desarrollo: en producible inundaria la
      // consola con los DECIMAL(18,2) y el ruido tapa los errores reales.
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    globalConPrisma[simboloPrisma] = cliente;
    return cliente;
  } catch (error) {
    throw new Error(
      'No se pudo inicializar el cliente Prisma. Ejecuta "npx prisma generate" ' +
        'desde backend/ para generar los tipos a partir de prisma/schema.prisma. ' +
        `Detalle: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Cierra el pool de conexiones de forma ordenada al apagar el servidor
 * (lo invoca src/server.ts en el apagado ordenado). Sin esto, `npm start`
 * deja conexiones colgadas contra SQL Server.
 */
export async function cerrarPrisma(): Promise<void> {
  const cliente = globalConPrisma[simboloPrisma];
  if (cliente) {
    await cliente.$disconnect();
    delete globalConPrisma[simboloPrisma];
  }
}