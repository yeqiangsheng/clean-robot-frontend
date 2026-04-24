import { describe, expect, it } from 'vitest'

import { bootstrapUsers, openSiteDatabase } from './database.mjs'

function createBootstrapUser(username, role = 'engineer') {
  return {
    username,
    displayName: username,
    role,
    password: `${username}-password`,
  }
}

describe('site gateway database bootstrapUsers', () => {
  it('adds missing bootstrap users into an existing database without overwriting current users', () => {
    const database = openSiteDatabase(':memory:')

    bootstrapUsers(database, [
      createBootstrapUser('operator', 'operator'),
      createBootstrapUser('engineer', 'engineer'),
    ])

    bootstrapUsers(database, [
      createBootstrapUser('operator', 'operator'),
      createBootstrapUser('engineer', 'engineer'),
      createBootstrapUser('baer', 'engineer'),
    ])

    const users = database
      .prepare(
        `
      SELECT username, display_name AS displayName, role
      FROM users
      ORDER BY username
    `,
      )
      .all()

    expect(users).toEqual([
      {
        username: 'baer',
        displayName: 'baer',
        role: 'engineer',
      },
      {
        username: 'engineer',
        displayName: 'engineer',
        role: 'engineer',
      },
      {
        username: 'operator',
        displayName: 'operator',
        role: 'operator',
      },
    ])
  })
})
