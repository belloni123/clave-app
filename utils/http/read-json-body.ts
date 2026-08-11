import 'server-only'

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the configured limit.')
    this.name = 'RequestBodyTooLargeError'
  }
}

export async function readJsonBody(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError()
  }

  if (!request.body) throw new SyntaxError('Request body is empty.')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel()
        throw new RequestBodyTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received).toString('utf8')) as unknown
}
