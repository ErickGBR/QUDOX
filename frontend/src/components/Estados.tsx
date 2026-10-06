/**
 * Estados transversales de la pantalla: carga, error con reintento y vacío.
 *
 * Los tres son visual y semánticamente distintos (no solo de color):
 * - carga  → `role="status"`  (anuncio tranquilo para lectores de pantalla)
 * - error  → `role="alert"`   (interrumpe: hay un fallo y un reintento)
 * - vacío  → sin rol de alerta: no es un fallo, es "no hay filas"
 */

interface PropsIndicadorCarga {
  /** Texto concreto del que está cargando ("planilla", "movimientos"...). */
  texto: string
}

export function IndicadorCarga({ texto }: PropsIndicadorCarga) {
  return (
    <div className="estado estado--carga" role="status" aria-live="polite">
      <span className="estado__pulso" aria-hidden="true" />
      <p>{texto}</p>
    </div>
  )
}

interface PropsPanelError {
  mensaje: string
  onReintentar: () => void
  /** Título por defecto: "No se pudo cargar". */
  titulo?: string
  textoReintentar?: string
}

/**
 * Panel de error con affordance de reintento visible. El `mensaje` llega ya
 * en español desde la capa `api/` (o es el texto de red): aquí NO se inventa
 * texto genérico por encima de lo que dice el servidor.
 */
export function PanelError({
  mensaje,
  onReintentar,
  titulo = 'No se pudo cargar la información',
  textoReintentar = 'Reintentar',
}: PropsPanelError) {
  return (
    <div className="estado estado--error" role="alert">
      <p className="estado__titulo">{titulo}</p>
      <p className="estado__mensaje">{mensaje}</p>
      <button type="button" className="boton boton--secundario" onClick={onReintentar}>
        {textoReintentar}
      </button>
    </div>
  )
}

interface PropsEstadoVacio {
  detalle: string
  /** Título por defecto: "Sin movimientos". */
  titulo?: string
}

/** Estado vacío: no es un error, se distingue con su propio estilo. */
export function EstadoVacio({ detalle, titulo = 'Sin movimientos' }: PropsEstadoVacio) {
  return (
    <div className="estado estado--vacio">
      <p className="estado__titulo">{titulo}</p>
      <p className="estado__mensaje">{detalle}</p>
    </div>
  )
}
