import { describe, expect, it } from 'vitest'

import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  hashPassword,
  hashSessionToken,
  parseCookies,
  verifyPassword,
} from './security.mjs'

describe('site gateway security helpers', () => {
  it('hashes passwords and verifies the expected secret only', () => {
    const passwordHash = hashPassword('clean-robot-secret')

    expect(passwordHash).toContain(':')
    expect(verifyPassword('clean-robot-secret', passwordHash)).toBe(true)
    expect(verifyPassword('wrong-secret', passwordHash)).toBe(false)
  })

  it('builds and parses session cookies consistently', () => {
    const cookie = buildSessionCookie('token-123', 3600)
    const parsed = parseCookies(`${cookie}; theme=light`)

    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(parsed.clean_robot_site_session).toBe('token-123')
    expect(parsed.theme).toBe('light')
    expect(hashSessionToken('token-123')).toHaveLength(128)
    expect(buildExpiredSessionCookie()).toContain('Max-Age=0')
  })
})
