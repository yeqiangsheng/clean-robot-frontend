import { appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import WebSocket from 'ws'

const rosbridgeUrl = process.env.ROSBRIDGE_URL || 'ws://localhost:9090'
const outputDirectory = resolve('.tmp/live-monitor')
const jsonlLogPath = resolve(outputDirectory, 'slam-monitor.jsonl')
const textLogPath = resolve(outputDirectory, 'slam-monitor.log')
const robotId = process.env.ROBOT_ID || 'local_robot'

const topics = [
  '/clean_robot_server/slam_state',
  '/clean_robot_server/slam_job_state',
  '/coverage_task_manager/system_readiness',
  '/clean_robot_server/odometry_state',
  '/map',
]

const services = [
  {
    key: 'slam_status',
    service: '/clean_robot_server/app/get_slam_status',
    args: { robot_id: robotId, refresh_map_identity: false },
  },
  {
    key: 'readiness',
    service: '/coverage_task_manager/app/get_system_readiness',
    args: { task_id: 0, refresh_map_identity: false },
  },
  {
    key: 'odometry',
    service: '/clean_robot_server/app/get_odometry_status',
    args: { robot_id: robotId },
  },
]

let latestJobId = ''
let mapCount = 0
let lastMapAt = 0

mkdirSync(outputDirectory, { recursive: true })

function timestamp() {
  return new Date().toISOString()
}

function pickValue(source, keys) {
  for (const key of keys) {
    if (
      source &&
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== undefined &&
      source[key] !== null &&
      source[key] !== ''
    ) {
      return source[key]
    }
  }

  return undefined
}

function compactPayload(value) {
  if (!value || typeof value !== 'object') {
    return value
  }

  const source =
    value.state && typeof value.state === 'object' ? value.state : value

  return prune({
    mode: pickValue(source, [
      'current_mode',
      'currentMode',
      'mode',
      'workflow',
      'workflow_state',
    ]),
    localization: pickValue(source, [
      'localization_status',
      'localizationStatus',
      'localization',
      'state',
    ]),
    phase: pickValue(source, ['phase', 'job_phase', 'jobPhase']),
    progress: pickValue(source, ['progress', 'progress_percent', 'progressPercent']),
    job_id: pickValue(source, [
      'job_id',
      'jobId',
      'active_job_id',
      'activeJobId',
      'current_job_id',
    ]),
    action: pickValue(source, ['action', 'command', 'operation', 'operation_name']),
    map: pickValue(source, [
      'map_name',
      'mapName',
      'active_map_name',
      'runtime_map_name',
      'target_map_name',
    ]),
    runtime_map: pickValue(source, ['runtime_map_name', 'runtimeMapName']),
    active_map: pickValue(source, ['active_map_name', 'activeMapName']),
    task_state: pickValue(source, [
      'task_state',
      'taskState',
      'mission_state',
      'missionState',
    ]),
    executor_state: pickValue(source, ['executor_state', 'executorState']),
    overall_ready: pickValue(source, ['overall_ready', 'overallReady']),
    can_start_task: pickValue(source, ['can_start_task', 'canStartTask']),
    ok: pickValue(source, ['ok', 'healthy', 'valid', 'is_valid']),
    message: pickValue(source, [
      'message',
      'status_message',
      'error_message',
      'reason',
    ]),
    error_code: pickValue(source, ['error_code', 'errorCode']),
  })
}

function prune(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  )
}

function writeEntry(entry) {
  const cleanEntry = prune(entry)
  const jsonLine = JSON.stringify(cleanEntry)
  const textLine = `[${cleanEntry.t}] ${cleanEntry.kind}${
    cleanEntry.name ? ` ${cleanEntry.name}` : ''
  } ${JSON.stringify(cleanEntry.summary || cleanEntry.detail || {})}`

  appendFileSync(jsonlLogPath, `${jsonLine}\n`)
  appendFileSync(textLogPath, `${textLine}\n`)
  console.log(textLine)
}

function callService(socket, item) {
  socket.send(
    JSON.stringify({
      op: 'call_service',
      id: `svc:${item.key}:${Date.now()}`,
      service: item.service,
      args: item.args,
    }),
  )
}

function pollServices(socket) {
  for (const item of services) {
    callService(socket, item)
  }

  if (latestJobId) {
    socket.send(
      JSON.stringify({
        op: 'call_service',
        id: `svc:slam_job:${Date.now()}`,
        service: '/clean_robot_server/app/get_slam_job',
        args: { job_id: latestJobId, robot_id: robotId },
      }),
    )
  }
}

function rememberJobId(summary, payload) {
  const jobId =
    summary?.job_id ||
    pickValue(payload?.job || {}, ['job_id', 'jobId']) ||
    pickValue(payload || {}, ['job_id', 'jobId'])

  if (typeof jobId === 'string' && jobId.trim()) {
    latestJobId = jobId.trim()
  }
}

const socket = new WebSocket(rosbridgeUrl)

socket.on('open', () => {
  writeEntry({
    t: timestamp(),
    kind: 'monitor',
    name: 'connected',
    detail: { rosbridgeUrl, robotId },
  })

  for (const topic of topics) {
    socket.send(
      JSON.stringify({
        op: 'subscribe',
        id: `sub:${topic}`,
        topic,
        throttle_rate: topic === '/map' ? 2000 : 1000,
      }),
    )
  }

  pollServices(socket)
  setInterval(() => pollServices(socket), 5000)
})

socket.on('message', (buffer) => {
  let payload

  try {
    payload = JSON.parse(buffer.toString())
  } catch {
    return
  }

  if (payload.op === 'publish') {
    if (payload.topic === '/map') {
      mapCount += 1
      lastMapAt = Date.now()
      writeEntry({
        t: timestamp(),
        kind: 'topic',
        name: '/map',
        summary: { count: mapCount, fresh: true },
      })
      return
    }

    const summary = compactPayload(payload.msg || {})
    rememberJobId(summary, payload.msg)
    writeEntry({ t: timestamp(), kind: 'topic', name: payload.topic, summary })
    return
  }

  if (payload.op === 'service_response') {
    const values = payload.values || {}
    const summary = {
      result: payload.result,
      ...compactPayload(values),
    }
    rememberJobId(summary, values)
    writeEntry({
      t: timestamp(),
      kind: 'service',
      name: payload.service,
      summary,
    })
  }
})

socket.on('error', (error) => {
  writeEntry({
    t: timestamp(),
    kind: 'monitor',
    name: 'error',
    detail: { message: error.message },
  })
})

socket.on('close', (code, reason) => {
  writeEntry({
    t: timestamp(),
    kind: 'monitor',
    name: 'closed',
    detail: {
      code,
      reason: reason.toString(),
      lastMapAgeMs: lastMapAt ? Date.now() - lastMapAt : null,
    },
  })
})
