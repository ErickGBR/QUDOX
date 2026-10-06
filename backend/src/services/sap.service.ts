/**
 * QUDOX - Servicio SAP SIMULADO (CAPA DE LOGICA).
 *
 * ------------------------------------------------------------------
 * POR QUE UN ARCHIVO PROPIO Y NO UNA LLAMADA DENTRO DE planillas.service
 * ------------------------------------------------------------------
 * SAP es un sistema externo: es el unico punto de la app donde un fallo no
 * es culpa nuestra y donde el status HTTP de respuesta es 502 y no 500.
 * Aislarlo aqui deja el orden SAP-primero de `planillas.service` legible de
 * un vistazo y permite cambiar el mock sin tocar la logica de la transicion.
 *
 * El enunciado aclara que SAP esta SIMULADO: no hay credenciales ni endpoint
 * real, y por eso ningun secreto SAP aparece en .env.
 *
 * ------------------------------------------------------------------
 * COMO SE SIMULA EL FALLO (502) A MANO
 * ------------------------------------------------------------------
 * Con `SAP_SIMULAR_FALLO=true` en el entorno. Es deliberadamente una
 * variable de entorno y no un fallo aleatorio: un mock no deterministico
 * haria imposible demostrar el 502 y, peor, dejaria planillas en un estado
 * que nadie puede reproducir. Con la variable, el camino de fallo es
 * alcanzable, repetible y documentado (APAGAR la variable y reintentar
 * funciona: la planilla queda en 'Aprobada').
 */

import { errorSapNoDisponible } from '../types/errores';

/**
 * Correlativo interno del mock. Se incrementa en cada envio para que dos
 * referencias generadas en el mismo segundo no sean identicas.
 */
let correlativo = 0;

/**
 * Genera la referencia que "SAP" asigna al documento.
 *
 * Formato `SAP-YYYYMMDDHHMMSS-NNNN` (23 caracteres, bien dentro del
 * `VARCHAR(60)` de `Planillas.ReferenciaSap`): legible para un humano,
 * ordenable cronologicamente y unico dentro del proceso.
 *
 * @returns Referencia SAP simulada.
 */
function generarReferenciaSap(): string {
  correlativo += 1;
  const sello = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `SAP-${sello}-${String(correlativo).padStart(4, '0')}`;
}

/**
 * Simula el envio de una planilla al SAP.
 *
 * @returns La referencia asignada por el SAP simulado (nunca vacia).
 * @throws {ErrorAplicacion} 502 `SAP_NO_DISPONIBLE` si el fallo esta
 *         simulado con `SAP_SIMULAR_FALLO=true` o si el mock falla por una
 *         causa inesperada. La planilla debe quedarse en 'Aprobada' para
 *         que el reintento sea idempotente (constraint del contrato).
 */
export async function enviarPlanillaASap(): Promise<string> {
  // Sin latencia artificial: el mock es instantaneo a proposito para que la
  // verificacion manual no dependa de timeouts. La latencia real la pone el
  // SAP de produccion, cuyo cliente vivira detras de esta misma firma.
  if (process.env.SAP_SIMULAR_FALLO === 'true') {
    throw errorSapNoDisponible('Fallo simulado mediante SAP_SIMULAR_FALLO=true.');
  }

  try {
    return generarReferenciaSap();
  } catch (error) {
    // Cualquier error inesperado del mock es downstream: 502, jamas 500.
    throw errorSapNoDisponible(
      `Error inesperado en el SAP simulado: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
