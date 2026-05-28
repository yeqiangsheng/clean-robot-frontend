import { describe, expect, it } from 'vitest'

import {
  bootstrapUsers,
  createSession,
  deleteAllSessions,
  findSessionByTokenHash,
  openSiteDatabase,
} from './database.mjs'
import { hashSessionToken } from './security.mjs'
import { verifyPassword } from './security.mjs'

function createBootstrapUser(username, role = 'engineer') {
  return {
    username,
    displayName: username,
    role,
    password: `${username}-password`,
  }
}

describe('site gateway database bootstrapUsers', () => {
  it('syncs bootstrap users and adds missing users into an existing database', () => {
    const database = openSiteDatabase(':memory:')

    bootstrapUsers(database, [
      createBootstrapUser('operator', 'operator'),
      createBootstrapUser('engineer', 'engineer'),
    ])

    bootstrapUsers(database, [
      createBootstrapUser('operator', 'operator'),
      {
        ...createBootstrapUser('engineer', 'admin'),
        displayName: '现场管理员',
        password: 'engineer-new-password',
      },
      createBootstrapUser('baer', 'engineer'),
    ])

    const users = database
      .prepare(
        `
      SELECT username, display_name AS displayName, role, password_hash AS passwordHash
      FROM users
      ORDER BY username
    `,
      )
      .all()

    expect(users.map(({ passwordHash, ...user }) => user)).toEqual([
      { username: 'baer', displayName: 'baer', role: 'engineer' },
      { username: 'engineer', displayName: '现场管理员', role: 'admin' },
      { username: 'operator', displayName: 'operator', role: 'operator' },
    ])
    expect(verifyPassword('engineer-new-password', users[1].passwordHash)).toBe(true)
  })

  it('can clear persisted sessions on gateway startup', () => {
    const database = openSiteDatabase(':memory:')

    bootstrapUsers(database, [createBootstrapUser('operator', 'operator')])
    const user = database.prepare('SELECT id FROM users WHERE username = ?').get('operator')
    const tokenHash = hashSessionToken('startup-session-token')

    createSession(database, {
      userId: user.id,
      tokenHash,
      expiresAt: Date.now() + 60_000,
    })

    expect(findSessionByTokenHash(database, tokenHash)).not.toBeNull()

    deleteAllSessions(database)

    expect(findSessionByTokenHash(database, tokenHash)).toBeNull()
  })
})
