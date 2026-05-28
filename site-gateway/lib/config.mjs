import { readFileSync } from 'node:fs'

import {
  APP_MODULE_KEYS,
  CAPABILITY_FLAGS,
  DEFAULT_ENABLED_MODULES,
  DEFAULT_ROLE_POLICY,
  USER_ROLES,
} from './constants.mjs'

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`)
  }

  return value.trim()
}

function readOptionalString(value, field, fallback = '') {
  if (value === undefined) {
    return fallback
  }

  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string when provided.`)
  }

  return value.trim()
}

function readPositiveInteger(value, field, fallback) {
  if (value === undefined) {
    return fallback
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer.`)
  }

  return value
}

function readBoolean(value, field, fallback) {
  if (value === undefined) {
    return fallback
  }

  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean when provided.`)
  }

  return value
}

function readRosbridgeUrl(value, field) {
  const url = readString(value, field)
  const parsed = new URL(url)

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`${field} must use ws:// or wss://.`)
  }

  return parsed.toString()
}

function isUnsafeBootstrapPassword(password) {
  const normalized = password.trim().toLowerCase()

  return (
    normalized.startsWith('change-me') ||
    normalized.startsWith('replace_with') ||
    normalized.startsWith('replace-with') ||
    normalized.includes('site_specific') ||
    normalized.includes('site-specific') ||
    normalized.startsWith('<') ||
    [
      'password',
      'password123',
      'operator123',
      'service123',
      'engineer123',
      'admin123',
      '123456',
      '12345678',
      'qwerty',
    ].includes(normalized)
  )
}

function normalizeEnabledModules(value) {
  if (value === undefined) {
    return { ...DEFAULT_ENABLED_MODULES }
  }

  if (!isRecord(value)) {
    throw new Error('enabledModules must be an object.')
  }

  const result = {}

  for (const moduleKey of APP_MODULE_KEYS) {
    const nextValue = value[moduleKey]
    if (typeof nextValue !== 'boolean') {
      throw new Error(`enabledModules.${moduleKey} must be a boolean.`)
    }
    result[moduleKey] = nextValue
  }

  return result
}

function normalizeRolePolicy(value) {
  if (value === undefined) {
    return structuredClone(DEFAULT_ROLE_POLICY)
  }

  if (!isRecord(value)) {
    throw new Error('rolePolicy must be an object.')
  }

  const result = {}

  for (const role of USER_ROLES) {
    const rawList = value[role]

    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new Error(`rolePolicy.${role} must be a non-empty array.`)
    }

    result[role] = Array.from(
      new Set(
        rawList.map((entry, index) => {
          if (typeof entry !== 'string' || !CAPABILITY_FLAGS.includes(entry)) {
            throw new Error(`rolePolicy.${role}[${index}] contains an unknown capability.`)
          }
          return entry
        }),
      ),
    )
  }

  return result
}

function normalizeBootstrapUsers(value) {
  if (value === undefined) {
    return []
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('bootstrapUsers must be a non-empty array when provided.')
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`bootstrapUsers[${index}] must be an object.`)
    }

    const role = readString(entry.role, `bootstrapUsers[${index}].role`)
    if (!USER_ROLES.includes(role)) {
      throw new Error(`bootstrapUsers[${index}].role is invalid.`)
    }

    const password = readString(entry.password, `bootstrapUsers[${index}].password`)
    if (isUnsafeBootstrapPassword(password)) {
      throw new Error(
        `bootstrapUsers[${index}].password must be replaced with a site-specific secret.`,
      )
    }

    return {
      username: readString(entry.username, `bootstrapUsers[${index}].username`),
      displayName: readString(entry.displayName, `bootstrapUsers[${index}].displayName`),
      role,
      password,
    }
  })
}

export function normalizeSiteConfig(value) {
  if (!isRecord(value)) {
    throw new Error('site-gateway config must be a JSON object.')
  }

  return {
    siteName: readString(value.siteName, 'siteName'),
    robotId: readString(value.robotId, 'robotId'),
    rosbridgeUrl: readRosbridgeUrl(value.rosbridgeUrl, 'rosbridgeUrl'),
    enabledModules: normalizeEnabledModules(value.enabledModules),
    rolePolicy: normalizeRolePolicy(value.rolePolicy),
    sessionTtlHours: readPositiveInteger(value.sessionTtlHours, 'sessionTtlHours', 12),
    clearSessionsOnStartup: readBoolean(value.clearSessionsOnStartup, 'clearSessionsOnStartup', true),
    logRetentionDays: readPositiveInteger(value.logRetentionDays, 'logRetentionDays', 14),
    mapImportPbstreamDir: readOptionalString(
      value.mapImportPbstreamDir,
      'mapImportPbstreamDir',
      '/opt/carto/map',
    ),
    bootstrapUsers: normalizeBootstrapUsers(value.bootstrapUsers),
  }
}

export function loadSiteConfig(configPath) {
  const payload = JSON.parse(readFileSync(configPath, 'utf8'))
  if (isRecord(payload)) {
    if (process.env.SITE_ROSBRIDGE_URL) {
      payload.rosbridgeUrl = process.env.SITE_ROSBRIDGE_URL
    }

    if (process.env.SITE_MAP_IMPORT_PBSTREAM_DIR) {
      payload.mapImportPbstreamDir = process.env.SITE_MAP_IMPORT_PBSTREAM_DIR
    }
  }

  return normalizeSiteConfig(payload)
}
