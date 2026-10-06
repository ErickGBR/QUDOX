/**
 * QUDOX - Error de aplicacion (el unico tipo de error que el cliente ve).
 *
 * REGLA DE DISENO (la mas importante del backend):
 * ningun controller escribe a mano el sobre de error. Un controller o un
 * service lanza `ErrorAplicacion` y el middleware src/middleware/errores.ts
 * lo convierte en `{ "error": { "codigo": "...", "mensaje": "..." } }`.
 *
 * Asi el sobre unico se produce en UN solo lugar y es
 * imposible que un endpoint se desvie del contrato por un
 * `res.status(400).json(...)` olvidado.
 *
 * MAPA HTTP FIJO:
 *   404 planilla inexistente · 400 estado 'Borrador' (transicion invalida)
 *   422 fallo de express-validator · 409 doble envio / estado en conflicto
 *   502 SAP caido · 500 error interno (logueado, no filtrado)
 */

/** Codigos de error estables del contrato. El frontend puede ramificar sobre ellos. */
export const CODIGOS_ERROR = {
  /** 404 — la planilla no existe. */
  PLANILLA_NO_ENCONTRADA: 'PLANILLA_NO_ENCONTRADA',
  /** 400 — transicion invalida (la planilla esta en 'Borrador'). */
  TRANSICION_INVALIDA: 'TRANSICION_INVALIDA',
  /** 422 — fallo de validacion de express-validator. */
  VALIDACION_FALLIDA: 'VALIDACION_FALLIDA',
  /** 409 — doble envio concurrente, estado ya 'EnviadaSAP', o `updateMany` count === 0. */
  CONFLICTO_ENVIO: 'CONFLICTO_ENVIO',
  /** 502 — SAP (downstream) fallo. */
  SAP_NO_DISPONIBLE: 'SAP_NO_DISPONIBLE',
  /** 404 — la ruta no existe en la API. */
  RUTA_NO_ENCONTRADA: 'RUTA_NO_ENCONTRADA',
  /** 500 — error interno. Se loguea en el servidor y NUNCA se devuelve el detalle. */
  ERROR_INTERNO: 'ERROR_INTERNO',
} as const;

export type CodigoError = (typeof CODIGOS_ERROR)[keyof typeof CODIGOS_ERROR];

/**
 * Error controlado de la aplicacion.
 *
 * - `codigo`      -> viaja al cliente, es estable y parte del contrato.
 * - `mensaje`     -> viaja al cliente, en espanol y sin detalle interno.
 * - `logDetalle`  -> se loguea en el servidor pero NO se devuelve. Aqui es
 *                    donde vive la informacion de diagnostico (stack, causa).
 */
export class ErrorAplicacion extends Error {
  /** Codigo de negocio del error (viaja al cliente). */
  public readonly codigo: CodigoError | string;
  /** Codigo HTTP que el middleware debe responder. */
  public readonly status: number;
  /** Mensaje en espanol, apto para mostrar al cliente. */
  public readonly mensaje: string;
  /** Detalle solo para el log del servidor. Nunca se envia al cliente. */
  public readonly logDetalle?: string;

  constructor(
    codigo: CodigoError | string,
    status: number,
    mensaje: string,
    logDetalle?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorAplicacion';
    this.codigo = codigo;
    this.status = status;
    this.mensaje = mensaje;
    this.logDetalle = logDetalle;
    // Necesario en TS cuando se extiende Error y se compila a ES2022.
    Object.setPrototypeOf(this, ErrorAplicacion.prototype);
  }
}

/** Atajo: 404 planilla inexistente. */
export function errorPlanillaNoEncontrada(planillaId: string): ErrorAplicacion {
  return new ErrorAplicacion(
    CODIGOS_ERROR.PLANILLA_NO_ENCONTRADA,
    404,
    `La planilla ${planillaId} no existe.`,
  );
}

/**
 * Atajo: 400 transicion invalida.
 *
 * Se usa cuando la planilla NO esta en 'Aprobada' y tampoco en un estado
 * que signifique conflicto: tipicamente 'Borrador', que es el caso que el
 * mapa HTTP fija explicitamente bajo el 400.
 */
export function errorTransicionInvalida(estadoActual: string): ErrorAplicacion {
  return new ErrorAplicacion(
    CODIGOS_ERROR.TRANSICION_INVALIDA,
    400,
    `La transicion no es valida: la planilla esta en '${estadoActual}' y solo se envia a SAP desde 'Aprobada'.`,
  );
}

/**
 * Atajo: 409 conflicto de envio.
 *
 * Cubre los DOS caminos que el contrato agrupa bajo el 409:
 *  1. la planilla ya estaba en 'EnviadaSAP' al leerla (doble envio), y
 *  2. `updateMany` devolvio `count === 0` (otra peticion gano la carrera).
 * El mensaje pide recargar en vez de reintentar a ciegas, porque el estado
 * del sistema ya es correcto: solo esta peticion no puede reclamarlo.
 */
export function errorConflictoEnvio(): ErrorAplicacion {
  return new ErrorAplicacion(
    CODIGOS_ERROR.CONFLICTO_ENVIO,
    409,
    'La planilla ya fue enviada a SAP por otra peticion. Recargue para ver el estado actual.',
  );
}

/** Atajo: 502 SAP caido. El detalle va al log, nunca al cliente. */
export function errorSapNoDisponible(detalle: string): ErrorAplicacion {
  return new ErrorAplicacion(
    CODIGOS_ERROR.SAP_NO_DISPONIBLE,
    502,
    'El sistema SAP no respondio correctamente. La planilla sigue en su estado anterior; puede reintentar.',
    detalle,
  );
}
