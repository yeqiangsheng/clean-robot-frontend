import type {
  AppConfig,
  AppConfigValidationIssue,
  AppModuleKey,
  CapabilityFlag,
  UserRole,
} from '../types/appShell'

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

export const USER_ROLES = ['operator', 'service', 'engineer', 'admin'] as const satisfies readonly UserRole[]

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
  siteName: '清洁机器人商用站点',
  robotId: 'local_robot',
  apiBaseUrl: '/api',
  enabledModules: DEFAULT_ENABLED_MODULES,
  supportName: '现场支持',
}

const FORBIDDEN_BROWSER_CONFIG_FIELDS = [
  'rosbridgeUrl',
  'quickRosbridgeUrls',
  'rolePolicy',
  'engineerUnlockMode',
  'engineerPasscode',
] as const

let currentConfig: AppConfig = DEFAULT_CONFIG

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function appendIssue(issues: AppConfigValidationIssue[], field: string, message: string) {
  issues.push({ field, message })
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

function validateApiBaseUrl(
  value: unknown,
  field: string,
  issues: AppConfigValidationIssue[],
) {
  const normalized = validateNonEmptyString(value, field, issues)

  if (!normalized) {
    return ''
  }

  if (normalized.startsWith('/')) {
    return normalized.replace(/\/+$/, '') || '/api'
  }

  try {
    const parsed = new URL(normalized)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      appendIssue(issues, field, `${field} must use http://, https://, or a relative /api path.`)
      return ''
    }

    return parsed.toString().replace(/\/+$/, '')
  } catch {
    appendIssue(issues, field, `${field} must be a valid absolute URL or a relative /api path.`)
    return ''
  }
}

function validateEnabledModules(value: unknown, issues: AppConfigValidationIssue[]) {
  if (!isRecord(value)) {
    appendIssue(issues, 'enabledModules', 'enabledModules must be an object.')
    return { ...DEFAULT_ENABLED_MODULES }
  }

  const result = {} as Record<AppModuleKey, boolean>

  for (const moduleKey of APP_MODULE_KEYS) {
    if (typeof value[moduleKey] !== 'boolean') {
      appendIssue(
        issues,
        `enabledModules.${moduleKey}`,
        `enabledModules.${moduleKey} must be a boolean.`,
      )
      result[moduleKey] = DEFAULT_ENABLED_MODULES[moduleKey]
      continue
    }

    result[moduleKey] = value[moduleKey] as boolean
  }

  return result
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

  if (!isRecord(value)) {
    throw new AppConfigValidationError('app-config.json must be a JSON object.', [
      {
        field: 'app-config.json',
        message: 'app-config.json must be a JSON object.',
      },
    ])
  }

  for (const field of FORBIDDEN_BROWSER_CONFIG_FIELDS) {
    if (field in value) {
      appendIssue(
        issues,
        field,
        `${field} belongs in site-gateway/site-config.json and must not be exposed through public/app-config.json.`,
      )
    }
  }

  const config: AppConfig = {
    siteName: validateNonEmptyString(value.siteName, 'siteName', issues),
    robotId: validateNonEmptyString(value.robotId, 'robotId', issues),
    apiBaseUrl: validateApiBaseUrl(value.apiBaseUrl, 'apiBaseUrl', issues),
    enabledModules: validateEnabledModules(value.enabledModules, issues),
    supportName:
      typeof value.supportName === 'string' && value.supportName.trim()
        ? value.supportName.trim()
        : undefined,
    supportPhone:
      typeof value.supportPhone === 'string' && value.supportPhone.trim()
        ? value.supportPhone.trim()
        : undefined,
    supportEmail:
      typeof value.supportEmail === 'string' && value.supportEmail.trim()
        ? value.supportEmail.trim()
        : undefined,
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
    throw new AppConfigValidationError('The local app-config.json file is not valid JSON.', [
      {
        field: 'app-config.json',
        message: error instanceof Error ? error.message : 'JSON parsing failed.',
      },
    ])
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
    enabledModules: { ...config.enabledModules },
  }
}

export function getApiBaseUrl() {
  return currentConfig.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl
}

export function getRosbridgeProxyPath() {
  return '/ws/rosbridge'
}

export function isModuleEnabled(moduleKey: AppModuleKey) {
  return currentConfig.enabledModules[moduleKey] !== false
}

export function getDefaultAppConfig() {
  return DEFAULT_CONFIG
}
