/**
 * QUDOX - Arranque del proceso (escucha el puerto y cierra ordenado).
 *
 * ------------------------------------------------------------------
 * VARIABLES DE ENTORNO QUE USA ESTE ARCHIVO
 * ------------------------------------------------------------------
 * El archivo `.env` y su plantilla `.env.example` son de otro agente; este
 * archivo solo las LEE, no las escribe. Los nombres esperados son:
 *
 *   PORT           puerto de escucha de Express   (por defecto 3000)
 *   DATABASE_URL   cadena de conexion que Prisma lee de prisma/schema.prisma
 *
 * `dotenv.config()` sin argumentos solo buscaria `.env` en el directorio desde
 * el que se arranca (`backend/`), pero la plantilla del repositorio vive en
 * la RAIZ. Por eso se pasan candidatos explicitos: `../../.env` cubre tanto
 * `src/` en desarrollo como `dist/` en produccion.
 */

import { resolve } from 'node:path';
import dotenv from 'dotenv';
import crearApp from './app';
import { cerrarPrisma } from './utils/prisma';

// La plantilla .env.example esta en la raiz del repositorio, un nivel por
// encima de backend/. Se cubren ambos puntos de entrada posibles.
dotenv.config({
  path: [resolve(__dirname, '../../.env'), resolve(__dirname, '../.env')],
});

const PUERTO_POR_DEFECTO = 3000;

/**
 * Lee el puerto de `PORT`. Se valida a entero y se recurre al valor por
 * defecto si viene vacio o no es un numero, para que un typo en el `.env`
 * no deje el proceso sin arrancar.
 */
function resolverPuerto(): number {
  const crudo = process.env.PORT;
  if (!crudo) {
    return PUERTO_POR_DEFECTO;
  }
  const puerto = Number.parseInt(crudo, 10);
  return Number.isNaN(puerto) ? PUERTO_POR_DEFECTO : puerto;
}

const app = crearApp();
const puerto = resolverPuerto();

const servidor = app.listen(puerto, () => {
  console.log(`[qudox] API escuchando en http://localhost:${puerto}`);
  console.log('[qudox] Rutas: GET /api/planillas/:id | GET /api/planillas/:id/movimientos');
  console.log('[qudox]        GET /api/centros-costo | POST /api/planillas/:id/enviar-sap');
  console.log('[qudox]        GET /health');

  // Aviso temprano: es mucho mas facil de diagnosticar que un fallo de Prisma
  // en la primera consulta de un endpoint. Se comprueba al arrancar, no al
  // vuelo, para que el aviso aparezca una vez y no en cada peticion.
  if (!process.env.DATABASE_URL) {
    console.warn(
      '[qudox] AVISO: falta DATABASE_URL. /health respondera, pero cualquier ' +
        'endpoint que consulte SQL Server fallara hasta que exista un .env con ' +
        'esa variable.',
    );
  }
});

/**
 * Apagado ordenado.
 *
 * Sin esto, Ctrl+C mataria el proceso dejando el pool de conexiones de Prisma
 * abierto y SQL Server acumularia conexiones muertas. Se deja de aceptar
 * conexiones nuevas, se espera a que terminen las que estan en vuelo y luego
 * se cierra el pool.
 */
function apagar(senal: NodeJS.Signals): void {
  console.log(`[qudox] Señal ${senal} recibida, cerrando...`);
  servidor.close(async () => {
    await cerrarPrisma();
    console.log('[qudox] Cerrado correctamente.');
    process.exit(0);
  });
}

process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);

/**
 * Rechazos de promesa sin manejar.
 *
 * Sin este manejador, Node 24 termina el proceso con una excepcion no
 * capturada. El motivo por el que se registra en vez de terminar es que en un
 * desarrollo con hot-reload es mas util ver el error y seguir que perder el
 * proceso; en produccion el error queda igualmente en el log.
 */
process.on('unhandledRejection', (motivo) => {
  console.error('[qudox] Promesa rechazada sin manejar:', motivo);
});

export default servidor;