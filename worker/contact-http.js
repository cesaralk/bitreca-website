export const contactJson = (status, body, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
})
export const contactUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function readContactJson(request, limit = 24576) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw 415
  if (Number(request.headers.get('Content-Length')) > limit) throw 413
  const reader = request.body?.getReader()
  if (!reader) throw 400
  let timer
  try {
    return await Promise.race([
      (async () => {
        const chunks = []
        let bytes = 0
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > limit) throw 413
          chunks.push(value)
        }
        const body = new Uint8Array(bytes)
        let offset = 0
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) } catch { throw 400 }
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(408), 5000) }),
    ])
  } finally { clearTimeout(timer); reader.cancel().catch(() => {}) }
}

export const contactBodyError = (status) => contactJson([400, 408, 413, 415].includes(status) ? status : 400, { status: 'invalid_request', message: 'Invalid enquiry request.' })
