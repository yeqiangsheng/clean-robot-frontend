import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import { SESSION_COOKIE_NAME } from './constants.mjs'

const PASSWORD_KEY_LENGTH = 64

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex')
  return `${salt}:${derived}`
}

export function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false
  }

  const [salt, expected] = storedHash.split(':', 2)
  const actual = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex')

  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token) {
  return scryptSync(token, 'clean-robot-site-gateway-session', 64).toString('hex')
}

export function parseCookies(cookieHeader) {
  if (typeof cookieHeader !== 'string' || cookieHeader.trim().length === 0) {
    return {}
  }

  return cookieHeader.split(';').reduce((result, entry) => {
    const [rawKey, ...rawValue] = entry.trim().split('=')
    if (!rawKey) {
      return result
    }

    result[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.join('='))
    return result
  }, {})
}

export function buildSessionCookie(token, maxAgeSeconds) {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.round(maxAgeSeconds))}`,
  ].join('; ')
}

export function buildExpiredSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ')
}
