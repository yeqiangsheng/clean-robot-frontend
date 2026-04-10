import type {
  AppConfig,
  AppConfigValidationIssue,
  AppModuleKey,
  CapabilityFlag,
  UserRole,
} from '../types/appShell'

const FALLBACK_ROSBRIDGE_URL =
  import.meta.env.VITE_ROSBRIDGE_URL ?? 'ws://127.0.0.1:9090'

export const APP_MODULE_KEYS = [
  'overview',
  'workbench',
  'tasks',
  'schedules',
  'execution',
  'slam',
  'runtime',
  'actuator-control',
] as const satisfies readonly AppModuleKey[]

export const USER_ROLES = ['operator', 'service', 'engineer'] as const satisfies readonly UserRole[]

export const CAPABILITY_FLAGS = [
  'overview',
  'mapWorkbench',
  'taskManagement',
  'scheduleManagement',
  'executionControl',
  'slamWorkbench',
  'runtimeMonitoring',
  'actuatorControl',
  'chargingControl',
  'profileCatalog',
  'systemReadiness',
] as const satisfies readonly CapabilityFlag[]

const DEFAULT_ROLE_POLICY: Record<UserRole, CapabilityFlag[]> = {
  operator: [
    'overview',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'profileCatalog',
    'systemReadiness',
  ],
  service: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'runtimeMonitoring',
    'profileCatalog',
    'systemReadiness',
  ],
  engineer: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'slamWorkbench',
    'runtimeMonitoring',
    'actuatorControl',
    'chargingControl',
    'profileCatalog',
    'systemReadiness',
  ],
}

const DEFAULT_ENABLED_MODULES: Record<AppModuleKey, boolean> = {
  overview: true,
  workbench: true,
  tasks: true,
  schedules: true,
  execution: true,
  slam: true,
  runtime: true,
  'actuator-control': true,
}

const DEFAULT_CONFIG: AppConfig = {
  siteName: 'Clean Robot Frontend',
  robotId: 'local_robot',
  rosbridgeUrl: FALLBACK_ROSBRIDGE_URL,
  quickRosbridgeUrls: [FALLBACK_ROSBRIDGE_URL],
  enabledModules: DEFAULT_ENABLED_MODULES,
  rolePolicy: DEFAULT_ROLE_POLICY,
  engineerUnlockMode: 'direct',
  logRetentionDays: 14,
}

let currentConfig: AppConfig = DEFAULT_CONFIG

function ensureRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function appendIssue(
  issues: AppConfigValidationIssue[],
  field: string,
  message: string,
) {
  issues.push({ field, message })
}

function requireRecord(
  value: unknown,
  field: string,
  issues: AppConfigValidationIssue[],
) {
  if (!ensureRecord(value)) {
    appendIssue(issues, field, `${field} must be an object.`)
    return null
  }

  return value
}

function validateNonEmptyString(
  value: unknown,
  field: string,
  issues: AppConfigValidationIssue[],
) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    appendIssue(issues, field, `${field} must be a non-empty string.`)
    return ''
  }

  return value.trim()
}

function validateWsUrl(
  value: unknown,
  field: string,
  issues: AppConfigValidationIssue[],
) {
  const normalized = validateNonEmptyString(value, field, issues)

  if (!normalized) {
    return ''
  }

  try {
    const parsed = new URL(normalized)

    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      appendIssue(issues, field, `${field} must use ws:// or wss://.`)
      return ''
    }

    return parsed.toString()
  } catch {
    appendIssue(issues, field, `${field} must be a valid websocket URL.`)
    return ''
  }
}

function validateStringList(
  value: unknown,
  field: string,
  issues: AppConfigValidationIssue[],
) {
  if (!Array.isArray(value) || value.length === 0) {
    appendIssue(issues, field, `${field} must be a non-empty array.`)
    return [] as string[]
  }

  return value
    .map((entry, index) => validateWsUrl(entry, `${field}[${index}]`, issues))
    .filter((entry) => entry.length > 0)
}

function validatePositiveInteger(
  value: unknown,
  field: string,
  issues: AppConfigValidationIssue[],
) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 1 ||
    !Number.isInteger(value)
  ) {
    appendIssue(issues, field, `${field} must be a positive integer.`)
    return 0
  }

  return value
}

function validateEnabledModules(
  value: unknown,
  issues: AppConfigValidationIssue[],
) {
  const record = requireRecord(value, 'enabledModules', issues)
  const next = {} as Record<AppModuleKey, boolean>

  for (const moduleKey of APP_MODULE_KEYS) {
    const rawValue = record?.[moduleKey]

    if (typeof rawValue !== 'boolean') {
      appendIssue(
        issues,
        `enabledModules.${moduleKey}`,
        `enabledModules.${moduleKey} must be a boolean.`,
      )
      next[moduleKey] = DEFAULT_ENABLED_MODULES[moduleKey]
      continue
    }

    next[moduleKey] = rawValue
  }

  if (record) {
    for (const key of Object.keys(record)) {
      if (!APP_MODULE_KEYS.includes(key as AppModuleKey)) {
        appendIssue(issues, `enabledModules.${key}`, `Unknown module key: ${key}.`)
      }
    }
  }

  return next
}

function validateRolePolicy(
  value: unknown,
  issues: AppConfigValidationIssue[],
) {
  const record = requireRecord(value, 'rolePolicy', issues)
  const next = {} as Record<UserRole, CapabilityFlag[]>

  for (const role of USER_ROLES) {
    const rawList = record?.[role]

    if (!Array.isArray(rawList)) {
      appendIssue(issues, `rolePolicy.${role}`, `rolePolicy.${role} must be an array.`)
      next[role] = DEFAULT_ROLE_POLICY[role]
      continue
    }

    const capabilityList = rawList.flatMap((entry, index) => {
      if (typeof entry !== 'string' || !CAPABILITY_FLAGS.includes(entry as CapabilityFlag)) {
        appendIssue(
          issues,
          `rolePolicy.${role}[${index}]`,
          `Unknown capability: ${String(entry)}.`,
        )
        return []
      }

      return [entry as CapabilityFlag]
    })

    if (capabilityList.length === 0) {
      appendIssue(issues, `rolePolicy.${role}`, `rolePolicy.${role} must not be empty.`)
      next[role] = DEFAULT_ROLE_POLICY[role]
      continue
    }

    next[role] = Array.from(new Set(capabilityList))
  }

  if (record) {
    for (const key of Object.keys(record)) {
      if (!USER_ROLES.includes(key as UserRole)) {
        appendIssue(issues, `rolePolicy.${key}`, `Unknown role key: ${key}.`)
      }
    }
  }

  return next
}

function validateEngineerUnlockMode(
  value: unknown,
  issues: AppConfigValidationIssue[],
) {
  if (value !== 'direct') {
    appendIssue(
      issues,
      'engineerUnlockMode',
      'engineerUnlockMode must be "direct" in the trial deployment.',
    )
  }

  return 'direct' as const
}

export class AppConfigValidationError extends Error {
  readonly issues: AppConfigValidationIssue[]

  constructor(message: string, issues: AppConfigValidationIssue[]) {
    super(message)
    this.name = 'AppConfigValidationError'
    this.issues = issues
  }
}

export function normalizeConfig(value: unknown): AppConfig {
  const issues: AppConfigValidationIssue[] = []
  const record = requireRecord(value, 'appConfig', issues)

  const rosbridgeUrl = validateWsUrl(record?.rosbridgeUrl, 'rosbridgeUrl', issues)
  const quickRosbridgeUrls = Array.from(
    new Set([
      rosbridgeUrl,
      ...validateStringList(record?.quickRosbridgeUrls, 'quickRosbridgeUrls', issues),
    ].filter((entry) => entry.length > 0)),
  )

  const config: AppConfig = {
    siteName: validateNonEmptyString(record?.siteName, 'siteName', issues),
    robotId: validateNonEmptyString(record?.robotId, 'robotId', issues),
    rosbridgeUrl,
    quickRosbridgeUrls,
    enabledModules: validateEnabledModules(record?.enabledModules, issues),
    rolePolicy: validateRolePolicy(record?.rolePolicy, issues),
    engineerUnlockMode: validateEngineerUnlockMode(record?.engineerUnlockMode, issues),
    logRetentionDays: validatePositiveInteger(
      record?.logRetentionDays,
      'logRetentionDays',
      issues,
    ),
  }

  if (issues.length > 0) {
    throw new AppConfigValidationError(
      'The local app-config.json file is invalid. Fix the listed fields before using the frontend.',
      issues,
    )
  }

  return config
}

export async function loadAppConfig() {
  let response: Response

  try {
    response = await fetch('/app-config.json', {
      cache: 'no-store',
    })
  } catch (error) {
    throw new AppConfigValidationError(
      'Failed to load /app-config.json. Verify the frontend package and local static server.',
      [
        {
          field: 'app-config.json',
          message: error instanceof Error ? error.message : 'Network request failed.',
        },
      ],
    )
  }

  if (!response.ok) {
    throw new AppConfigValidationError(
      `Failed to load /app-config.json. HTTP ${response.status} was returned.`,
      [
        {
          field: 'app-config.json',
          message: `HTTP ${response.status} ${response.statusText}`,
        },
      ],
    )
  }

  let payload: unknown

  try {
    payload = await response.json()
  } catch (error) {
    throw new AppConfigValidationError(
      'The local app-config.json file is not valid JSON.',
      [
        {
          field: 'app-config.json',
          message: error instanceof Error ? error.message : 'JSON parsing failed.',
        },
      ],
    )
  }

  currentConfig = normalizeConfig(payload)
  return currentConfig
}

export function getAppConfig() {
  return currentConfig
}

export function sanitizeAppConfig(config: AppConfig = currentConfig): AppConfig {
  return {
    ...config,
    quickRosbridgeUrls: [...config.quickRosbridgeUrls],
    enabledModules: { ...config.enabledModules },
    rolePolicy: Object.fromEntries(
      USER_ROLES.map((role) => [role, [...(config.rolePolicy[role] ?? [])]]),
    ) as AppConfig['rolePolicy'],
  }
}

export function getConfiguredRosbridgeUrl() {
  return currentConfig.rosbridgeUrl || DEFAULT_CONFIG.rosbridgeUrl
}

export function getConfiguredQuickRosbridgeUrls() {
  return currentConfig.quickRosbridgeUrls
}

export function getDefaultRolePolicy() {
  return currentConfig.rolePolicy
}

export function isModuleEnabled(moduleKey: AppModuleKey) {
  return currentConfig.enabledModules[moduleKey] !== false
}

export function getDefaultAppConfig() {
  return DEFAULT_CONFIG
}
