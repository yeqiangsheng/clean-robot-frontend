import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { hashPassword } from './security.mjs'

export function openSiteDatabase(filePath) {
  mkdirSync(dirname(filePath), { recursive: true })
  const database = new DatabaseSync(filePath)
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      actor TEXT NOT NULL,
      role TEXT NOT NULL,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      request_id TEXT,
      source TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
  `)

  return database
}

export function bootstrapUsers(database, bootstrapUsers) {
  if (!Array.isArray(bootstrapUsers) || bootstrapUsers.length === 0) {
    return
  }

  const now = Date.now()
  const insert = database.prepare(`
    INSERT INTO users (username, display_name, role, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const findExisting = database.prepare(`
    SELECT id
    FROM users
    WHERE username = ?
  `)
  const updateExisting = database.prepare(`
    UPDATE users
    SET display_name = ?, role = ?, password_hash = ?, updated_at = ?
    WHERE id = ?
  `)

  for (const user of bootstrapUsers) {
    const existingUser = findExisting.get(user.username)

    if (existingUser) {
      updateExisting.run(
        user.displayName,
        user.role,
        hashPassword(user.password),
        now,
        existingUser.id,
      )
      continue
    }

    insert.run(
      user.username,
      user.displayName,
      user.role,
      hashPassword(user.password),
      now,
      now,
    )
  }
}

export function pruneExpiredSessions(database, now = Date.now()) {
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
}

export function deleteAllSessions(database) {
  database.prepare('DELETE FROM sessions').run()
}

export function pruneExpiredAuditLogs(database, retentionDays, now = Date.now()) {
  const retentionMs = Math.max(1, retentionDays) * 24 * 60 * 60 * 1000
  database.prepare('DELETE FROM audit_log WHERE timestamp < ?').run(now - retentionMs)
}

export function findUserByUsername(database, username) {
  return (
    database
      .prepare(
        `
      SELECT id, username, display_name AS displayName, role, password_hash AS passwordHash
      FROM users
      WHERE username = ?
    `,
      )
      .get(username) ?? null
  )
}

export function createSession(database, options) {
  const now = Date.now()
  database
    .prepare(
      `
    INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(options.userId, options.tokenHash, options.expiresAt, now, now)
}

export function findSessionByTokenHash(database, tokenHash, now = Date.now()) {
  const session =
    database
      .prepare(
        `
      SELECT
        sessions.id,
        sessions.user_id AS userId,
        sessions.expires_at AS expiresAt,
        users.username,
        users.display_name AS displayName,
        users.role
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `,
      )
      .get(tokenHash, now) ?? null

  if (!session) {
    return null
  }

  database
    .prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
    .run(now, session.id)

  return session
}

export function deleteSessionByTokenHash(database, tokenHash) {
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
}

export function insertAuditLog(database, record) {
  database
    .prepare(
      `
    INSERT INTO audit_log (
      id,
      timestamp,
      actor,
      role,
      category,
      action,
      target,
      status,
      message,
      detail_json,
      request_id,
      source
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      record.id,
      record.timestamp,
      record.actor,
      record.role,
      record.category,
      record.action,
      record.target,
      record.status,
      record.message,
      JSON.stringify(record.detail ?? {}),
      record.requestId ?? null,
      record.source ?? null,
    )

  return {
    ...record,
    detail: record.detail ?? {},
  }
}

export function listAuditLogs(database, limit = 50) {
  return database
    .prepare(
      `
    SELECT
      id,
      timestamp,
      actor,
      role,
      category,
      action,
      target,
      status,
      message,
      detail_json AS detailJson,
      request_id AS requestId,
      source
    FROM audit_log
    ORDER BY timestamp DESC
    LIMIT ?
  `,
    )
    .all(Math.max(1, Math.round(limit)))
    .map((record) => ({
      ...record,
      detail: safeParseJson(record.detailJson, {}),
    }))
}

function safeParseJson(value, fallback) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
