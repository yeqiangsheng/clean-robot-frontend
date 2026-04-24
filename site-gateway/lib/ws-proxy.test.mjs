import { describe, expect, it } from 'vitest'

import { normalizeForwardedWebSocketMessage } from './ws-proxy.mjs'

describe('normalizeForwardedWebSocketMessage', () => {
  it('keeps upstream text frames as browser text frames', () => {
    const forwarded = normalizeForwardedWebSocketMessage(
      Buffer.from('{"op":"status","msg":"ok"}', 'utf8'),
      false,
    )

    expect(forwarded).toEqual({
      payload: '{"op":"status","msg":"ok"}',
      options: { binary: false },
    })
  })

  it('preserves upstream binary frames when they are truly binary', () => {
    const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef])
    const forwarded = normalizeForwardedWebSocketMessage(payload, true)

    expect(forwarded.payload).toBe(payload)
    expect(forwarded.options).toEqual({ binary: true })
  })
})
