export function normalizeForwardedWebSocketMessage(data, isBinary = false) {
  if (isBinary) {
    return {
      payload: data,
      options: { binary: true },
    }
  }

  if (typeof data === 'string') {
    return {
      payload: data,
      options: { binary: false },
    }
  }

  if (data instanceof ArrayBuffer) {
    return {
      payload: Buffer.from(data).toString('utf8'),
      options: { binary: false },
    }
  }

  if (ArrayBuffer.isView(data)) {
    return {
      payload: Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'),
      options: { binary: false },
    }
  }

  return {
    payload: String(data),
    options: { binary: false },
  }
}
