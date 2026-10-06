/**
 * QUDOX - Construccion de la app Express.
 *
 * ------------------------------------------------------------------
 * POR QUE app.ts Y server.ts ESTAN SEPARADOS
 * ------------------------------------------------------------------
 * `app.ts` exporta la app SIN.listen(): describe QUE rutas existen.
 * `server.ts` hace listen(): describe COMO se arranca el proceso.
 * La separacion permite montar la misma app en otro contexto sin arrancar un
 * puerto por accidente.
 *
 * ------------------------------------------------------------------
 * EL ORDEN DE app.use() ES OBLIGATORIO
 * ------------------------------------------------------------------
 *   1. middlewares generales  (cors, parser de JSON)
 *   2. rutas
 *   3. 404 de ruta
 *   4. manejador de errores   <-- SIEMPRE el ULTIMO
 *
 * El manejador de errores va al final porque Express los evalua en orden: si
 * se registrara antes, las rutas despues nunca alcanzarian su `catch`. Y debe
 * tener 4 parametros (ver src/middleware/errores.ts).
 */

import cors from 'cors';
import express, { type Express } from 'express';
import { manejadorErrores, noEncontrado } from './middleware/errores';
import rutas from './routes';

/**
 * Origenes permitidos por CORS.
 *
 * NO se usa `cors()` a secas porque equivale a `Access-Control-Allow-Origin: *`
 * y permite cualquier origen: sirve para una demo, pero es justo lo que una
 * auditoria de seguridad rechaza. Aqui se lista el origen de desarrollo (el dev
 * server de Vite corre en 5173 y su preview en 4173) y nada mas.
 *
 * Para exponer la API en otro dominio hay que ampliar esta lista y anotarlo
 * en el README; no se resuelve entrando `*`.
 */
const ORIGENES_PERMITIDOS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export function crearApp(): Express {
  const app = express();

  // Sin esto, el frontend de Vite (puerto 5173) no podria leer las respuestas
  // del backend (puerto 3000): el navegador las bloquea por same-origin.
  app.use(cors({ origin: ORIGENES_PERMITIDOS }));

  // Parser de JSON. El limite de 100 kb es una medida deliberada: este cuerpo
  // es `{}` en los cinco endpoints, asi que cualquier cosa mayor es un ataque
  // o un error, y no hay caso legitimo que lo necesite.
  app.use(express.json({ limit: '100kb' }));

  // 1) Rutas (mapa de la API).
  app.use(rutas);

  // 2) 404 de ruta: ninguna ruta anterior respondio.
  app.use(noEncontrado);

  // 3) Manejador de errores: ULTIMO de todos.
  app.use(manejadorErrores);

  return app;
}

export default crearApp;