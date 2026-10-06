/**
 * QUDOX - Servicio de salud (CAPA DE LOGICA).
 *
 * ------------------------------------------------------------------
 * POR QUE NO SE CONSULTA LA BASE DE DATOS
 * ------------------------------------------------------------------
 * Un health check que pega a la base de datos se cae con ella y mezcla los
 * dos fallos: uno de la app y uno de la infraestructura, sin poder
 * distinguirlos. Este endpoint responde "el proceso Express esta vivo y
 * escuchando"; el estado de SQL Server se revisa por otra via.
 *
 * Hay DOS variantes, con dos clientes distintos:
 *
 *  - `comprobarSalud()`      -> `GET /health`      (contrato):
 *                               `{ status, timestamp }` dentro del sobre
 *                               `{ data }`, exactamente como lo fija el
 *                               contrato.
 *  - `comprobarSaludDetallada()` -> `GET /api/health` (requisito del
 *                               contrato tecnico): objeto
 *                               PLANO `{ status, uptime, timestamp }` sin
 *                               sobre, porque su consumidor (el chequeo
 *                               de proceso) lee los campos en la
 *                               raiz del cuerpo.
 *
 * El timestamp en ISO 8601 es lo que permite a un cliente ver que la
 * respuesta es fresca y no una cache. `uptime` son segundos de proceso con
 * decimales (`process.uptime()`), utiles para detectar reinicios.
 */

import type { EstadoSalud, EstadoSaludDetallado } from '../types/dominio';

/**
 * `GET /health` — comprobacion de vida del proceso (respuesta del contrato).
 *
 * Sincrona y sin I/O: no puede fallar por red ni por base de datos.
 */
export function comprobarSalud(): EstadoSalud {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

/**
 * `GET /api/health` — comprobacion de vida con uptime del proceso.
 *
 * @returns Objeto plano con `uptime` en segundos (valor con decimales del
 *          temporizador de proceso de Node).
 */
export function comprobarSaludDetallada(): EstadoSaludDetallado {
  return {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}
