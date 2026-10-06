/**
 * Escenario: cliente HTTP compartido — sobres `{ data }` / `{ error }`,
 * distinción de red y propagación de cancelaciones.
 *
 * Requisitos verificados:
 *  - "`cliente.ts`: `{error}` envelope → `ErrorDeApi` with correct status".
 *  - "`cliente.ts`: network failure → `ErrorDeRed`".
 *
 * CERO red: `fetch` se sustituye por un mock en cada caso (la guardia del setup
 * hace fallar cualquier llamada que se cuele sin mock).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorDeApi, ErrorDeRed, URL_BASE_API, pedir } from './cliente'

/** Respuesta HTTP simulada: `pedir` solo lee `ok`, `status` y `json()`. */
function respuestaSimulada(
  status: number,
  cuerpo: () => Promise<unknown>,
): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: cuerpo,
  })
}

function comoErrorDeApi(valor: unknown): ErrorDeApi {
  expect(valor).toBeInstanceOf(ErrorDeApi)
  return valor as ErrorDeApi
}

function comoErrorDeRed(valor: unknown): ErrorDeRed {
  expect(valor).toBeInstanceOf(ErrorDeRed)
  return valor as ErrorDeRed
}

/** Captura el error lanzado sin usar `any` ni engañar al tipado. */
async function errorDe(peticion: Promise<unknown>): Promise<unknown> {
  try {
    await peticion
  } catch (error: unknown) {
    return error
  }
  throw new Error('La petición debía fallar y resolvió igual.')
}

beforeEach(() => {
  // Vuelve a instalar la guardia de red en este archivo: cualquier `it` que no
  // stubkee `fetch` a propósito recibe el rechazo ruidoso de `setup.ts`.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('FETCH_SIN_MOCK_EN_TESTS'))),
  )
})

describe('pedir — sobre de error { error }', () => {
  it('409 con sobre → ErrorDeApi con status 409, el codigo y el MENSAJE del servidor', async () => {
    const mensajeDelServidor =
      'Otra petición ya envió esta planilla a SAP. Recargue para ver el estado actual.'
    const fetchMock = respuestaSimulada(409, () =>
      Promise.resolve({ error: { codigo: 'carrera_doble_envio', mensaje: mensajeDelServidor } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const error = comoErrorDeApi(
      await errorDe(
        pedir('/api/planillas/1/enviar-sap', { metodo: 'POST', cuerpo: '{}' }),
      ),
    )

    expect(error.status).toBe(409)
    expect(error.codigo).toBe('carrera_doble_envio')
    // El mensaje en español del servidor llega TAL CUAL: es lo que se pinta.
    expect(error.message).toBe(mensajeDelServidor)
    expect(error.name).toBe('ErrorDeApi')
  })

  it('409 SIN sobre (cuerpo no JSON) → mensaje por defecto en español, jamás un texto genérico', async () => {
    vi.stubGlobal(
      'fetch',
      respuestaSimulada(409, () => Promise.reject(new SyntaxError('no es JSON'))),
    )

    const error = comoErrorDeApi(await errorDe(pedir('/api/planillas/1')))

    expect(error.status).toBe(409)
    expect(error.message).toBe(
      'Otra petición ya envió esta planilla a SAP. Recargue para ver el estado actual.',
    )
  })

  it('status sin mensaje por defecto → texto de respaldo en español', async () => {
    vi.stubGlobal('fetch', respuestaSimulada(418, () => Promise.resolve(null)))

    const error = comoErrorDeApi(await errorDe(pedir('/api/tetera')))

    expect(error.status).toBe(418)
    expect(error.message).toBe('Error inesperado del servidor.')
  })

  it('2xx que aún así trae sobre de error → ErrorDeApi (defensivo, nunca devuelve datos rotos)', async () => {
    vi.stubGlobal(
      'fetch',
      respuestaSimulada(200, () => Promise.resolve({ error: { codigo: 'x', mensaje: 'mal' } })),
    )

    const error = comoErrorDeApi(await errorDe(pedir('/api/raro')))

    expect(error.status).toBe(200)
    expect(error.message).toBe('mal')
  })
})

describe('pedir — éxito', () => {
  it('desenvuelve el sobre { data } y pega la URL base', async () => {
    const fetchMock = respuestaSimulada(200, () => Promise.resolve({ data: { planillaId: '1' } }))
    vi.stubGlobal('fetch', fetchMock)

    const datos = await pedir('/api/planillas/1')

    expect(datos).toEqual({ planillaId: '1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${URL_BASE_API}/api/planillas/1`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('POST con cuerpo manda Content-Type application/json', async () => {
    const fetchMock = respuestaSimulada(200, () => Promise.resolve({ data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)

    await pedir('/api/planillas/1/enviar-sap', { metodo: 'POST', cuerpo: '{}' })

    expect(fetchMock).toHaveBeenCalledWith(
      `${URL_BASE_API}/api/planillas/1/enviar-sap`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    )
  })

  it('2xx sin sobre { data } → ErrorDeApi de formato (500 / formato_invalido)', async () => {
    vi.stubGlobal('fetch', respuestaSimulada(200, () => Promise.resolve({ cualquier: 'cosa' })))

    const error = comoErrorDeApi(await errorDe(pedir('/api/sin-sobre')))

    expect(error.status).toBe(500)
    expect(error.codigo).toBe('formato_invalido')
    expect(error.message).toContain('formato inesperado')
  })
})

describe('pedir — fallos', () => {
  it('fallo de red (fetch rechaza) → ErrorDeRed con mensaje de conexión en español', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const error = comoErrorDeRed(await errorDe(pedir('/api/planillas/1')))

    expect(error.name).toBe('ErrorDeRed')
    expect(error.message).toBe(
      'No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.',
    )
    // Un fallo de red NUNCA se confunde con un error de API (la pantalla pinta
    // "no hay conexión" y no un mensaje del servidor que nunca respondió).
    expect(error).not.toBeInstanceOf(ErrorDeApi)
  })

  it('AbortError se propaga SIN envolver: es cancelación, no un fallo', async () => {
    const cancelacion = new Error('The operation was aborted.')
    cancelacion.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cancelacion))

    const error = await errorDe(pedir('/api/planillas/1', { signal: new AbortController().signal }))

    expect(error).toBe(cancelacion)
    expect((error as Error).name).toBe('AbortError')
    expect(error).not.toBeInstanceOf(ErrorDeRed)
    expect(error).not.toBeInstanceOf(ErrorDeApi)
  })
})
