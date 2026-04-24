import { getRosConnectionManager } from './client'
import {
  getDeprecatedReadQueryFallback,
  ODOMETRY_STATE_TOPIC_NAME,
  ODOMETRY_STATUS_QUERY_CONTRACT,
} from './queryContracts'
export {
  ODOMETRY_STATE_TOPIC_NAME,
  ODOMETRY_STATE_TOPIC_TYPE,
} from './queryContracts'
import { callAppFirstReadQueryService } from './readQueryFallback'
import { fetchRuntimeTopicMeta } from './runtimeServices'

import type { RosServiceRequest } from '../../types/ros'
import type {
  OdometryServiceResult,
  OdometryState,
} from '../../types/odometry'

type JsonRecord = Record<string, unknown>

export const ODOMETRY_STATUS_SERVICE_NAME =
  ODOMETRY_STATUS_QUERY_CONTRACT.canonical.serviceName
export const ODOMETRY_STATUS_SERVICE_TYPE =
  ODOMETRY_STATUS_QUERY_CONTRACT.canonical.serviceType
const ODOMETRY_STATUS_DEPRECATED_FALLBACK =
  getDeprecatedReadQueryFallback(ODOMETRY_STATUS_QUERY_CONTRACT)
export const ODOMETRY_STATUS_LEGACY_SERVICE_NAME =
  ODOMETRY_STATUS_DEPRECATED_FALLBACK?.serviceName ??
  ODOMETRY_STATUS_QUERY_CONTRACT.canonical.serviceName
export const ODOMETRY_STATUS_LEGACY_SERVICE_TYPE =
  ODOMETRY_STATUS_DEPRECATED_FALLBACK?.serviceType ??
  ODOMETRY_STATUS_QUERY_CONTRACT.canonical.serviceType

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) {
      return true
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false
    }
  }

  return null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function toStampMs(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const secs = toNumber(value.secs)
  const nsecs = toNumber(value.nsecs) ?? 0

  if (secs === null) {
    return null
  }

  return secs * 1000 + Math.floor(nsecs / 1_000_000)
}

export function normalizeOdometryState(value: unknown): OdometryState | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    robotId: toString(value.robot_id),
    odomSource: toString(value.odom_source),
    odomTopic: toString(value.odom_topic),
    rawOdomTopic: toString(value.raw_odom_topic),
    imuTopic: toString(value.imu_topic),
    connected: toBoolean(value.connected),
    wheelSpeedNodeReady: toBoolean(value.wheel_speed_node_ready),
    imuPreprocessNodeReady: toBoolean(value.imu_preprocess_node_ready),
    ekfNodeReady: toBoolean(value.ekf_node_ready),
    wheelSpeedFresh: toBoolean(value.wheel_speed_fresh),
    imuFresh: toBoolean(value.imu_fresh),
    odomFresh: toBoolean(value.odom_fresh),
    odomValid: toBoolean(value.odom_valid),
    wheelSpeedAgeS: toNumber(value.wheel_speed_age_s),
    imuAgeS: toNumber(value.imu_age_s),
    odomAgeS: toNumber(value.odom_age_s),
    errorCode: toString(value.error_code),
    message: toString(value.message),
    warnings: toStringArray(value.warnings),
    stampMs: toStampMs(value.stamp),
    raw: value,
  }
}

async function callOdometryService(request: RosServiceRequest) {
  const client = getRosConnectionManager()
  return client.callService<RosServiceRequest, JsonRecord>({
    serviceName: ODOMETRY_STATUS_LEGACY_SERVICE_NAME,
    serviceType: ODOMETRY_STATUS_LEGACY_SERVICE_TYPE,
    request,
  })
}

function normalizeOdometryServiceResult(payload: JsonRecord) {
  const success =
    typeof payload.success === 'boolean' ? payload.success : null
  const message = typeof payload.message === 'string' ? payload.message : ''
  const stateSource = 'state' in payload ? payload.state : payload
  const state = normalizeOdometryState(stateSource)

  if (success === false) {
    return {
      success,
      message,
      state,
      raw: payload,
    } satisfies OdometryServiceResult
  }

  if (!state) {
    return null
  }

  return {
    success: success ?? true,
    message,
    state,
    raw: payload,
  } satisfies OdometryServiceResult
}

export async function fetchOdometryStatus(robotId = 'local_robot') {
  return callAppFirstReadQueryService({
    contract: ODOMETRY_STATUS_QUERY_CONTRACT,
    request: {
      robot_id: robotId,
    },
    evaluateAppResponse: (payload) => {
      const normalized = normalizeOdometryServiceResult(payload)

      return normalized
        ? {
            kind: 'success',
            value: normalized,
          }
        : {
            kind: 'fallback',
            reason: 'App odometry query returned no usable state payload.',
          }
    },
    mapLegacyResponse: (payload) => {
      const normalized = normalizeOdometryServiceResult(payload)

      if (!normalized) {
        throw new Error('Legacy odometry query returned no usable state payload.')
      }

      return normalized
    },
  })
}

export async function fetchLegacyOdometryStatus(robotId = 'local_robot') {
  const payload = await callOdometryService({
    robot_id: robotId,
  })

  return {
    success: isRecord(payload) && typeof payload.success === 'boolean' ? payload.success : false,
    message: isRecord(payload) && typeof payload.message === 'string' ? payload.message : '',
    state: normalizeOdometryState(isRecord(payload) ? payload.state : null),
    raw: isRecord(payload) ? payload : {},
  } satisfies OdometryServiceResult
}

export async function fetchOdometryTopicMeta() {
  return fetchRuntimeTopicMeta(ODOMETRY_STATE_TOPIC_NAME)
}
