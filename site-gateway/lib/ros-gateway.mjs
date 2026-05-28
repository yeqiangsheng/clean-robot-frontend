import { access } from 'node:fs/promises'
import { join } from 'node:path'

import { WebSocket } from 'ws'
import { AbstractTransport, Ros, Service, Topic } from 'roslib'

import {
  ACTUATOR_CONTROL_TOPICS,
  CAPABILITY_FLAGS,
  CAPABILITY_TITLES,
  DOCK_CALIBRATION_COMMAND_SERVICE_NAME,
  DOCK_CALIBRATION_STATUS_SERVICE_NAME,
  EXECUTION_SERVICE_NAME,
  flattenServiceDependencyLabels,
  MAP_SERVICE_NAME,
  MODULE_CAPABILITY_MAP,
  RUNTIME_TOPIC_CONFIGS,
  SCHEDULE_SERVICE_NAME,
  SERVICE_DEPENDENCIES,
  SITE_ALIGNMENT_BY_POINTS_SERVICE_NAME,
  SITE_ALIGNMENT_SERVICE_NAME,
  SITE_COVERAGE_COMMIT_SERVICE_NAME,
  SITE_COVERAGE_PREVIEW_SERVICE_NAME,
  SITE_COVERAGE_ZONE_SERVICE_NAME,
  SITE_NO_GO_AREA_SERVICE_NAME,
  SITE_RECT_ZONE_PREVIEW_SERVICE_NAME,
  SITE_VIRTUAL_WALL_SERVICE_NAME,
  SITE_ZONE_PLAN_PATH_SERVICE_NAME,
  SLAM_SUBMIT_SERVICE_NAME,
  TASK_SERVICE_NAME,
  TOPIC_DEPENDENCIES,
} from './constants.mjs'
import { getActuatorCommandKind, publishActuatorCommand } from './ros-gateway-actuator.mjs'
import { callAppReadQueryService } from './read-query.mjs'
import {
  ODOMETRY_STATE_TOPIC_NAME,
  ODOMETRY_STATE_TOPIC_TYPE,
  ODOMETRY_STATUS_QUERY_CONTRACT,
  PROFILE_CATALOG_QUERY_CONTRACT,
  SLAM_JOB_QUERY_CONTRACT,
  SLAM_JOB_TOPIC_NAME,
  SLAM_JOB_TOPIC_TYPE,
  SLAM_STATE_TOPIC_NAME,
  SLAM_STATE_TOPIC_TYPE,
  SLAM_STATUS_QUERY_CONTRACT,
  SYSTEM_READINESS_QUERY_CONTRACT,
  SYSTEM_READINESS_TOPIC_NAME,
  SYSTEM_READINESS_TOPIC_TYPE,
} from './read-query-contracts.mjs'
import {
  buildScheduleRequest,
  buildTaskRequest,
  createServiceError,
  delay,
  findFirstValue,
  getResponseSuccess,
  isRecord,
  normalizeMapCatalogEntry,
  normalizeOdometryState,
  normalizeMapCatalogList,
  normalizeProfileEntry,
  normalizeScheduleDetail,
  normalizeScheduleEntity,
  normalizeScheduleList,
  normalizeSubmitJobResponse,
  normalizeSlamWorkflowJob,
  normalizeSlamWorkflowState,
  normalizeSystemReadiness,
  normalizeTaskDetail,
  normalizeTaskEntity,
  normalizeTaskFinishBehavior,
  normalizeTaskList,
  pickValue,
  pickString,
  toBoolean,
  toNumber,
  toStringArray,
} from './ros-helpers.mjs'

const DEFAULT_SERVICE_TYPE = 'std_srvs/Trigger'
const DEFAULT_TIMEOUT_SECONDS = 8
const PBSTREAM_EXTENSION = '.pbstream'
const SERVICE_TIMEOUT_OVERRIDES = {
  [TASK_SERVICE_NAME]: 20,
  [SCHEDULE_SERVICE_NAME]: 20,
  [EXECUTION_SERVICE_NAME]: 15,
  [DOCK_CALIBRATION_STATUS_SERVICE_NAME]: 8,
  [DOCK_CALIBRATION_COMMAND_SERVICE_NAME]: 8,
  '/clean_robot_server/app/manual_drive_command': 8,
  '/clean_robot_server/app/get_manual_drive_status': 8,
  [SLAM_SUBMIT_SERVICE_NAME]: 15,
  [PROFILE_CATALOG_QUERY_CONTRACT.canonical.serviceName]: 15,
  [SYSTEM_READINESS_QUERY_CONTRACT.canonical.serviceName]: 15,
  [ODOMETRY_STATUS_QUERY_CONTRACT.canonical.serviceName]: 15,
  [SLAM_STATUS_QUERY_CONTRACT.canonical.serviceName]: 15,
  [SLAM_JOB_QUERY_CONTRACT.canonical.serviceName]: 15,
  [MAP_SERVICE_NAME]: 15,
  [SITE_ALIGNMENT_SERVICE_NAME]: 15,
  [SITE_ALIGNMENT_BY_POINTS_SERVICE_NAME]: 15,
  [SITE_RECT_ZONE_PREVIEW_SERVICE_NAME]: 15,
  [SITE_COVERAGE_ZONE_SERVICE_NAME]: 15,
  [SITE_ZONE_PLAN_PATH_SERVICE_NAME]: 15,
  [SITE_COVERAGE_PREVIEW_SERVICE_NAME]: 15,
  [SITE_COVERAGE_COMMIT_SERVICE_NAME]: 15,
  [SITE_NO_GO_AREA_SERVICE_NAME]: 15,
  [SITE_VIRTUAL_WALL_SERVICE_NAME]: 15,
  '/rosapi/topic_type': 15,
  '/rosapi/publishers': 15,
  '/rosapi/subscribers': 15,
}

const ROS_RECONNECT_DELAY_MS = 2000
const ROS_CONNECT_TIMEOUT_MS = 6000
const MCORE_CONNECTED_TOPIC = '/mcore_tcp_bridge/connected'
const MCORE_CONNECTED_TOPIC_TYPE = 'std_msgs/Bool'
const STATION_CONNECTED_TOPIC = '/station_tcp_bridge/connected'
const STATION_CONNECTED_TOPIC_TYPE = 'std_msgs/Bool'
const ACTUATOR_STATUS_STALE_AFTER_MS = 30_000
const MCORE_CONNECTED_STALE_AFTER_MS = 5_000
const STATION_CONNECTED_STALE_AFTER_MS = 5_000

class NodeWebSocketTransport extends AbstractTransport {
  constructor(socket) {
    super()
    this.socket = socket

    this.socket.on('open', (event) => {
      this.emit('open', event)
    })
    this.socket.on('close', (code, reason) => {
      this.emit('close', { code, reason })
    })
    this.socket.on('error', (error) => {
      this.emit('error', error)
    })
    this.socket.on('message', (data) => {
      this.handleRawMessage(data)
    })
  }

  send(message) {
    this.socket.send(JSON.stringify(message))
  }

  close() {
    this.socket.close()
  }

  isConnecting() {
    return this.socket.readyState === WebSocket.CONNECTING
  }

  isOpen() {
    return this.socket.readyState === WebSocket.OPEN
  }

  isClosing() {
    return this.socket.readyState === WebSocket.CLOSING
  }

  isClosed() {
    return this.socket.readyState === WebSocket.CLOSED
  }
}

async function createNodeWebSocketTransport(url) {
  const socket = new WebSocket(url)
  socket.binaryType = 'arraybuffer'
  return new NodeWebSocketTransport(socket)
}

function formatRosConnectionError(error) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string' && error.message) {
      return error.message
    }

    if ('type' in error && typeof error.type === 'string' && error.type) {
      return error.type
    }

    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== '{}') {
        return serialized
      }
    } catch {
      // Fall through to the generic string conversion below.
    }
  }

  return String(error)
}

function removeRosListener(ros, eventName, listener) {
  if (typeof ros.off === 'function') {
    ros.off(eventName, listener)
    return
  }

  ros.removeListener(eventName, listener)
}

const ROSAPI_SERVICE_TYPE_NAME = '/rosapi/service_type'
const ROSAPI_SERVICE_TYPE = 'rosapi/ServiceType'
const ROSAPI_TOPIC_TYPE_SERVICE = '/rosapi/topic_type'
const ROSAPI_TOPIC_TYPE = 'rosapi/TopicType'
const ROSAPI_PUBLISHERS_SERVICE = '/rosapi/publishers'
const ROSAPI_PUBLISHERS_TYPE = 'rosapi/Publishers'
const ROSAPI_SUBSCRIBERS_SERVICE = '/rosapi/subscribers'
const ROSAPI_SUBSCRIBERS_TYPE = 'rosapi/Subscribers'

function createManagedServiceDefinition(canonical) {
  return { canonical }
}

const TASK_SERVICE = createManagedServiceDefinition({
  serviceName: TASK_SERVICE_NAME,
})
const TASK_OPERATIONS = { get: 0, add: 1, modify: 2, delete: 3, getAll: 4 }
const TASK_ENABLED_STATE = { keep: 0, disable: 1, enable: 2 }
const TASK_RETURN_TO_DOCK_STATE = { keep: 0, disable: 1, enable: 2 }
const TASK_REPEAT_AFTER_FULL_CHARGE_STATE = { keep: 0, disable: 1, enable: 2 }

const SCHEDULE_SERVICE = createManagedServiceDefinition({
  serviceName: SCHEDULE_SERVICE_NAME,
})
const SCHEDULE_OPERATIONS = { get: 0, add: 1, modify: 2, delete: 3, getAll: 4 }
const SCHEDULE_ENABLED_STATE = { keep: 0, disable: 1, enable: 2 }

const EXECUTION_SERVICE = createManagedServiceDefinition({
  serviceName: EXECUTION_SERVICE_NAME,
})
const EXECUTION_COMMANDS = { START: 0, PAUSE: 1, CONTINUE: 2, STOP: 3, RETURN: 4 }
const DOCK_CALIBRATION_STATUS_SERVICE = createManagedServiceDefinition({
  serviceName: DOCK_CALIBRATION_STATUS_SERVICE_NAME,
  serviceType: 'cleanrobot_app_msgs/GetDockCalibrationStatus',
})
const DOCK_CALIBRATION_COMMAND_SERVICE = createManagedServiceDefinition({
  serviceName: DOCK_CALIBRATION_COMMAND_SERVICE_NAME,
  serviceType: 'cleanrobot_app_msgs/OperateDockCalibration',
})
const DOCK_CALIBRATION_OPERATIONS = new Set([0, 1, 2, 3, 4, 5])
const MANUAL_DRIVE_COMMAND_SERVICE = createManagedServiceDefinition({
  serviceName: '/clean_robot_server/app/manual_drive_command',
  serviceType: 'cleanrobot_app_msgs/ManualDriveCommand',
})
const MANUAL_DRIVE_STATUS_SERVICE = createManagedServiceDefinition({
  serviceName: '/clean_robot_server/app/get_manual_drive_status',
  serviceType: 'cleanrobot_app_msgs/GetManualDriveStatus',
})
const MANUAL_DRIVE_DIRECTIONS = new Set(['forward', 'backward', 'turn_left', 'turn_right'])
const SUBMIT_SLAM_SERVICE = createManagedServiceDefinition({
  serviceName: SLAM_SUBMIT_SERVICE_NAME,
})
const LIVE_MAP_TOPIC_NAME = '/map'
const LIVE_MAP_TOPIC_TYPE = 'nav_msgs/OccupancyGrid'
const LIVE_MAP_THROTTLE_MS = 500
const MAP_SERVICE = createManagedServiceDefinition({
  serviceName: MAP_SERVICE_NAME,
  serviceType: 'cleanrobot_app_msgs/OperateMap',
})
const ALIGNMENT_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_ALIGNMENT_SERVICE_NAME,
})
const ALIGNMENT_BY_POINTS_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_ALIGNMENT_BY_POINTS_SERVICE_NAME,
})
const RECT_ZONE_PREVIEW_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_RECT_ZONE_PREVIEW_SERVICE_NAME,
})
const COVERAGE_ZONE_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_COVERAGE_ZONE_SERVICE_NAME,
})
const ZONE_PLAN_PATH_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_ZONE_PLAN_PATH_SERVICE_NAME,
})
const COVERAGE_PREVIEW_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_COVERAGE_PREVIEW_SERVICE_NAME,
})
const COVERAGE_COMMIT_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_COVERAGE_COMMIT_SERVICE_NAME,
})
const NO_GO_AREA_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_NO_GO_AREA_SERVICE_NAME,
})
const VIRTUAL_WALL_SERVICE = createManagedServiceDefinition({
  serviceName: SITE_VIRTUAL_WALL_SERVICE_NAME,
})
const MAP_OPERATIONS = {
  get: 0,
  add: 1,
  modify: 2,
  delete: 3,
  getAll: 4,
  hardDelete: 5,
  cleanupDisabled: 6,
}
const ALIGNMENT_OPERATIONS = { get: 0 }
const ZONE_OPERATIONS = { get: 0, getAll: 1, delete: 2 }
const CONSTRAINT_OPERATIONS = { get: 0, getAll: 1, add: 2, modify: 3, delete: 4 }
const SLAM_OPERATIONS = {
  get_status: 0,
  switch_map: 7,
  relocalize: 8,
  restart_localization: 8,
  start_mapping: 3,
  save_mapping: 4,
  stop_mapping: 5,
  prepare_for_task: 6,
  verify_map_revision: 9,
  activate_map_revision: 10,
}
const READ_CACHE_TTL_MS = {
  capabilities: 10_000,
  maps: 10_000,
  currentMap: 10_000,
  tasks: 5_000,
  taskDetail: 5_000,
  readiness: 750,
  odometry: 1_000,
  slamState: 1_000,
  slamJob: 1_000,
  topicMeta: 30_000,
}

const MANAGED_TOPIC_CONFIGS = {
  slamState: {
    topicName: SLAM_STATE_TOPIC_NAME,
    messageType: SLAM_STATE_TOPIC_TYPE,
    normalize: normalizeSlamWorkflowState,
  },
  slamJob: {
    topicName: SLAM_JOB_TOPIC_NAME,
    messageType: SLAM_JOB_TOPIC_TYPE,
    normalize: normalizeSlamWorkflowJob,
  },
  odometry: {
    topicName: ODOMETRY_STATE_TOPIC_NAME,
    messageType: ODOMETRY_STATE_TOPIC_TYPE,
    normalize: normalizeOdometryState,
  },
  systemReadiness: {
    topicName: SYSTEM_READINESS_TOPIC_NAME,
    messageType: SYSTEM_READINESS_TOPIC_TYPE,
    normalize: normalizeSystemReadiness,
  },
  ...Object.fromEntries(
    RUNTIME_TOPIC_CONFIGS.map((config) => [
      config.key,
      {
        topicName: config.topicName,
        messageType: '',
        normalize: normalizeRuntimeTopicPayload,
      },
    ]),
  ),
  mcoreConnected: {
    topicName: MCORE_CONNECTED_TOPIC,
    messageType: MCORE_CONNECTED_TOPIC_TYPE,
    normalize: normalizeRuntimeTopicPayload,
  },
  stationConnected: {
    topicName: STATION_CONNECTED_TOPIC,
    messageType: STATION_CONNECTED_TOPIC_TYPE,
    normalize: normalizeRuntimeTopicPayload,
  },
}

function createManagedTopicState() {
  return {
    receivedAtMs: null,
    messageCount: 0,
    payload: null,
    subscribeError: null,
  }
}

function normalizeRuntimeTopicPayload(value) {
  return isRecord(value) ? value : { value }
}

async function resolveManagedServiceCall(gateway, serviceDefinition) {
  const resolveServiceType = async (service) => {
    if (!service) {
      return ''
    }

    if (typeof service.serviceType === 'string' && service.serviceType.trim().length > 0) {
      return service.serviceType
    }

    return gateway.getServiceType(service.serviceName)
  }

  const canonicalType = await resolveServiceType(serviceDefinition.canonical)
  if (canonicalType) {
    return {
      serviceName: serviceDefinition.canonical.serviceName,
      serviceType: canonicalType,
    }
  }

  throw new Error(
    `ROS service ${serviceDefinition.canonical.serviceName} is unavailable.`,
  )
}

async function callManagedService(gateway, serviceDefinition, request) {
  const target = await resolveManagedServiceCall(gateway, serviceDefinition)

  return gateway.callService({
    serviceName: target.serviceName,
    serviceType: target.serviceType,
    request,
  })
}

async function callSuccessfulManagedService(
  gateway,
  serviceDefinition,
  request,
  fallbackMessage,
) {
  const payload = await callManagedService(gateway, serviceDefinition, request)

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, fallbackMessage)
  }

  return payload
}

function isNotFoundMessage(message) {
  const normalized = typeof message === 'string' ? message.trim().toLowerCase() : ''
  return normalized.includes('not found') || normalized.includes('no active alignment')
}

function extractRecordList(payload, candidateKeys) {
  const records = Array.isArray(payload)
    ? payload.filter((item) => isRecord(item))
    : findFirstValue(
        payload,
        candidateKeys,
        (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
      ) ?? []

  return Array.isArray(records) ? records.filter((item) => isRecord(item)) : []
}

function extractFirstRecord(payload, candidateKeys, directKeys = []) {
  if (isRecord(payload)) {
    if (directKeys.some((key) => key in payload)) {
      return payload
    }

    for (const key of candidateKeys) {
      if (isRecord(payload[key])) {
        return payload[key]
      }
    }
  }

  const fallback = findFirstValue(payload, candidateKeys, (value) => isRecord(value))
  return isRecord(fallback) ? fallback : null
}

function getConstraintVersion(payload) {
  return isRecord(payload) ? pickString(payload, ['constraint_version']) || null : null
}

function getWarnings(payload) {
  return toStringArray(isRecord(payload) ? pickValue(payload, ['warnings']) : [])
}

function normalizeProfileCatalogEntries(payload) {
  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Profile catalog query returned an error.')
  }

  const profiles = Array.isArray(payload)
    ? payload.filter((item) => isRecord(item))
    : isRecord(payload) && Array.isArray(payload.profiles)
      ? payload.profiles.filter((item) => isRecord(item))
      : null

  if (!profiles) {
    return null
  }

  return profiles
    .map((record) => normalizeProfileEntry(record))
    .filter((entry) => entry.profileName.length > 0)
}

function normalizeSystemReadinessServiceResult(payload) {
  if (!isRecord(payload)) {
    return null
  }

  const success = toBoolean(payload.success)
  const message = typeof payload.message === 'string' ? payload.message : ''
  const readinessSource = 'readiness' in payload ? payload.readiness : payload
  const readiness = normalizeSystemReadiness(readinessSource)

  if (success === false) {
    return {
      success,
      message,
      readiness,
      raw: payload,
    }
  }

  if (!readiness) {
    return null
  }

  return {
    success: success ?? true,
    message,
    readiness,
    raw: payload,
  }
}

function normalizeOdometryServiceResult(payload) {
  if (!isRecord(payload)) {
    return null
  }

  const success = typeof payload.success === 'boolean' ? payload.success : null
  const message = typeof payload.message === 'string' ? payload.message : ''
  const stateSource = 'state' in payload ? payload.state : payload
  const state = normalizeOdometryState(stateSource)

  if (success === false) {
    return {
      success,
      message,
      state,
      raw: payload,
    }
  }

  if (!state) {
    return null
  }

  return {
    success: success ?? true,
    message,
    state,
    raw: payload,
  }
}

function normalizePbstreamMapName(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''

  if (!trimmed) {
    return { ok: false, fileName: '', message: 'Please provide a saved pbstream map name.' }
  }

  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return {
      ok: false,
      fileName: '',
      message: 'Map name cannot include path separators or parent directory segments.',
    }
  }

  const fileName = trimmed.endsWith(PBSTREAM_EXTENSION)
    ? trimmed
    : `${trimmed}${PBSTREAM_EXTENSION}`

  return { ok: true, fileName, message: '' }
}

export class RosGateway {
  constructor(siteConfig) {
    this.siteConfig = siteConfig
    this.ros = null
    this.connectPromise = null
    this.reconnectTimer = null
    this.lastActuatorCommand = null
    this.publisherCache = new Map()
    this.serviceTypeCache = new Map()
    this.readCache = new Map()
    this.managedTopics = new Map()
    this.managedTopicStates = new Map(
      Object.keys(MANAGED_TOPIC_CONFIGS).map((key) => [key, createManagedTopicState()]),
    )
    this.liveMapTopic = null
    this.liveMapSnapshot = {
      receivedAtMs: null,
      messageCount: 0,
      payload: null,
      error: null,
    }
    this.snapshot = {
      status: 'idle',
      url: siteConfig.rosbridgeUrl,
      isConnected: false,
      lastError: null,
      connectedAt: null,
      sessionId: 0,
    }
  }

  getConnectionSnapshot() {
    return { ...this.snapshot }
  }

  patchSnapshot(patch) {
    this.snapshot = { ...this.snapshot, ...patch }
  }

  clearReadCache() {
    this.readCache.clear()
  }

  resetLiveMapSnapshot() {
    this.liveMapSnapshot = {
      receivedAtMs: null,
      messageCount: 0,
      payload: null,
      error: null,
    }
  }

  resetManagedTopicStates() {
    this.managedTopicStates = new Map(
      Object.keys(MANAGED_TOPIC_CONFIGS).map((key) => [key, createManagedTopicState()]),
    )
  }

  teardownLiveMapSubscription() {
    if (!this.liveMapTopic) {
      return
    }

    try {
      this.liveMapTopic.unsubscribe()
    } catch {
      // Ignore unsubscribe errors during teardown.
    }

    this.liveMapTopic = null
  }

  teardownManagedTopicSubscriptions() {
    for (const topic of this.managedTopics.values()) {
      try {
        topic.unsubscribe()
      } catch {
        // Ignore unsubscribe errors during teardown.
      }
    }

    this.managedTopics.clear()
  }

  invalidateReadCache(prefixes = []) {
    if (prefixes.length === 0) {
      this.clearReadCache()
      return
    }

    for (const key of Array.from(this.readCache.keys())) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        this.readCache.delete(key)
      }
    }
  }

  async readThroughCache(key, ttlMs, loader) {
    if (ttlMs <= 0) {
      return loader()
    }

    const now = Date.now()
    const cached = this.readCache.get(key)

    if (cached && cached.expiresAt > now && cached.value !== undefined) {
      return cached.value
    }

    if (cached?.promise) {
      return cached.promise
    }

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        this.readCache.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
        })
        return value
      })
      .catch((error) => {
        const pending = this.readCache.get(key)

        if (pending?.promise === promise) {
          this.readCache.delete(key)
        }

        throw error
      })

    this.readCache.set(key, {
      value: cached?.value,
      expiresAt: cached?.expiresAt ?? 0,
      promise,
    })

    return promise
  }

  attachRos(ros) {
    ros.on('connection', () => {
      if (ros !== this.ros) {
        return
      }

      this.clearReconnectTimer()
      this.clearReadCache()
      this.resetManagedTopicStates()
      this.resetLiveMapSnapshot()
      this.patchSnapshot({
        status: 'connected',
        url: this.siteConfig.rosbridgeUrl,
        isConnected: true,
        lastError: null,
        connectedAt: Date.now(),
        sessionId: this.snapshot.sessionId + 1,
      })
    })

    ros.on('close', () => {
      if (ros !== this.ros) {
        return
      }

      this.clearReadCache()
      this.teardownManagedTopicSubscriptions()
      this.resetManagedTopicStates()
      this.teardownLiveMapSubscription()
      this.resetLiveMapSnapshot()
      this.ros = null
      this.patchSnapshot({
        status: 'closed',
        url: this.siteConfig.rosbridgeUrl,
        isConnected: false,
      })
      this.scheduleReconnect()
    })

    ros.on('error', (error) => {
      if (ros !== this.ros) {
        return
      }

      this.clearReadCache()
      this.teardownManagedTopicSubscriptions()
      this.resetManagedTopicStates()
      this.teardownLiveMapSubscription()
      this.resetLiveMapSnapshot()
      this.patchSnapshot({
        status: 'error',
        url: this.siteConfig.rosbridgeUrl,
        isConnected: false,
        lastError: formatRosConnectionError(error),
      })
      this.scheduleReconnect()
    })
  }

  ensureRos() {
    if (!this.ros) {
      this.ros = new Ros({ transportFactory: createNodeWebSocketTransport })
      this.attachRos(this.ros)
    }

    return this.ros
  }

  clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return
    }

    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect().catch(() => {
        this.scheduleReconnect()
      })
    }, ROS_RECONNECT_DELAY_MS)
  }

  async waitForRosConnection(ros) {
    if (ros.isConnected) {
      return
    }

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        removeRosListener(ros, 'connection', handleConnection)
        removeRosListener(ros, 'error', handleError)
        removeRosListener(ros, 'close', handleClose)
      }

      const handleConnection = () => {
        cleanup()
        resolve()
      }

      const handleError = (error) => {
        cleanup()
        reject(new Error(formatRosConnectionError(error)))
      }

      const handleClose = () => {
        cleanup()
        reject(new Error('rosbridge connection closed before it became ready.'))
      }

      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('Timed out waiting for rosbridge connection.'))
      }, ROS_CONNECT_TIMEOUT_MS)

      ros.once('connection', handleConnection)
      ros.once('error', handleError)
      ros.once('close', handleClose)
    })
  }

  async connect() {
    if (this.snapshot.status === 'connected' && this.ros?.isConnected) {
      return
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.clearReconnectTimer()
    const ros = this.ensureRos()
    this.patchSnapshot({
      status: 'connecting',
      url: this.siteConfig.rosbridgeUrl,
      isConnected: false,
      lastError: null,
    })

    this.connectPromise = Promise.resolve(ros.connect(this.siteConfig.rosbridgeUrl))
      .then(() => this.waitForRosConnection(ros))
      .finally(() => {
        this.connectPromise = null
      })

    return this.connectPromise
  }

  disconnect() {
    this.clearReconnectTimer()
    this.connectPromise = null
    this.teardownManagedTopicSubscriptions()
    this.teardownLiveMapSubscription()
    const ros = this.ros
    this.ros = null
    ros?.close()
  }

  async reconnect() {
    this.disconnect()
    this.resetManagedTopicStates()
    this.resetLiveMapSnapshot()
    await this.connect()
    return this.getConnectionSnapshot()
  }

  async ensureConnected() {
    if (this.ros?.isConnected && this.snapshot.status === 'connected') {
      return
    }

    await this.connect()

    if (!this.ros?.isConnected) {
      throw new Error(this.snapshot.lastError ?? 'rosbridge is not connected.')
    }
  }

  async callService({
    serviceName,
    serviceType = DEFAULT_SERVICE_TYPE,
    request = {},
    timeoutSeconds = SERVICE_TIMEOUT_OVERRIDES[serviceName] ?? DEFAULT_TIMEOUT_SECONDS,
  }) {
    await this.ensureConnected()

    return new Promise((resolve, reject) => {
      const service = new Service({
        ros: this.ros,
        name: serviceName,
        serviceType,
      })

      let settled = false
      let timeoutHandle = null

      const complete = (handler) => {
        if (settled) {
          return
        }

        settled = true

        if (timeoutHandle) {
          globalThis.clearTimeout(timeoutHandle)
        }

        handler()
      }

      if (timeoutSeconds > 0) {
        timeoutHandle = globalThis.setTimeout(() => {
          complete(() => {
            reject(
              new Error(`ROS service ${serviceName} timed out after ${timeoutSeconds} seconds.`),
            )
          })
        }, timeoutSeconds * 1000 + 500)
      }

      try {
        service.callService(
          request,
          (response) => complete(() => resolve(response)),
          (error) =>
            complete(() => reject(new Error(error instanceof Error ? error.message : String(error)))),
          timeoutSeconds,
        )
      } catch (error) {
        complete(() => reject(error instanceof Error ? error : new Error(String(error))))
      }
    })
  }

  async publish(topicName, messageType, payload) {
    await this.ensureConnected()

    let topic = this.publisherCache.get(topicName)
    if (!topic) {
      topic = new Topic({
        ros: this.ros,
        name: topicName,
        messageType,
        queue_size: 1,
        latch: false,
        reconnect_on_close: true,
      })
      this.publisherCache.set(topicName, topic)
    }

    topic.publish(payload)
  }

  async getTopicMetaCached(topicName, options = {}) {
    const includeEndpointInfo = options.includeEndpointInfo !== false
    return this.readThroughCache(
      `topicMeta:${topicName}:${includeEndpointInfo ? 'full' : 'typeOnly'}`,
      READ_CACHE_TTL_MS.topicMeta,
      () => this.fetchTopicMeta(topicName, { includeEndpointInfo }),
    )
  }

  async ensureManagedTopicSubscription(topicKey) {
    await this.ensureConnected()

    if (this.managedTopics.has(topicKey)) {
      return
    }

    const config = MANAGED_TOPIC_CONFIGS[topicKey]
    if (!config) {
      throw new Error(`Unsupported managed topic key: ${topicKey}`)
    }

    const resolvedMessageType =
      typeof config.messageType === 'string' && config.messageType.trim().length > 0
        ? config.messageType
        : (await this.getTopicMetaCached(config.topicName, { includeEndpointInfo: false }))
            .messageType

    const topic = new Topic({
      ros: this.ros,
      name: config.topicName,
      messageType: resolvedMessageType,
      queue_length: 1,
      throttle_rate: 0,
      reconnect_on_close: true,
    })

    topic.on('warning', (warning) => {
      const previous = this.managedTopicStates.get(topicKey) ?? createManagedTopicState()
      this.managedTopicStates.set(topicKey, {
        ...previous,
        subscribeError: warning instanceof Error ? warning.message : String(warning),
      })
    })

    topic.subscribe((message) => {
      const previous = this.managedTopicStates.get(topicKey) ?? createManagedTopicState()

      this.managedTopicStates.set(topicKey, {
        receivedAtMs: Date.now(),
        messageCount: previous.messageCount + 1,
        payload: config.normalize(message),
        subscribeError: null,
      })
    })

    this.managedTopics.set(topicKey, topic)
  }

  async getManagedTopicSnapshot(topicKey, options = {}) {
    const config = MANAGED_TOPIC_CONFIGS[topicKey]
    if (!config) {
      throw new Error(`Unsupported managed topic key: ${topicKey}`)
    }

    await this.ensureManagedTopicSubscription(topicKey)
    const meta = await this.getTopicMetaCached(config.topicName, options)
    const state = this.managedTopicStates.get(topicKey) ?? createManagedTopicState()

    return {
      topicName: config.topicName,
      messageType: meta.messageType || config.messageType,
      publishers: meta.publishers,
      subscribers: meta.subscribers,
      metaError: meta.metaError,
      subscribeError: state.subscribeError,
      messageCount: state.messageCount,
      lastMessageAt: state.receivedAtMs,
      payload: state.payload,
    }
  }

  async getSlamStateTopicSnapshot() {
    return this.getManagedTopicSnapshot('slamState')
  }

  async getSlamJobTopicSnapshot() {
    return this.getManagedTopicSnapshot('slamJob')
  }

  async getOdometryTopicSnapshot() {
    return this.getManagedTopicSnapshot('odometry')
  }

  async getSystemReadinessTopicSnapshot() {
    return this.getManagedTopicSnapshot('systemReadiness')
  }

  async getRuntimeTopicSnapshots(options = {}) {
    const topicKeys =
      Array.isArray(options.topicKeys) && options.topicKeys.length > 0
        ? options.topicKeys.filter((key) => RUNTIME_TOPIC_CONFIGS.some((config) => config.key === key))
        : RUNTIME_TOPIC_CONFIGS.map((config) => config.key)
    const includeEndpointInfo = options.includeEndpointInfo !== false

    const entries = await Promise.all(
      topicKeys.map(async (key) => [
        key,
        await this.getManagedTopicSnapshot(key, { includeEndpointInfo }),
      ]),
    )

    return Object.fromEntries(entries)
  }

  async ensureLiveMapSubscription() {
    await this.ensureConnected()

    if (this.liveMapTopic) {
      return
    }

    const topic = new Topic({
      ros: this.ros,
      name: LIVE_MAP_TOPIC_NAME,
      messageType: LIVE_MAP_TOPIC_TYPE,
      queue_length: 1,
      throttle_rate: LIVE_MAP_THROTTLE_MS,
      reconnect_on_close: true,
    })

    topic.on('warning', (warning) => {
      this.liveMapSnapshot = {
        ...this.liveMapSnapshot,
        error: warning instanceof Error ? warning.message : String(warning),
      }
    })

    topic.subscribe((message) => {
      if (!isRecord(message)) {
        return
      }

      this.liveMapSnapshot = {
        receivedAtMs: Date.now(),
        messageCount: this.liveMapSnapshot.messageCount + 1,
        payload: message,
        error: null,
      }
    })

    this.liveMapTopic = topic
  }

  async getLiveMapSnapshot(afterMs = 0) {
    await this.ensureLiveMapSubscription()

    const receivedAtMs =
      typeof this.liveMapSnapshot.receivedAtMs === 'number'
        ? this.liveMapSnapshot.receivedAtMs
        : null
    const changed =
      receivedAtMs !== null &&
      receivedAtMs > Math.max(0, Math.floor(afterMs)) &&
      isRecord(this.liveMapSnapshot.payload)

    return {
      changed,
      available: isRecord(this.liveMapSnapshot.payload),
      receivedAtMs,
      messageCount: this.liveMapSnapshot.messageCount,
      payload: changed ? this.liveMapSnapshot.payload : null,
      error: this.liveMapSnapshot.error,
    }
  }

  async getServiceType(serviceName) {
    const cachedType = this.serviceTypeCache.get(serviceName)
    if (cachedType) {
      return cachedType
    }

    const payload = await this.callService({
      serviceName: ROSAPI_SERVICE_TYPE_NAME,
      serviceType: ROSAPI_SERVICE_TYPE,
      request: { service: serviceName },
    })

    const resolvedType =
      isRecord(payload) && typeof payload.type === 'string' ? payload.type : ''

    if (resolvedType) {
      this.serviceTypeCache.set(serviceName, resolvedType)
    }

    return resolvedType
  }

  async fetchTopicMeta(topicName, options = {}) {
    try {
      const includeEndpointInfo = options.includeEndpointInfo !== false
      const typePayload = await this.callService({
        serviceName: ROSAPI_TOPIC_TYPE_SERVICE,
        serviceType: ROSAPI_TOPIC_TYPE,
        request: { topic: topicName },
      })

      let publishersPayload = null
      let subscribersPayload = null

      if (includeEndpointInfo) {
        ;[publishersPayload, subscribersPayload] = await Promise.all([
          this.callService({
            serviceName: ROSAPI_PUBLISHERS_SERVICE,
            serviceType: ROSAPI_PUBLISHERS_TYPE,
            request: { topic: topicName },
          }),
          this.callService({
            serviceName: ROSAPI_SUBSCRIBERS_SERVICE,
            serviceType: ROSAPI_SUBSCRIBERS_TYPE,
            request: { topic: topicName },
          }),
        ])
      }

      const messageType =
        isRecord(typePayload) && typeof typePayload.type === 'string' ? typePayload.type : ''

      return {
        messageType,
        publishers: includeEndpointInfo
          ? isRecord(publishersPayload) && Array.isArray(publishersPayload.publishers)
            ? publishersPayload.publishers.filter((item) => typeof item === 'string')
            : []
          : messageType
            ? ['type-only']
            : [],
        subscribers:
          includeEndpointInfo &&
          isRecord(subscribersPayload) &&
          Array.isArray(subscribersPayload.subscribers)
            ? subscribersPayload.subscribers.filter((item) => typeof item === 'string')
            : [],
        metaError: null,
      }
    } catch (error) {
      return {
        messageType: '',
        publishers: [],
        subscribers: [],
        metaError: error instanceof Error ? error.message : 'topic metadata failed',
      }
    }
  }
}

function buildDisconnectedCapabilities(grantedCapabilities) {
  return CAPABILITY_FLAGS.reduce((result, key) => {
    const enabled = grantedCapabilities.includes(key)
    const dependencies = [
      ...flattenServiceDependencyLabels(SERVICE_DEPENDENCIES[key] ?? []),
      ...(TOPIC_DEPENDENCIES[key] ?? []),
    ]

    result[key] = {
      key,
      title: CAPABILITY_TITLES[key],
      summary:
        key === 'overview'
          ? 'Site Gateway is running.'
          : enabled
            ? 'Waiting for the upstream ROS session before probing dependencies.'
            : 'This capability is not enabled for the current role or module config.',
      status: key === 'overview' ? 'available' : enabled ? 'checking' : 'disabled',
      dependencies,
      source: enabled ? 'gateway' : 'config',
      missingDependency: null,
    }

    return result
  }, {})
}

RosGateway.prototype.getCapabilityStatuses = async function getCapabilityStatuses(
  grantedCapabilities,
) {
  const capabilityMap = buildDisconnectedCapabilities(grantedCapabilities)

  try {
    await this.ensureConnected()
  } catch {
    return capabilityMap
  }

  await Promise.all(
    CAPABILITY_FLAGS.filter(
      (key) => key !== 'overview' && capabilityMap[key].status !== 'disabled',
    ).map(async (key) => {
      const serviceDependencies = SERVICE_DEPENDENCIES[key] ?? []
      const topicDependencies = TOPIC_DEPENDENCIES[key] ?? []

      const serviceResults = await Promise.all(
        serviceDependencies.map(async (dependency) => {
          const optionResults = await Promise.all(
            dependency.probeNames.map(async (serviceName) => {
              try {
                const serviceType = await this.getServiceType(serviceName)
                return {
                  serviceName,
                  exists: serviceType.length > 0,
                  detail: serviceType || 'service not found',
                }
              } catch (error) {
                return {
                  serviceName,
                  exists: false,
                  detail: error instanceof Error ? error.message : 'service probe failed',
                }
              }
            }),
          )

          const matched = optionResults.find((result) => result.exists)

          return {
            name: dependency.label,
            exists: Boolean(matched),
            detail: matched?.detail ?? optionResults[0]?.detail ?? 'service probe failed',
            preferredServiceName: dependency.preferredServiceName,
          }
        }),
      )

      const topicResults = await Promise.all(
        topicDependencies.map(async (topicName) => {
          const meta = await this.fetchTopicMeta(topicName)
          return {
            name: topicName,
            exists: meta.messageType.length > 0,
            detail: meta.messageType || meta.metaError || 'topic type unavailable',
          }
        }),
      )

      const missingService = serviceResults.find((item) => !item.exists)
      const missingTopic = topicResults.find((item) => !item.exists)

      if (missingService && key === 'executionControl') {
        capabilityMap[key] = {
          ...capabilityMap[key],
          status: 'degraded',
          summary: `Dependency probe failed: ${missingService.name} - ${missingService.detail}`,
          source: 'gateway',
          missingDependency: missingService.name,
        }
        return
      }

      if (missingService) {
        capabilityMap[key] = {
          ...capabilityMap[key],
          status: 'missing',
          summary: `Missing service: ${missingService.name}`,
          source: 'gateway',
          missingDependency: missingService.name,
        }
        return
      }

      if (missingTopic) {
        capabilityMap[key] = {
          ...capabilityMap[key],
          status: 'degraded',
          summary: `Missing live topic: ${missingTopic.name}`,
          source: 'gateway',
          missingDependency: missingTopic.name,
        }
        return
      }

      capabilityMap[key] = {
        ...capabilityMap[key],
        status: 'available',
        summary: 'Dependencies passed Site Gateway probing.',
        source: 'gateway',
        missingDependency: null,
      }
    }),
  )

  return capabilityMap
}

RosGateway.prototype.getRuntimeTopicMetas = async function getRuntimeTopicMetas() {
  const entries = await Promise.all(
    RUNTIME_TOPIC_CONFIGS.map(async (config) => [
      config.key,
      await this.fetchTopicMeta(config.topicName),
    ]),
  )

  return Object.fromEntries(entries)
}

function pickStringList(record, keys) {
  const value = pickValue(record, keys)

  if (Array.isArray(value)) {
    return toStringArray(value)
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(/\r?\n|[,|]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  return []
}

function pickCount(record, keys) {
  return toNumber(pickValue(record, keys)) ?? 0
}

function pickJsonSummary(record, keys) {
  const value = pickValue(record, keys)

  if (typeof value === 'string') {
    return value.trim()
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }

  return ''
}

function normalizeMapAssetCleanupResult(payload) {
  const record = isRecord(payload) ? payload : {}

  return {
    success: getResponseSuccess(record) !== false,
    message: pickString(record, ['message']) || '',
    maps: normalizeMapCatalogList(record),
    dryRun: Boolean(toBoolean(pickValue(record, ['dry_run', 'dryRun']))),
    cascade: Boolean(toBoolean(pickValue(record, ['cascade']))),
    candidateCount: pickCount(record, ['candidate_count', 'candidateCount']),
    deletedCount: pickCount(record, ['deleted_count', 'deletedCount']),
    reclaimableBytes: pickCount(record, ['reclaimable_bytes', 'reclaimableBytes']),
    reclaimedBytes: pickCount(record, ['reclaimed_bytes', 'reclaimedBytes']),
    affectedZonesCount: pickCount(record, ['affected_zones_count', 'affectedZonesCount']),
    affectedPlansCount: pickCount(record, ['affected_plans_count', 'affectedPlansCount']),
    affectedTasksCount: pickCount(record, ['affected_tasks_count', 'affectedTasksCount']),
    affectedSchedulesCount: pickCount(record, [
      'affected_schedules_count',
      'affectedSchedulesCount',
    ]),
    affectedZoneVersionsCount: pickCount(record, [
      'affected_zone_versions_count',
      'affectedZoneVersionsCount',
    ]),
    confirmToken: pickString(record, ['confirm_token', 'confirmToken']) || '',
    deletedBusinessRefs: pickJsonSummary(record, [
      'deleted_business_refs',
      'deletedBusinessRefs',
    ]),
    deletedPaths: pickStringList(record, ['deleted_paths', 'deletedPaths']),
    blockedReasons: pickStringList(record, ['blocked_reasons', 'blockedReasons']),
    raw: record,
  }
}

function normalizeMapSoftDeleteResult(payload) {
  const record = isRecord(payload) ? payload : {}
  const mapRecord = isRecord(record.map) ? normalizeMapCatalogEntry(record.map) : null

  return {
    success: getResponseSuccess(record) !== false,
    message: pickString(record, ['message']) || '',
    map: mapRecord,
    blockedReasons: pickStringList(record, ['blocked_reasons', 'blockedReasons']),
    raw: record,
  }
}

RosGateway.prototype.listMaps = async function listMaps() {
  return this.readThroughCache('maps:list', READ_CACHE_TTL_MS.maps, async () => {
    const payload = await callManagedService(this, MAP_SERVICE, {
      operation: MAP_OPERATIONS.getAll,
      map_name: '',
      map: {},
      set_active: false,
      enabled_state: 0,
    })

    if (getResponseSuccess(payload) === false) {
      throw createServiceError(payload, 'Map catalog query returned an error.')
    }

    return normalizeMapCatalogList(payload)
  })
}

RosGateway.prototype.getCurrentMapRecord = async function getCurrentMapRecord() {
  return this.readThroughCache('maps:current', READ_CACHE_TTL_MS.currentMap, async () => {
    const getAllPayload = await callManagedService(this, MAP_SERVICE, {
      operation: MAP_OPERATIONS.getAll,
      map_name: '',
      map: {},
      set_active: false,
      enabled_state: 0,
    })

    if (getResponseSuccess(getAllPayload) === false) {
      throw createServiceError(getAllPayload, 'Map service returned an error.')
    }

    const maps = Array.isArray(getAllPayload.maps)
      ? getAllPayload.maps.filter((item) => isRecord(item))
      : []
    const activeMap =
      maps.find((item) => toBoolean(item.is_active)) ??
      (isRecord(getAllPayload.map) ? getAllPayload.map : null)

    if (!activeMap) {
      throw new Error('Map service returned no active map payload.')
    }

    const mapName = pickString(activeMap, ['map_name', 'name', 'display_name'])

    if (!mapName) {
      throw new Error('Map service returned an active map with no map_name.')
    }

    const getPayload = await callManagedService(this, MAP_SERVICE, {
      operation: MAP_OPERATIONS.get,
      map_name: mapName,
      map: {},
      set_active: false,
      enabled_state: 0,
    })

    if (getResponseSuccess(getPayload) === false) {
      throw createServiceError(getPayload, `Map detail fetch failed for ${mapName}.`)
    }

    const fullMap =
      (isRecord(getPayload.map) ? getPayload.map : null) ??
      (isRecord(getPayload) ? getPayload : null)

    return fullMap ? { ...activeMap, ...fullMap } : activeMap
  })
}

RosGateway.prototype.importCurrentMapAsset = async function importCurrentMapAsset(input) {
  const mapName = typeof input?.mapName === 'string' ? input.mapName.trim() : ''

  if (!mapName) {
    throw new Error('map_name is required before importing a map asset.')
  }

  const preflight = await this.checkMapImportPreflight({ mapName })

  if (preflight.canImport === false) {
    const error = new Error(preflight.message)
    error.statusCode = 400
    error.code = preflight.status
    error.recoverable = true
    throw error
  }

  const payload = await callSuccessfulManagedService(
    this,
    MAP_SERVICE,
    {
      operation: MAP_OPERATIONS.add,
      map_name: mapName,
      map: {
        map_name: mapName,
        description:
          typeof input?.description === 'string' ? input.description.trim() : '',
      },
      set_active: input?.setActive === true,
      enabled_state: 0,
    },
    'Map import returned an error.',
  )

  this.invalidateReadCache(['maps:'])

  const mapRecord = isRecord(payload.map) ? normalizeMapCatalogEntry(payload.map) : null

  return {
    message: pickString(payload, ['message']) || 'ok',
    map: mapRecord,
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.softDeleteMapAsset = async function softDeleteMapAsset(input) {
  const mapName = typeof input?.mapName === 'string' ? input.mapName.trim() : ''
  const mapRevisionId =
    typeof input?.mapRevisionId === 'string' ? input.mapRevisionId.trim() : ''

  if (!mapName && !mapRevisionId) {
    throw new Error('map_name or map_revision_id is required before deleting a map asset.')
  }

  const payload = await callManagedService(this, MAP_SERVICE, {
    operation: MAP_OPERATIONS.delete,
    map_name: mapName,
    map: {
      map_name: mapName,
      map_revision_id: mapRevisionId,
    },
    set_active: false,
    enabled_state: 1,
  })

  const result = normalizeMapSoftDeleteResult(payload)

  if (result.success) {
    this.invalidateReadCache(['maps:'])
  }

  return result
}

RosGateway.prototype.hardDeleteMapAsset = async function hardDeleteMapAsset(input) {
  const mapName = typeof input?.mapName === 'string' ? input.mapName.trim() : ''
  const mapRevisionId =
    typeof input?.mapRevisionId === 'string' ? input.mapRevisionId.trim() : ''
  const dryRun = input?.dryRun !== false
  const cascade = input?.cascade === true
  const confirmToken =
    typeof input?.confirmToken === 'string' ? input.confirmToken.trim() : ''

  if (!mapRevisionId) {
    throw new Error('map_revision_id is required before releasing map disk space.')
  }

  const payload = await callManagedService(this, MAP_SERVICE, {
    operation: MAP_OPERATIONS.hardDelete,
    map_name: mapName,
    map: {
      map_revision_id: mapRevisionId,
    },
    dry_run: dryRun,
    cascade,
    confirm_token: confirmToken,
  })

  const result = normalizeMapAssetCleanupResult(payload)

  if (result.success && !dryRun) {
    this.invalidateReadCache(['maps:'])
  }

  return result
}

RosGateway.prototype.cleanupDisabledMapAssets = async function cleanupDisabledMapAssets(input) {
  const mapName = typeof input?.mapName === 'string' ? input.mapName.trim() : ''
  const dryRun = input?.dryRun !== false
  const confirmToken =
    typeof input?.confirmToken === 'string' ? input.confirmToken.trim() : ''

  const payload = await callManagedService(this, MAP_SERVICE, {
    operation: MAP_OPERATIONS.cleanupDisabled,
    map_name: mapName,
    dry_run: dryRun,
    min_age_days: toNumber(input?.minAgeDays) ?? 0,
    max_reclaim_bytes: toNumber(input?.maxReclaimBytes) ?? 0,
    confirm_token: confirmToken,
  })

  const result = normalizeMapAssetCleanupResult(payload)

  if (result.success && !dryRun) {
    this.invalidateReadCache(['maps:'])
  }

  return result
}

RosGateway.prototype.checkMapImportPreflight = async function checkMapImportPreflight(input) {
  const mapName = typeof input?.mapName === 'string' ? input.mapName.trim() : ''
  const normalized = normalizePbstreamMapName(mapName)
  const pbstreamDir =
    typeof this.siteConfig.mapImportPbstreamDir === 'string'
      ? this.siteConfig.mapImportPbstreamDir.trim()
      : ''

  if (!normalized.ok) {
    return {
      canImport: false,
      status: 'MAP_IMPORT_INVALID_NAME',
      message: normalized.message,
      expectedPath: null,
    }
  }

  if (!pbstreamDir) {
    return {
      canImport: false,
      status: 'MAP_IMPORT_PBSTREAM_DIR_MISSING',
      message:
        'Site Gateway has no pbstream directory configured. Set mapImportPbstreamDir before importing.',
      expectedPath: null,
    }
  }

  const expectedPath = join(pbstreamDir, normalized.fileName)

  try {
    await access(expectedPath)
  } catch {
    return {
      canImport: false,
      status: 'MAP_IMPORT_PBSTREAM_MISSING',
      message: `pbstream file is missing in the current environment: ${expectedPath}`,
      expectedPath,
    }
  }

  return {
    canImport: true,
    status: 'MAP_IMPORT_READY',
    message: `pbstream file is available: ${expectedPath}`,
    expectedPath,
  }
}

RosGateway.prototype.getMapAlignment = async function getMapAlignment(mapName) {
  const payload = await callManagedService(this, ALIGNMENT_SERVICE, {
    operation: ALIGNMENT_OPERATIONS.get,
    map_name: typeof mapName === 'string' ? mapName.trim() : '',
    alignment_version: '',
    config: {},
  })

  if (getResponseSuccess(payload) === false) {
    const message = pickString(payload, ['message'])

    if (isNotFoundMessage(message)) {
      return null
    }

    throw createServiceError(payload, 'Alignment service returned an error.')
  }

  return isRecord(payload) ? payload : null
}

RosGateway.prototype.confirmMapAlignmentByPoints =
  async function confirmMapAlignmentByPoints(request) {
    const payload = await callSuccessfulManagedService(
      this,
      ALIGNMENT_BY_POINTS_SERVICE,
      request,
      'Alignment confirm service returned an error.',
    )

    return isRecord(payload) ? payload : {}
  }

RosGateway.prototype.previewRectZoneByPoints =
  async function previewRectZoneByPoints(request) {
    const payload = await callSuccessfulManagedService(
      this,
      RECT_ZONE_PREVIEW_SERVICE,
      request,
      'Rect zone preview service returned an error.',
    )

    return isRecord(payload) ? payload : {}
  }

RosGateway.prototype.previewCoverageRegion =
  async function previewCoverageRegion(request) {
    const payload = await callSuccessfulManagedService(
      this,
      COVERAGE_PREVIEW_SERVICE,
      request,
      'Coverage preview service returned an error.',
    )

    return isRecord(payload) ? payload : {}
  }

RosGateway.prototype.commitCoverageRegion =
  async function commitCoverageRegion(request) {
    const payload = await callSuccessfulManagedService(
      this,
      COVERAGE_COMMIT_SERVICE,
      request,
      'Coverage commit service returned an error.',
    )

    return isRecord(payload) ? payload : {}
  }

RosGateway.prototype.listCoverageZones = async function listCoverageZones(mapName) {
  const payload = await callSuccessfulManagedService(
    this,
    COVERAGE_ZONE_SERVICE,
    {
      operation: ZONE_OPERATIONS.getAll,
      map_name: typeof mapName === 'string' ? mapName.trim() : '',
      zone_id: '',
      alignment_version: '',
      plan_profile_name: '',
      include_disabled: false,
    },
    'Zone service returned an error.',
  )

  return extractRecordList(payload, [
    'zones',
    'zone_list',
    'coverage_zones',
    'coverage_zone_list',
    'items',
    'list',
    'data',
  ])
}

RosGateway.prototype.getCoverageZoneDetail = async function getCoverageZoneDetail(options) {
  const payload = await callSuccessfulManagedService(
    this,
    COVERAGE_ZONE_SERVICE,
    {
      operation: ZONE_OPERATIONS.get,
      map_name: typeof options?.mapName === 'string' ? options.mapName.trim() : '',
      zone_id: typeof options?.zoneId === 'string' ? options.zoneId.trim() : '',
      alignment_version: '',
      plan_profile_name:
        typeof options?.profileName === 'string' ? options.profileName.trim() : '',
      include_disabled: true,
    },
    'Zone detail query returned an error.',
  )

  return extractFirstRecord(payload, ['zone', 'zones', 'items', 'data'], [
    'zone_id',
    'display_region',
    'display_name',
  ])
}

RosGateway.prototype.getZonePlanPath = async function getZonePlanPath(request) {
  const payload = await callSuccessfulManagedService(
    this,
    ZONE_PLAN_PATH_SERVICE,
    request,
    'Zone plan path service returned an error.',
  )

  return isRecord(payload) ? payload : {}
}

RosGateway.prototype.deleteCoverageZone = async function deleteCoverageZone(mapName, zoneId) {
  const payload = await callSuccessfulManagedService(
    this,
    COVERAGE_ZONE_SERVICE,
    {
      operation: ZONE_OPERATIONS.delete,
      map_name: typeof mapName === 'string' ? mapName.trim() : '',
      zone_id: typeof zoneId === 'string' ? zoneId.trim() : '',
      alignment_version: '',
      plan_profile_name: '',
      include_disabled: false,
    },
    'Zone delete returned an error.',
  )

  return {
    message: pickString(payload, ['message']) || 'disabled',
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.listNoGoAreas = async function listNoGoAreas(mapName) {
  const payload = await callSuccessfulManagedService(
    this,
    NO_GO_AREA_SERVICE,
    {
      operation: CONSTRAINT_OPERATIONS.getAll,
      map_name: typeof mapName === 'string' ? mapName.trim() : '',
      area_id: '',
      alignment_version: '',
      area: {},
      include_disabled: false,
    },
    'No-go service returned an error.',
  )

  return extractRecordList(payload, [
    'areas',
    'no_go_areas',
    'noGoAreas',
    'items',
    'list',
    'data',
  ])
}

RosGateway.prototype.getNoGoAreaDetail = async function getNoGoAreaDetail(mapName, areaId) {
  const payload = await callSuccessfulManagedService(
    this,
    NO_GO_AREA_SERVICE,
    {
      operation: CONSTRAINT_OPERATIONS.get,
      map_name: typeof mapName === 'string' ? mapName.trim() : '',
      area_id: typeof areaId === 'string' ? areaId.trim() : '',
      alignment_version: '',
      area: {},
      include_disabled: true,
    },
    'No-go detail query returned an error.',
  )

  return extractFirstRecord(payload, ['area', 'areas', 'items', 'data'], [
    'area_id',
    'display_region',
    'display_name',
  ])
}

RosGateway.prototype.createNoGoArea = async function createNoGoArea(request) {
  const payload = await callSuccessfulManagedService(
    this,
    NO_GO_AREA_SERVICE,
    request,
    'No-go add returned an error.',
  )

  return {
    entity: extractFirstRecord(payload, ['area', 'areas', 'items', 'data'], [
      'area_id',
      'display_region',
      'display_name',
    ]),
    constraintVersion: getConstraintVersion(payload),
    warnings: getWarnings(payload),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.updateNoGoArea = async function updateNoGoArea(request) {
  const payload = await callSuccessfulManagedService(
    this,
    NO_GO_AREA_SERVICE,
    request,
    'No-go modify returned an error.',
  )

  return {
    entity: extractFirstRecord(payload, ['area', 'areas', 'items', 'data'], [
      'area_id',
      'display_region',
      'display_name',
    ]),
    constraintVersion: getConstraintVersion(payload),
    warnings: getWarnings(payload),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.deleteNoGoArea = async function deleteNoGoArea(mapName, areaId) {
  const payload = await callSuccessfulManagedService(
    this,
    NO_GO_AREA_SERVICE,
    {
      operation: CONSTRAINT_OPERATIONS.delete,
      map_name: typeof mapName === 'string' ? mapName.trim() : '',
      area_id: typeof areaId === 'string' ? areaId.trim() : '',
      alignment_version: '',
      area: {},
      include_disabled: true,
    },
    'No-go delete returned an error.',
  )

  return {
    constraintVersion: getConstraintVersion(payload),
    warnings: getWarnings(payload),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.listVirtualWalls = async function listVirtualWalls(mapName) {
  const payload = await callSuccessfulManagedService(
    this,
    VIRTUAL_WALL_SERVICE,
    {
      operation: CONSTRAINT_OPERATIONS.getAll,
      map_name: typeof mapName === 'string' ? mapName.trim() : '',
      wall_id: '',
      alignment_version: '',
      wall: {},
      include_disabled: false,
    },
    'Virtual wall service returned an error.',
  )

  return extractRecordList(payload, [
    'walls',
    'virtual_walls',
    'virtualWalls',
    'items',
    'list',
    'data',
  ])
}

RosGateway.prototype.getVirtualWallDetail = async function getVirtualWallDetail(mapName, wallId) {
  const payload = await callSuccessfulManagedService(
    this,
    VIRTUAL_WALL_SERVICE,
    {
      operation: CONSTRAINT_OPERATIONS.get,
      map_name: typeof mapName === 'string' ? mapName.trim() : '',
      wall_id: typeof wallId === 'string' ? wallId.trim() : '',
      alignment_version: '',
      wall: {},
      include_disabled: true,
    },
    'Virtual wall detail query returned an error.',
  )

  return extractFirstRecord(payload, ['wall', 'walls', 'items', 'data'], [
    'wall_id',
    'display_path',
    'display_name',
  ])
}

RosGateway.prototype.createVirtualWall = async function createVirtualWall(request) {
  const payload = await callSuccessfulManagedService(
    this,
    VIRTUAL_WALL_SERVICE,
    request,
    'Virtual wall add returned an error.',
  )

  return {
    entity: extractFirstRecord(payload, ['wall', 'walls', 'items', 'data'], [
      'wall_id',
      'display_path',
      'display_name',
    ]),
    constraintVersion: getConstraintVersion(payload),
    warnings: getWarnings(payload),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.updateVirtualWall = async function updateVirtualWall(request) {
  const payload = await callSuccessfulManagedService(
    this,
    VIRTUAL_WALL_SERVICE,
    request,
    'Virtual wall modify returned an error.',
  )

  return {
    entity: extractFirstRecord(payload, ['wall', 'walls', 'items', 'data'], [
      'wall_id',
      'display_path',
      'display_name',
    ]),
    constraintVersion: getConstraintVersion(payload),
    warnings: getWarnings(payload),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.deleteVirtualWall = async function deleteVirtualWall(mapName, wallId) {
  const payload = await callSuccessfulManagedService(
    this,
    VIRTUAL_WALL_SERVICE,
    {
      operation: CONSTRAINT_OPERATIONS.delete,
      map_name: typeof mapName === 'string' ? mapName.trim() : '',
      wall_id: typeof wallId === 'string' ? wallId.trim() : '',
      alignment_version: '',
      wall: {},
      include_disabled: true,
    },
    'Virtual wall delete returned an error.',
  )

  return {
    constraintVersion: getConstraintVersion(payload),
    warnings: getWarnings(payload),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.listTasks = async function listTasks() {
  return this.readThroughCache('tasks:list', READ_CACHE_TTL_MS.tasks, async () => {
    const payload = await callManagedService(this, TASK_SERVICE, {
      operation: TASK_OPERATIONS.getAll,
      task_id: 0,
      map_name: '',
      enabled_state: TASK_ENABLED_STATE.keep,
      return_to_dock_state: TASK_RETURN_TO_DOCK_STATE.keep,
      repeat_after_full_charge_state: TASK_REPEAT_AFTER_FULL_CHARGE_STATE.keep,
      task: {},
    })

    if (getResponseSuccess(payload) === false) {
      throw createServiceError(payload, 'Task list query returned an error.')
    }

    return normalizeTaskList(payload)
  })
}

RosGateway.prototype.getTaskDetail = async function getTaskDetail(taskId) {
  return this.readThroughCache(`tasks:detail:${taskId}`, READ_CACHE_TTL_MS.taskDetail, async () => {
    const payload = await callManagedService(this, TASK_SERVICE, {
      operation: TASK_OPERATIONS.get,
      task_id: taskId,
      map_name: '',
      enabled_state: TASK_ENABLED_STATE.keep,
      return_to_dock_state: TASK_RETURN_TO_DOCK_STATE.keep,
      repeat_after_full_charge_state: TASK_REPEAT_AFTER_FULL_CHARGE_STATE.keep,
      task: {},
    })

    if (getResponseSuccess(payload) === false) {
      throw createServiceError(payload, 'Task detail query returned an error.')
    }

    return normalizeTaskDetail(payload)
  })
}

RosGateway.prototype.createTask = async function createTask(input) {
  const finishBehavior = normalizeTaskFinishBehavior(input)
  const payload = await callManagedService(this, TASK_SERVICE, {
    operation: TASK_OPERATIONS.add,
    task_id: Math.max(0, Math.round(input.taskId)),
    map_name: input.mapName.trim(),
    enabled_state: input.enabled ? TASK_ENABLED_STATE.enable : TASK_ENABLED_STATE.disable,
    return_to_dock_state: finishBehavior.returnToDockOnFinish
      ? TASK_RETURN_TO_DOCK_STATE.enable
      : TASK_RETURN_TO_DOCK_STATE.disable,
    repeat_after_full_charge_state: finishBehavior.repeatAfterFullCharge
      ? TASK_REPEAT_AFTER_FULL_CHARGE_STATE.enable
      : TASK_REPEAT_AFTER_FULL_CHARGE_STATE.disable,
    task: buildTaskRequest(input),
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Task add returned an error.')
  }

  this.invalidateReadCache(['tasks:', 'readiness:'])

  return {
    task: normalizeTaskDetail(payload) ?? normalizeTaskEntity(buildTaskRequest(input), 0),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.updateTask = async function updateTask(task, input) {
  const finishBehavior = normalizeTaskFinishBehavior(input)
  const requestTask = buildTaskRequest(
    {
      ...input,
      taskId: task.id,
    },
    task,
  )

  const payload = await callManagedService(this, TASK_SERVICE, {
    operation: TASK_OPERATIONS.modify,
    task_id: task.id,
    map_name: input.mapName.trim(),
    enabled_state: input.enabled ? TASK_ENABLED_STATE.enable : TASK_ENABLED_STATE.disable,
    return_to_dock_state: finishBehavior.returnToDockOnFinish
      ? TASK_RETURN_TO_DOCK_STATE.enable
      : TASK_RETURN_TO_DOCK_STATE.disable,
    repeat_after_full_charge_state: finishBehavior.repeatAfterFullCharge
      ? TASK_REPEAT_AFTER_FULL_CHARGE_STATE.enable
      : TASK_REPEAT_AFTER_FULL_CHARGE_STATE.disable,
    task: requestTask,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Task modify returned an error.')
  }

  this.invalidateReadCache(['tasks:', 'readiness:'])

  return {
    task: normalizeTaskDetail(payload) ?? normalizeTaskEntity(requestTask, 0),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.deleteTask = async function deleteTask(taskId) {
  const payload = await callManagedService(this, TASK_SERVICE, {
    operation: TASK_OPERATIONS.delete,
    task_id: taskId,
    map_name: '',
    enabled_state: TASK_ENABLED_STATE.keep,
    return_to_dock_state: TASK_RETURN_TO_DOCK_STATE.keep,
    repeat_after_full_charge_state: TASK_REPEAT_AFTER_FULL_CHARGE_STATE.keep,
    task: {},
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Task delete returned an error.')
  }

  this.invalidateReadCache(['tasks:', 'readiness:'])

  return { raw: isRecord(payload) ? payload : {} }
}

RosGateway.prototype.listSchedules = async function listSchedules() {
  const payload = await callManagedService(this, SCHEDULE_SERVICE, {
    operation: SCHEDULE_OPERATIONS.getAll,
    schedule_id: '',
    task_id: 0,
    schedule: {},
    enabled_state: SCHEDULE_ENABLED_STATE.keep,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule list query returned an error.')
  }

  return normalizeScheduleList(payload)
}

RosGateway.prototype.getScheduleDetail = async function getScheduleDetail(scheduleId, taskId = 0) {
  const payload = await callManagedService(this, SCHEDULE_SERVICE, {
    operation: SCHEDULE_OPERATIONS.get,
    schedule_id: scheduleId.trim(),
    task_id: taskId,
    schedule: {},
    enabled_state: SCHEDULE_ENABLED_STATE.keep,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule detail query returned an error.')
  }

  return normalizeScheduleDetail(payload)
}

RosGateway.prototype.createSchedule = async function createSchedule(input, task) {
  const requestSchedule = buildScheduleRequest(input, task)
  const payload = await callManagedService(this, SCHEDULE_SERVICE, {
    operation: SCHEDULE_OPERATIONS.add,
    schedule_id: input.scheduleId.trim(),
    task_id: Math.max(0, Math.round(input.taskId)),
    enabled_state: input.enabled
      ? SCHEDULE_ENABLED_STATE.enable
      : SCHEDULE_ENABLED_STATE.disable,
    schedule: requestSchedule,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule add returned an error.')
  }

  return {
    schedule: normalizeScheduleDetail(payload) ?? normalizeScheduleEntity(requestSchedule, 0),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.updateSchedule = async function updateSchedule(schedule, input, task) {
  const requestSchedule = buildScheduleRequest(
    {
      ...input,
      scheduleId: schedule.id,
    },
    task,
    schedule,
  )

  const payload = await callManagedService(this, SCHEDULE_SERVICE, {
    operation: SCHEDULE_OPERATIONS.modify,
    schedule_id: schedule.id,
    task_id: Math.max(0, Math.round(input.taskId)),
    enabled_state: input.enabled
      ? SCHEDULE_ENABLED_STATE.enable
      : SCHEDULE_ENABLED_STATE.disable,
    schedule: requestSchedule,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule modify returned an error.')
  }

  return {
    schedule: normalizeScheduleDetail(payload) ?? normalizeScheduleEntity(requestSchedule, 0),
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.deleteSchedule = async function deleteSchedule(scheduleId, taskId = 0) {
  const payload = await callManagedService(this, SCHEDULE_SERVICE, {
    operation: SCHEDULE_OPERATIONS.delete,
    schedule_id: scheduleId.trim(),
    task_id: taskId,
    schedule: {},
    enabled_state: SCHEDULE_ENABLED_STATE.keep,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule delete returned an error.')
  }

  return {
    message: isRecord(payload) ? pickString(payload, ['message']) : '',
    raw: isRecord(payload) ? payload : {},
  }
}

RosGateway.prototype.executeTaskCommand = async function executeTaskCommand(command, taskId) {
  const payload = await callManagedService(this, EXECUTION_SERVICE, {
    command: EXECUTION_COMMANDS[command],
    task_id: Math.max(0, Math.round(taskId)),
  })

  this.invalidateReadCache(['readiness:', 'odometry:', 'slam-state:', 'slam-job:'])

  return {
    success: Boolean(isRecord(payload) && payload.success === true),
    message: isRecord(payload) ? pickString(payload, ['message']) : '',
    command,
    taskId,
    raw: isRecord(payload) ? payload : {},
  }
}

function createBadRequestError(message) {
  const error = new Error(message)
  error.statusCode = 400
  error.code = 'BAD_REQUEST'
  error.recoverable = true
  return error
}

function pickNumberField(record, keys) {
  return toNumber(pickValue(record, keys))
}

function normalizeDockCalibrationState(payload) {
  const parsed = isRecord(payload) && isRecord(payload.state) ? payload.state : payload
  const record = isRecord(parsed) ? parsed : {}

  return {
    trackedPoseFresh:
      toBoolean(pickValue(record, ['trackedPoseFresh', 'tracked_pose_fresh'])) ?? false,
    trackedPoseFrame: pickString(record, ['trackedPoseFrame', 'tracked_pose_frame']),
    currentX: pickNumberField(record, ['currentX', 'current_x']),
    currentY: pickNumberField(record, ['currentY', 'current_y']),
    currentYaw: pickNumberField(record, ['currentYaw', 'current_yaw']),
    stage1Set: toBoolean(pickValue(record, ['stage1Set', 'stage1_set'])) ?? false,
    stage1X: pickNumberField(record, ['stage1X', 'stage1_x']),
    stage1Y: pickNumberField(record, ['stage1Y', 'stage1_y']),
    stage1Yaw: pickNumberField(record, ['stage1Yaw', 'stage1_yaw']),
    stage2Set: toBoolean(pickValue(record, ['stage2Set', 'stage2_set'])) ?? false,
    stage2X: pickNumberField(record, ['stage2X', 'stage2_x']),
    stage2Y: pickNumberField(record, ['stage2Y', 'stage2_y']),
    stage2Yaw: pickNumberField(record, ['stage2Yaw', 'stage2_yaw']),
    dockPoseFresh: toBoolean(pickValue(record, ['dockPoseFresh', 'dock_pose_fresh'])) ?? false,
    dockPoseX: pickNumberField(record, ['dockPoseX', 'dock_pose_x']),
    dockPoseY: pickNumberField(record, ['dockPoseY', 'dock_pose_y']),
    dockPoseYaw: pickNumberField(record, ['dockPoseYaw', 'dock_pose_yaw']),
    dockScoreFresh:
      toBoolean(pickValue(record, ['dockScoreFresh', 'dock_score_fresh'])) ?? false,
    dockScore: pickNumberField(record, ['dockScore', 'dock_score']),
    dockScoreThreshold: pickNumberField(record, ['dockScoreThreshold', 'dock_score_threshold']),
    dockScoreLowerIsBetter:
      toBoolean(pickValue(record, ['dockScoreLowerIsBetter', 'dock_score_lower_is_better'])) ??
      true,
    dockPoseQualityOk:
      toBoolean(pickValue(record, ['dockPoseQualityOk', 'dock_pose_quality_ok'])) ?? false,
    stage2SaveRecommended:
      toBoolean(pickValue(record, ['stage2SaveRecommended', 'stage2_save_recommended'])) ?? false,
    warnings: toStringArray(pickValue(record, ['warnings'])),
    storagePath: pickString(record, ['storagePath', 'storage_path']),
    raw: record,
  }
}

function normalizeDockCalibrationStatusResult(payload) {
  const record = isRecord(payload) ? payload : {}
  const stateSource = isRecord(record.state) ? record.state : record
  const state = isRecord(stateSource) ? normalizeDockCalibrationState(stateSource) : null

  return {
    success: getResponseSuccess(record) ?? true,
    message: pickString(record, ['message']),
    state,
    raw: record,
  }
}

function normalizeDockCalibrationOperation(value) {
  const operation = Math.round(toNumber(value) ?? Number.NaN)
  if (!DOCK_CALIBRATION_OPERATIONS.has(operation)) {
    throw createBadRequestError('Unsupported dock calibration operation.')
  }

  return operation
}

function normalizeDockCalibrationCommandRequest(command, robotId) {
  const operation = normalizeDockCalibrationOperation(command?.operation)
  const request = {
    operation,
    robot_id:
      typeof command?.robot_id === 'string' && command.robot_id.trim()
        ? command.robot_id.trim()
        : typeof command?.robotId === 'string' && command.robotId.trim()
          ? command.robotId.trim()
          : robotId,
    require_stage2_quality:
      toBoolean(command?.require_stage2_quality) ??
      toBoolean(command?.requireStage2Quality) ??
      false,
  }

  if (operation === 3 || operation === 4) {
    const x = toNumber(command?.x)
    const y = toNumber(command?.y)
    const yaw = toNumber(command?.yaw)

    if (x === null || y === null || yaw === null) {
      throw createBadRequestError('Manual dock calibration point requires finite x, y and yaw.')
    }

    request.x = x
    request.y = y
    request.yaw = yaw
  }

  return request
}

RosGateway.prototype.getDockCalibrationStatus = async function getDockCalibrationStatus(
  robotId = this.siteConfig.robotId,
) {
  const payload = await callManagedService(this, DOCK_CALIBRATION_STATUS_SERVICE, {
    robot_id: robotId,
  })

  return normalizeDockCalibrationStatusResult(payload)
}

RosGateway.prototype.runDockCalibrationCommand = async function runDockCalibrationCommand(
  command,
  robotId = this.siteConfig.robotId,
) {
  const request = normalizeDockCalibrationCommandRequest(command, robotId)
  const payload = await callManagedService(this, DOCK_CALIBRATION_COMMAND_SERVICE, request)

  this.invalidateReadCache(['readiness:', 'odometry:', 'slam-state:', 'slam-job:'])

  return {
    ...normalizeDockCalibrationStatusResult(payload),
    operation: request.operation,
  }
}

function normalizeManualDriveDirection(value) {
  const direction = typeof value === 'string' ? value.trim() : ''
  return MANUAL_DRIVE_DIRECTIONS.has(direction) ? direction : 'forward'
}

function normalizeManualDriveAction(value) {
  return typeof value === 'string' && value.trim() === 'move' ? 'move' : 'stop'
}

function normalizeManualDriveBlockedReasons(record) {
  return [
    ...toStringArray(pickValue(record, ['blockedReasons'])),
    ...toStringArray(pickValue(record, ['blocked_reasons'])),
  ]
}

function normalizeManualDriveCommandResult(payload, request) {
  const record = isRecord(payload) ? payload : {}
  const blockedReasons = normalizeManualDriveBlockedReasons(record)
  const success = getResponseSuccess(record) !== false

  return {
    success,
    message: pickString(record, ['message']) || (success ? '' : blockedReasons.join(', ')),
    action: request.action,
    direction: request.direction,
    active: toBoolean(pickValue(record, ['active', 'is_active'])) ?? request.action === 'move',
    allowed: toBoolean(pickValue(record, ['allowed', 'can_move'])),
    blockedReasons,
    raw: record,
  }
}

function normalizeManualDriveStatus(payload) {
  const record = isRecord(payload) ? payload : {}
  const blockedReasons = normalizeManualDriveBlockedReasons(record)
  const lastDirection = pickString(record, ['lastDirection', 'last_direction', 'direction'])
  const linearMpsLimit = toNumber(
    pickValue(record, ['linearMpsLimit', 'linear_mps_limit', 'max_linear_mps']),
  )
  const angularRadpsLimit = toNumber(
    pickValue(record, ['angularRadpsLimit', 'angular_radps_limit', 'max_angular_radps']),
  )

  return {
    enabled: toBoolean(pickValue(record, ['enabled'])) ?? true,
    active: toBoolean(pickValue(record, ['active', 'is_active'])) ?? false,
    allowed: toBoolean(pickValue(record, ['allowed', 'can_move'])) ?? blockedReasons.length === 0,
    blockedReasons,
    lastDirection: MANUAL_DRIVE_DIRECTIONS.has(lastDirection) ? lastDirection : null,
    lastCommandAt:
      toNumber(pickValue(record, ['lastCommandAt', 'last_command_at', 'last_command_at_ms'])) ??
      null,
    watchdogTimeoutMs:
      toNumber(pickValue(record, ['watchdogTimeoutMs', 'watchdog_timeout_ms'])) ?? 500,
    linearMpsLimit: linearMpsLimit ?? 0.15,
    angularRadpsLimit: angularRadpsLimit ?? 0.5,
    supportsStrafe: toBoolean(pickValue(record, ['supportsStrafe', 'supports_strafe'])) ?? false,
    raw: record,
  }
}

RosGateway.prototype.runManualDriveCommand = async function runManualDriveCommand(
  command,
  caller = {},
) {
  const request = {
    action: normalizeManualDriveAction(command?.action),
    direction: normalizeManualDriveDirection(command?.direction),
    linear_mps: toNumber(command?.linear_mps) ?? 0.12,
    angular_radps: toNumber(command?.angular_radps) ?? 0.35,
    duration_ms: Math.max(100, Math.min(1_000, Math.round(toNumber(command?.duration_ms) ?? 350))),
    caller_role: typeof caller.role === 'string' ? caller.role : '',
    caller_capabilities: Array.isArray(caller.capabilities) ? caller.capabilities : [],
  }
  const payload = await callManagedService(this, MANUAL_DRIVE_COMMAND_SERVICE, request)

  this.invalidateReadCache(['readiness:', 'odometry:', 'slam-state:', 'slam-job:'])

  return normalizeManualDriveCommandResult(payload, request)
}

RosGateway.prototype.getManualDriveStatus = async function getManualDriveStatus(caller = {}) {
  const payload = await callManagedService(this, MANUAL_DRIVE_STATUS_SERVICE, {
    caller_role: typeof caller.role === 'string' ? caller.role : '',
    caller_capabilities: Array.isArray(caller.capabilities) ? caller.capabilities : [],
  })

  return normalizeManualDriveStatus(payload)
}

RosGateway.prototype.fetchProfileCatalog = async function fetchProfileCatalog(options) {
  const request = {
    profile_kind: options.profileKind,
    include_disabled: options.includeDisabled ?? false,
    map_name: options.mapName?.trim() ?? '',
  }

  return callAppReadQueryService(this, {
    contract: PROFILE_CATALOG_QUERY_CONTRACT,
    request,
    evaluateResponse: (payload) => {
      try {
        const normalized = normalizeProfileCatalogEntries(payload)

        return normalized
          ? {
              kind: 'success',
              value: normalized,
            }
          : {
              kind: 'empty',
              reason: 'App profile catalog query returned no usable profiles list.',
            }
      } catch (error) {
        return {
          kind: 'error',
          error:
            error instanceof Error
              ? error
              : new Error('Profile catalog query returned an error.'),
        }
      }
    },
  })
}

RosGateway.prototype.getSystemReadiness = async function getSystemReadiness(taskId) {
  const normalizedTaskId = Math.max(0, Math.round(taskId))

  return this.readThroughCache(
    `readiness:${normalizedTaskId}`,
    READ_CACHE_TTL_MS.readiness,
    () =>
      callAppReadQueryService(this, {
        contract: SYSTEM_READINESS_QUERY_CONTRACT,
        request: {
          task_id: normalizedTaskId,
          refresh_map_identity: normalizedTaskId > 0,
        },
        evaluateResponse: (payload) => {
          const normalized = normalizeSystemReadinessServiceResult(payload)

          return normalized
            ? {
                kind: 'success',
                value: normalized,
              }
            : {
                kind: 'empty',
                reason: 'App readiness query returned no usable readiness payload.',
              }
        },
      }),
  )
}

RosGateway.prototype.getOdometryState = async function getOdometryState(robotId = this.siteConfig.robotId) {
  return this.readThroughCache(`odometry:${robotId}`, READ_CACHE_TTL_MS.odometry, () =>
    callAppReadQueryService(this, {
      contract: ODOMETRY_STATUS_QUERY_CONTRACT,
      request: {
        robot_id: robotId,
      },
      evaluateResponse: (payload) => {
        const normalized = normalizeOdometryServiceResult(payload)

        return normalized
          ? {
              kind: 'success',
              value: normalized,
            }
          : {
              kind: 'empty',
              reason: 'App odometry query returned no usable state payload.',
            }
      },
    }),
  )
}

RosGateway.prototype.getSlamState = async function getSlamState(robotId = this.siteConfig.robotId) {
  return this.readThroughCache(`slam-state:${robotId}`, READ_CACHE_TTL_MS.slamState, () =>
    callAppReadQueryService(this, {
      contract: SLAM_STATUS_QUERY_CONTRACT,
      request: {
        robot_id: robotId,
        refresh_map_identity: false,
      },
      evaluateResponse: (payload) => {
        const normalized = normalizeSlamWorkflowState(payload)

        return normalized
          ? {
              kind: 'success',
              value: normalized,
            }
          : {
              kind: 'empty',
              reason: 'App SLAM status query returned no usable workflow state.',
            }
      },
    }),
  )
}

RosGateway.prototype.getSlamJob = async function getSlamJob(jobId) {
  return this.readThroughCache(`slam-job:${jobId}`, READ_CACHE_TTL_MS.slamJob, () =>
    callAppReadQueryService(this, {
      contract: SLAM_JOB_QUERY_CONTRACT,
      request: {
        job_id: jobId,
        robot_id: this.siteConfig.robotId,
      },
      evaluateResponse: (payload) => {
        if (isRecord(payload) && payload.found === false) {
          return {
            kind: 'success',
            value: null,
          }
        }

        const normalized = normalizeSlamWorkflowJob(payload)

        return normalized
          ? {
              kind: 'success',
              value: normalized,
            }
          : {
              kind: 'empty',
              reason: 'App SLAM job query returned no usable job payload.',
            }
      },
    }),
  )
}

RosGateway.prototype.runSlamAction = async function runSlamAction(actionKind, payload = {}) {
  const submitTarget = await resolveManagedServiceCall(this, SUBMIT_SLAM_SERVICE)
  const operation = SLAM_OPERATIONS[actionKind]

  if (typeof operation !== 'number') {
    throw new Error(`Unsupported SLAM action: ${actionKind}`)
  }

  const response = await this.callService({
    serviceName: submitTarget.serviceName,
    serviceType: submitTarget.serviceType,
    request: {
      operation,
      robot_id: payload.robotId ?? this.siteConfig.robotId,
      map_name: payload.mapName?.trim() ?? '',
      set_active: payload.setActive ?? true,
      description: payload.description?.trim() ?? '',
    },
  })

  this.invalidateReadCache(['slam-state:', 'slam-job:', 'readiness:', 'maps:'])

  return normalizeSubmitJobResponse(response)
}

function createIdleActuatorCommand() {
  return {
    kind: '',
    state: 'idle',
    startedAtMs: 0,
    sentAtMs: 0,
    failedAtMs: null,
    message: '',
  }
}

function toActuatorPosition(value) {
  const position = toNumber(value)
  return position === null ? null : Math.round(position)
}

function getActuatorPositionLabel(value) {
  switch (toActuatorPosition(value)) {
    case 0:
      return '\u539f\u4f4d'
    case 1:
      return '\u5230\u4f4d'
    case 2:
      return '\u8fd0\u52a8\u4e2d'
    default:
      return '\u672a\u77e5'
  }
}

function buildActuatorTopicStatus(snapshot, fallbackTopicName, fallbackMessageType, staleAfterMs) {
  const lastMessageAt =
    typeof snapshot?.lastMessageAt === 'number' ? snapshot.lastMessageAt : null
  const ageMs = lastMessageAt === null ? null : Math.max(0, Date.now() - lastMessageAt)
  const fresh = ageMs !== null && ageMs <= staleAfterMs

  return {
    topicName: snapshot?.topicName || fallbackTopicName,
    messageType: snapshot?.messageType || fallbackMessageType,
    fresh,
    ageMs,
  }
}

async function getManagedTopicSnapshotSafely(gateway, topicKey) {
  try {
    return await gateway.getManagedTopicSnapshot(topicKey, { includeEndpointInfo: false })
  } catch {
    return null
  }
}

RosGateway.prototype.getActuatorStatus = async function getActuatorStatus() {
  const disabledReasons = []
  const connection = this.getConnectionSnapshot()

  let combinedSnapshot = null
  let mcoreSnapshot = null
  let stationConnectedSnapshot = null
  let dockSupplySnapshot = null
  let stationStatusSnapshot = null
  let batterySnapshot = null

  if (connection.status !== 'connected' || connection.isConnected !== true) {
    disabledReasons.push('ROS is not connected.')
  } else {
    ;[
      combinedSnapshot,
      mcoreSnapshot,
      stationConnectedSnapshot,
      dockSupplySnapshot,
      stationStatusSnapshot,
      batterySnapshot,
    ] = await Promise.all([
      getManagedTopicSnapshotSafely(this, 'combinedStatus'),
      getManagedTopicSnapshotSafely(this, 'mcoreConnected'),
      getManagedTopicSnapshotSafely(this, 'stationConnected'),
      getManagedTopicSnapshotSafely(this, 'dockSupplyState'),
      getManagedTopicSnapshotSafely(this, 'stationStatus'),
      getManagedTopicSnapshotSafely(this, 'batteryState'),
    ])
  }

  const combinedTopic = buildActuatorTopicStatus(
    combinedSnapshot,
    '/combined_status',
    'robot_platform_msgs/CombinedStatus',
    ACTUATOR_STATUS_STALE_AFTER_MS,
  )
  const mcoreTopic = buildActuatorTopicStatus(
    mcoreSnapshot,
    MCORE_CONNECTED_TOPIC,
    MCORE_CONNECTED_TOPIC_TYPE,
    MCORE_CONNECTED_STALE_AFTER_MS,
  )
  const stationConnectedTopic = buildActuatorTopicStatus(
    stationConnectedSnapshot,
    STATION_CONNECTED_TOPIC,
    STATION_CONNECTED_TOPIC_TYPE,
    STATION_CONNECTED_STALE_AFTER_MS,
  )
  const dockSupplyTopic = buildActuatorTopicStatus(
    dockSupplySnapshot,
    '/dock_supply/state',
    'std_msgs/String',
    ACTUATOR_STATUS_STALE_AFTER_MS,
  )
  const stationStatusTopic = buildActuatorTopicStatus(
    stationStatusSnapshot,
    '/station_status',
    'robot_platform_msgs/StationStatus',
    ACTUATOR_STATUS_STALE_AFTER_MS,
  )
  const batteryTopic = buildActuatorTopicStatus(
    batterySnapshot,
    '/battery_state',
    'sensor_msgs/BatteryState',
    ACTUATOR_STATUS_STALE_AFTER_MS,
  )
  const combined = isRecord(combinedSnapshot?.payload) ? combinedSnapshot.payload : {}
  const mcore = isRecord(mcoreSnapshot?.payload) ? mcoreSnapshot.payload : {}
  const stationBridge = isRecord(stationConnectedSnapshot?.payload)
    ? stationConnectedSnapshot.payload
    : {}
  const dockSupply = isRecord(dockSupplySnapshot?.payload) ? dockSupplySnapshot.payload : {}
  const stationStatus = isRecord(stationStatusSnapshot?.payload)
    ? stationStatusSnapshot.payload
    : {}
  const battery = isRecord(batterySnapshot?.payload) ? batterySnapshot.payload : {}
  const mcoreConnected = mcoreTopic.fresh && toBoolean(pickValue(mcore, ['data'])) === true
  const stationConnected =
    stationConnectedTopic.fresh && toBoolean(pickValue(stationBridge, ['data'])) === true
  const dockSupplyState = pickString(dockSupply, ['data', 'state', 'value']) || 'UNKNOWN'
  const rawStationStatusValue = pickValue(stationStatus, ['status'])
  const rawStationStatus = Array.isArray(rawStationStatusValue)
    ? rawStationStatusValue.map((value) => toBoolean(value) === true)
    : []
  const agvInPlace = rawStationStatus[11] === true
  const rodConnected = rawStationStatus[8] === true
  const rodReset = rawStationStatus[7] === true

  if (!combinedTopic.fresh) {
    disabledReasons.push('/combined_status 状态不可用。')
  }

  if (!mcoreConnected) {
    disabledReasons.push('M-core bridge 未连接。')
  }

  const brushPosition = toActuatorPosition(
    pickValue(combined, ['brush_position', 'brushPosition']),
  )
  const scraperPosition = toActuatorPosition(
    pickValue(combined, ['scraper_position', 'scraperPosition']),
  )
  const cleanLevel = toNumber(pickValue(combined, ['clean_level', 'cleanLevel']))
  const sewageLevel = toNumber(pickValue(combined, ['sewage_level', 'sewageLevel']))
  const batteryPercentage =
    toNumber(pickValue(battery, ['percentage'])) ??
    toNumber(pickValue(combined, ['battery_percentage', 'batteryPercentage']))
  const batteryVoltage =
    toNumber(pickValue(battery, ['voltage'])) ??
    toNumber(pickValue(combined, ['battery_voltage', 'batteryVoltage']))
  const batteryCurrent = toNumber(pickValue(battery, ['current']))

  return {
    ok: true,
    success: true,
    rosbridge: connection.status,
    available: disabledReasons.length === 0,
    disabledReasons: [...new Set(disabledReasons)],
    mcoreConnected,
    stationConnected,
    dockSupplyState,
    cleanLevel,
    sewageLevel,
    batteryPercentage,
    batteryVoltage,
    batteryCurrent,
    station: {
      agvInPlace,
      rodConnected,
      rodReset,
      rawStatus: rawStationStatus,
    },
    battery: {
      percentage: batteryPercentage,
      voltage: batteryVoltage,
      current: batteryCurrent,
    },
    levels: {
      cleanLevel,
      sewageLevel,
    },
    capabilities: {
      dockSupply: dockSupplyTopic.messageType === 'std_msgs/String',
      stationIo: stationConnectedTopic.messageType === STATION_CONNECTED_TOPIC_TYPE,
      mechanicalConnect: false,
    },
    brush: {
      position: brushPosition,
      label: getActuatorPositionLabel(brushPosition),
    },
    scraper: {
      position: scraperPosition,
      label: getActuatorPositionLabel(scraperPosition),
    },
    lastCommand: this.lastActuatorCommand ?? createIdleActuatorCommand(),
    topics: {
      combinedStatus: combinedTopic,
      mcoreConnected: mcoreTopic,
      stationConnected: stationConnectedTopic,
      dockSupplyState: dockSupplyTopic,
      stationStatus: stationStatusTopic,
      batteryState: batteryTopic,
    },
  }
}

RosGateway.prototype.runActuatorCommand = async function runActuatorCommand(command) {
  const kind = getActuatorCommandKind(command)
  const startedAtMs = Date.now()

  this.lastActuatorCommand = {
    kind,
    state: 'sending',
    startedAtMs,
    sentAtMs: 0,
    failedAtMs: null,
    message: '',
  }

  try {
    const commandMessage = await publishActuatorCommand(this, command)
    this.lastActuatorCommand = {
      ...this.lastActuatorCommand,
      state: 'sent',
      sentAtMs: Date.now(),
      message: typeof commandMessage === 'string' ? commandMessage : '',
    }
    return this.lastActuatorCommand
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    this.lastActuatorCommand = {
      ...this.lastActuatorCommand,
      state: 'failed',
      failedAtMs: Date.now(),
      message,
    }
    throw error
  }
}

export function buildGrantedCapabilities(siteConfig, role) {
  const rolePolicy = siteConfig.rolePolicy[role] ?? []
  const capabilitySet = new Set(rolePolicy)

  for (const [moduleKey, enabled] of Object.entries(siteConfig.enabledModules)) {
    if (enabled !== false) {
      continue
    }

    for (const capability of MODULE_CAPABILITY_MAP[moduleKey] ?? []) {
      capabilitySet.delete(capability)
    }
  }

  capabilitySet.add('overview')
  return Array.from(capabilitySet)
}
