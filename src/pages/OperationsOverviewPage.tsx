import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Button, Card, Progress, Space, Typography, message } from 'antd'
import {
  CheckCircleOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  HomeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import { executeTaskCommand } from '../api/gateway/executionGateway'
import { ExecutionCommandCard } from '../components/execution/ExecutionCommandCard'
import { ManualDriveControl } from '../components/execution/ManualDriveControl'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { ExecutionProgressInline } from '../components/runtime/ExecutionProgressCard'
import { useRuntimeMonitor } from '../hooks/useRuntimeMonitor'
import { useRosConnection } from '../hooks/useRosConnection'
import { useSystemReadiness } from '../hooks/useSystemReadiness'
import { useExecutionSessionStore } from '../stores/executionSessionStore'
import type { RuntimeTopicHealth, RuntimeTopicKey, RuntimeTopicSnapshot } from '../types/runtime'
import type { SystemReadiness } from '../types/systemReadiness'
import './OperationsOverviewPage.css'

type JsonRecord = Record<string, unknown>

interface DailyRunRecord {
  completed: boolean
  maxAreaM2: number | null
  maxDistanceM: number
}

interface DailyOverviewStats {
  completedTaskCount: number
  dateKey: string
  runs: Record<string, DailyRunRecord>
}

interface CumulativeOverviewRunRecord {
  completed: boolean
  maxDistanceM: number
}

interface CumulativeOverviewStats {
  completedTaskCount: number
  runs: Record<string, CumulativeOverviewRunRecord>
}

const OVERVIEW_RUNTIME_TOPIC_KEYS: RuntimeTopicKey[] = [
  'taskState',
  'executorState',
  'dockSupplyState',
  'batteryState',
  'combinedStatus',
  'stationStatus',
  'runProgress',
]

const DAILY_STATS_STORAGE_KEY = 'clean_robot_overview_daily_stats_v3'
const CUMULATIVE_STATS_STORAGE_KEY = 'clean_robot_runtime_cumulative_stats_v3'
const CLEANING_WIDTH_M = 0.6
const BATTERY_WARNING_PERCENT = 20
const CLEAN_WATER_WARNING_PERCENT = 25
const SEWAGE_WARNING_PERCENT = 75

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRecordTopicValue(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

function getStringTopicValue(topic: RuntimeTopicSnapshot) {
  if (!isRecord(topic.rawMessage)) {
    return null
  }

  for (const key of ['data', 'state', 'status']) {
    const value = topic.rawMessage[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return null
}

function normalizeStatusToken(value: unknown) {
  if (typeof value === 'string') {
    return value.trim().toUpperCase()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return ''
}

function containsStatusToken(values: unknown[], tokens: string[]) {
  const normalizedValues = values
    .map((value) => normalizeStatusToken(value))
    .filter((value) => value.length > 0)

  return tokens.some((token) => {
    const normalizedToken = token.toUpperCase()
    return normalizedValues.some((value) => value.includes(normalizedToken))
  })
}

function hasMeaningfulProblemValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0
  }

  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.trim().toUpperCase()
  return !['', '-', '--', '0', 'NONE', 'OK', 'NORMAL', 'SUCCESS'].includes(normalized)
}

function normalizePercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  const percent = value >= 0 && value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, percent))
}

function formatPercentLabel(value: number | null) {
  return value === null ? '--' : `${Math.round(value)}%`
}

function formatDistance(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} km`
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} m`
}

function formatArea(value: number | null) {
  if (value === null) {
    return '--'
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} m²`
}

function formatDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createEmptyDailyStats(dateKey = formatDateKey(new Date())): DailyOverviewStats {
  return {
    completedTaskCount: 0,
    dateKey,
    runs: {},
  }
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function loadDailyStats(dateKey: string) {
  if (!canUseLocalStorage()) {
    return createEmptyDailyStats(dateKey)
  }

  try {
    const raw = window.localStorage.getItem(DAILY_STATS_STORAGE_KEY)
    if (!raw) {
      return createEmptyDailyStats(dateKey)
    }

    const parsed = JSON.parse(raw) as Partial<DailyOverviewStats>
    if (parsed.dateKey !== dateKey || !isRecord(parsed.runs)) {
      return createEmptyDailyStats(dateKey)
    }

    return {
      completedTaskCount:
        typeof parsed.completedTaskCount === 'number' && Number.isFinite(parsed.completedTaskCount)
          ? parsed.completedTaskCount
          : 0,
      dateKey,
      runs: parsed.runs as Record<string, DailyRunRecord>,
    }
  } catch {
    return createEmptyDailyStats(dateKey)
  }
}

function saveDailyStats(stats: DailyOverviewStats) {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.setItem(DAILY_STATS_STORAGE_KEY, JSON.stringify(stats))
}

function createEmptyCumulativeStats(): CumulativeOverviewStats {
  return {
    completedTaskCount: 0,
    runs: {},
  }
}

function loadCumulativeStats() {
  if (!canUseLocalStorage()) {
    return createEmptyCumulativeStats()
  }

  try {
    const raw = window.localStorage.getItem(CUMULATIVE_STATS_STORAGE_KEY)
    if (!raw) {
      return createEmptyCumulativeStats()
    }

    const parsed = JSON.parse(raw) as Partial<CumulativeOverviewStats>
    if (!isRecord(parsed.runs)) {
      return createEmptyCumulativeStats()
    }

    return {
      completedTaskCount:
        typeof parsed.completedTaskCount === 'number' && Number.isFinite(parsed.completedTaskCount)
          ? parsed.completedTaskCount
          : 0,
      runs: parsed.runs as Record<string, CumulativeOverviewRunRecord>,
    }
  } catch {
    return createEmptyCumulativeStats()
  }
}

function saveCumulativeStats(stats: CumulativeOverviewStats) {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.setItem(CUMULATIVE_STATS_STORAGE_KEY, JSON.stringify(stats))
}

function getFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function getBackendRunId(runProgress: JsonRecord) {
  const runId = runProgress.run_id

  if (typeof runId === 'string' && runId.trim()) {
    return runId.trim()
  }

  return null
}

function getRunIdentityBase(runProgress: JsonRecord) {
  const taskId = runProgress.task_id
  const zoneId = runProgress.zone_id

  if (typeof taskId === 'number' && Number.isFinite(taskId)) {
    return `task-${taskId}`
  }

  if (typeof zoneId === 'string' && zoneId.trim()) {
    return `zone-${zoneId.trim()}`
  }

  return 'active-run'
}

function createSyntheticRunId(runProgress: JsonRecord) {
  return `${getRunIdentityBase(runProgress)}-${Date.now()}`
}

function getRunCompleted(runProgress: JsonRecord) {
  const progressPercent =
    normalizePercent(runProgress.progress_pct) ?? normalizePercent(runProgress.progress_0_1)
  const state =
    typeof runProgress.state === 'string' ? runProgress.state.trim().toUpperCase() : ''

  return (
    (progressPercent !== null && progressPercent >= 99.5) ||
    ['DONE', 'FINISHED', 'COMPLETE', 'COMPLETED', 'SUCCEEDED', 'SUCCESS'].some((token) =>
      state.includes(token),
    )
  )
}

const RUN_PROGRESS_ACTIVE_TOKENS = [
  'RUNNING',
  'FOLLOW',
  'CLEANING',
  'COVERAGE',
  'COVER',
  'EXECUTING',
  'ACTIVE',
  'WORKING',
  'NAVIGATING',
  'STARTING',
  '清扫',
  '运行',
]

const RUN_PROGRESS_PAUSED_TOKENS = [
  'PAUSE',
  'PAUSED',
  'HOLD',
  'HELD',
  'SUSPEND',
  'SUSPENDED',
  '暂停',
]

function getRunProgressPercent(runProgress: JsonRecord | null) {
  if (!runProgress) {
    return null
  }

  return normalizePercent(runProgress.progress_pct) ?? normalizePercent(runProgress.progress_0_1)
}

function getRunProgressStateValues(runProgress: JsonRecord | null) {
  if (!runProgress) {
    return []
  }

  return [runProgress.state, runProgress.mode, runProgress.phase]
}

function isRunProgressActive(runProgress: JsonRecord | null, isFresh: boolean) {
  if (!isFresh || !runProgress || getRunCompleted(runProgress)) {
    return false
  }

  return containsStatusToken(getRunProgressStateValues(runProgress), RUN_PROGRESS_ACTIVE_TOKENS)
}

function isRunProgressPaused(runProgress: JsonRecord | null, isFresh: boolean) {
  if (!isFresh || !runProgress || getRunCompleted(runProgress)) {
    return false
  }

  return containsStatusToken(getRunProgressStateValues(runProgress), RUN_PROGRESS_PAUSED_TOKENS)
}

function getRunArea(runProgress: JsonRecord) {
  return getFiniteNumber(
    runProgress.cleaned_area_m2,
    runProgress.covered_area_m2,
    runProgress.coverage_area_m2,
    runProgress.area_m2,
  )
}

function getRunDistance(runProgress: JsonRecord) {
  return getFiniteNumber(
    runProgress.path_s,
    runProgress.cleaned_distance_m,
    runProgress.covered_distance_m,
    runProgress.distance_m,
  )
}

function getStationPresentation(health: RuntimeTopicHealth) {
  switch (health) {
    case 'live':
      return { color: 'green', label: '在线' }
    case 'stale':
      return { color: 'orange', label: '延迟' }
    case 'waiting':
      return { color: 'blue', label: '等待' }
    case 'unavailable':
      return { color: 'default', label: '未发布' }
    default:
      return { color: 'red', label: '离线' }
  }
}

type ProgressStatus = 'normal' | 'exception' | 'active' | 'success'

function getMetricStatus(percent: number | null, mode: 'battery' | 'clean' | 'sewage') {
  if (percent === null) {
    return 'normal' as const
  }

  if (mode === 'sewage') {
    return percent >= SEWAGE_WARNING_PERCENT ? ('exception' as const) : ('active' as const)
  }

  const threshold = mode === 'clean' ? CLEAN_WATER_WARNING_PERCENT : BATTERY_WARNING_PERCENT
  return percent <= threshold ? ('exception' as const) : ('active' as const)
}

function getCirclePercent(value: number | null) {
  return value === null ? 0 : Math.round(value)
}

function getStationCircleStatus(health: RuntimeTopicHealth): ProgressStatus {
  if (health === 'live') {
    return 'success'
  }

  return 'exception'
}

function getStationCirclePercent() {
  return 100
}

function hasRuntimeTelemetry(topic: RuntimeTopicSnapshot) {
  return topic.health === 'live' || topic.health === 'stale'
}

function isReadinessExecutionIdle(readiness: SystemReadiness | null) {
  if (!readiness) {
    return false
  }

  if (readiness.canStartTask) {
    return true
  }

  const stateValues = [
    readiness.missionState,
    readiness.phase,
    readiness.publicState,
    readiness.executorState,
  ]
  const blockingReasons = readiness.blockingReasons.map((reason) => reason.toUpperCase())
  const hasExecutionBlock = blockingReasons.some(
    (reason) =>
      reason.includes('EXECUTOR NOT IDLE') ||
      reason.includes('TASK MANAGER BUSY') ||
      reason.includes('执行器') ||
      reason.includes('任务管理'),
  )

  return (
    !hasExecutionBlock &&
    containsStatusToken(stateValues, [
      'IDLE',
      'READY',
      'WAIT',
      'DONE',
      'FINISH',
      'COMPLETE',
      'SUCCESS',
      'STOPPED',
      '空闲',
      '完成',
    ]) &&
    !containsStatusToken(stateValues, [
      'RUNNING',
      'FOLLOW',
      'CLEANING',
      'COVERAGE',
      'COVER',
      'EXECUTING',
      'ACTIVE',
      'WORKING',
      'NAVIGATING',
      'PAUSE',
      'PAUSED',
      '清扫',
      '运行',
      '暂停',
    ])
  )
}

interface RobotStatusPresentation {
  label: string
  percent: number
  status: ProgressStatus
  strokeColor: string
  canReturnHome: boolean
}

function getRobotStatusPresentation({
  isOnline,
  runProgress,
  taskState,
  executorState,
  dockSupplyState,
  batteryState,
  combinedStatus,
  readiness,
  runProgressFresh,
}: {
  isOnline: boolean
  runProgress: JsonRecord | null
  taskState: string | null
  executorState: string | null
  dockSupplyState: string | null
  batteryState: JsonRecord | null
  combinedStatus: JsonRecord | null
  readiness: SystemReadiness | null
  runProgressFresh: boolean
}): RobotStatusPresentation {
  if (!isOnline) {
    return {
      label: '离线',
      percent: 100,
      status: 'exception',
      strokeColor: '#ff4d4f',
      canReturnHome: false,
    }
  }

  const readinessExecutionIdle = isReadinessExecutionIdle(readiness)
  const runtimeTaskStateValues = readinessExecutionIdle ? [] : [taskState, executorState]
  const runProgressStateValues =
    runProgressFresh && !readinessExecutionIdle ? getRunProgressStateValues(runProgress) : []
  const observedStates = [
    ...runtimeTaskStateValues,
    dockSupplyState,
    readiness?.missionState,
    readiness?.phase,
    readiness?.publicState,
    readiness?.executorState,
    readiness?.dockSupplyState,
    ...runProgressStateValues,
    combinedStatus?.state,
    combinedStatus?.status,
    combinedStatus?.mission,
    combinedStatus?.mission_state,
    combinedStatus?.task_state,
    combinedStatus?.executor_state,
    combinedStatus?.dock_supply_state,
    combinedStatus?.charge_state,
    combinedStatus?.charging_state,
    combinedStatus?.workflow,
    combinedStatus?.phase,
  ]
  const activeMovementStates = [
    ...runtimeTaskStateValues,
    readiness?.missionState,
    readiness?.phase,
    readiness?.publicState,
    readiness?.executorState,
    ...runProgressStateValues,
    combinedStatus?.executor_state,
    combinedStatus?.phase,
    combinedStatus?.workflow,
  ]
  const problemValues = [
    runProgress?.error_code,
    runProgress?.error_msg,
    combinedStatus?.error_code,
    combinedStatus?.error_msg,
    combinedStatus?.fault_code,
    combinedStatus?.fault_msg,
    combinedStatus?.alarm_code,
    combinedStatus?.alarm_msg,
    combinedStatus?.emergency_stop,
  ]

  if (
    problemValues.some((value) => hasMeaningfulProblemValue(value)) ||
    containsStatusToken(observedStates, ['ERROR', 'FAULT', 'FAIL', 'ABORT', 'EXCEPTION', '异常', '故障'])
  ) {
    return {
      label: '异常',
      percent: 100,
      status: 'exception',
      strokeColor: '#ff4d4f',
      canReturnHome: false,
    }
  }

  const chargingStatus = batteryState?.power_supply_status
  const isChargingByBattery = chargingStatus === 1 || chargingStatus === 4
  if (
    isChargingByBattery ||
    containsStatusToken(observedStates, ['CHARGING', 'CHARGE', '充电'])
  ) {
    return {
      label: '充电中',
      percent: 100,
      status: 'active',
      strokeColor: '#1f8a78',
      canReturnHome: false,
    }
  }

  if (
    containsStatusToken(observedStates, [
      'RETURN',
      'DOCK',
      'HOME',
      'RECHARGE',
      'GO_CHARGE',
      'AUTO_DOCK',
      '回充',
      '返航',
    ])
  ) {
    return {
      label: '回充中',
      percent: 100,
      status: 'active',
      strokeColor: '#1677ff',
      canReturnHome: false,
    }
  }

  if (
    containsStatusToken(observedStates, ['PAUSE', 'PAUSED', 'HOLD', 'HELD', 'SUSPEND', '暂停'])
  ) {
    return {
      label: '暂停',
      percent: 100,
      status: 'active',
      strokeColor: '#faad14',
      canReturnHome: false,
    }
  }

  const progressPercent = getRunProgressPercent(runProgress)

  const hasActiveMovementState = containsStatusToken(activeMovementStates, [
    ...RUN_PROGRESS_ACTIVE_TOKENS,
  ])
  const hasActiveProgress =
    runProgressFresh &&
    progressPercent !== null &&
    progressPercent > 0 &&
    progressPercent < 99.5 &&
    containsStatusToken(getRunProgressStateValues(runProgress), RUN_PROGRESS_ACTIVE_TOKENS)
  if (hasActiveProgress || hasActiveMovementState) {
    return {
      label: '清扫中',
      percent: 100,
      status: 'active',
      strokeColor: '#1f8a78',
      canReturnHome: false,
    }
  }

  return {
    label: '空闲',
    percent: 100,
    status: 'success',
    strokeColor: '#1f8a78',
    canReturnHome: true,
  }
}

interface OperationsOverviewPageProps {
  isActive?: boolean
}

export function OperationsOverviewPage({ isActive = true }: OperationsOverviewPageProps) {
  const { snapshot } = useRosConnection()
  const runtimeMonitor = useRuntimeMonitor(snapshot, {
    includeEndpointInfo: false,
    topicKeys: OVERVIEW_RUNTIME_TOPIC_KEYS,
  })
  const { topicMap } = runtimeMonitor
  const focusedTaskId = useExecutionSessionStore((state) => state.focusedTaskId)
  const readinessState = useSystemReadiness(focusedTaskId ?? 0, snapshot)
  const readiness = readinessState.effectiveReadiness
  const dateKey = useMemo(() => formatDateKey(new Date()), [])
  const [dailyStats, setDailyStats] = useState(() => loadDailyStats(dateKey))
  const [cumulativeStats, setCumulativeStats] = useState(() => loadCumulativeStats())
  const observedActiveRunIdsRef = useRef<Set<string>>(new Set())
  const syntheticRunRef = useRef<{
    baseId: string
    completed: boolean
    runId: string
  } | null>(null)
  const [returningHome, setReturningHome] = useState(false)
  const [returnHomeError, setReturnHomeError] = useState<string | null>(null)

  const batteryState = getRecordTopicValue(topicMap.batteryState)
  const combinedStatus = getRecordTopicValue(topicMap.combinedStatus)
  const runProgress = getRecordTopicValue(topicMap.runProgress)
  const taskState = getStringTopicValue(topicMap.taskState)
  const executorState = getStringTopicValue(topicMap.executorState)
  const dockSupplyState = getStringTopicValue(topicMap.dockSupplyState)
  const batteryPercent =
    normalizePercent(batteryState?.percentage) ??
    normalizePercent(combinedStatus?.battery_percentage)
  const cleanWaterPercent = normalizePercent(combinedStatus?.clean_level)
  const sewagePercent = normalizePercent(combinedStatus?.sewage_level)
  const stationPresentation = getStationPresentation(topicMap.stationStatus.health)
  const runProgressFresh = snapshot.status === 'mock' || topicMap.runProgress.health === 'live'
  const runProgressActive = isRunProgressActive(runProgress, runProgressFresh)
  const runProgressPaused = isRunProgressPaused(runProgress, runProgressFresh)
  const hasRobotTelemetry =
    snapshot.status === 'mock' ||
    readiness !== null ||
    [
      topicMap.taskState,
      topicMap.executorState,
      topicMap.batteryState,
      topicMap.runProgress,
    ].some((topic) => hasRuntimeTelemetry(topic))
  const robotRuntimeOnline = (snapshot.isConnected || snapshot.status === 'mock') && hasRobotTelemetry
  const robotStatus = getRobotStatusPresentation({
    isOnline: robotRuntimeOnline,
    runProgress,
    taskState,
    executorState,
    dockSupplyState,
    batteryState,
    combinedStatus,
    readiness,
    runProgressFresh,
  })
  const resourceGauges: Array<{
    key: string
    label: string
    icon: ReactNode
    percent: number
    displayValue: string
    status: ProgressStatus
    strokeColor?: string
    tag?: ReactNode
  }> = [
    {
      key: 'battery',
      label: '电量',
      icon: <ThunderboltOutlined />,
      percent: getCirclePercent(batteryPercent),
      displayValue: formatPercentLabel(batteryPercent),
      status: getMetricStatus(batteryPercent, 'battery'),
    },
    {
      key: 'station',
      label: '充电桩',
      icon: <DeploymentUnitOutlined />,
      percent: getStationCirclePercent(),
      displayValue: stationPresentation.label,
      status: getStationCircleStatus(topicMap.stationStatus.health),
    },
    {
      key: 'clean-water',
      label: '清水',
      icon: <ExperimentOutlined />,
      percent: getCirclePercent(cleanWaterPercent),
      displayValue: formatPercentLabel(cleanWaterPercent),
      status: getMetricStatus(cleanWaterPercent, 'clean'),
    },
    {
      key: 'sewage-water',
      label: '污水',
      icon: <ExperimentOutlined />,
      percent: getCirclePercent(sewagePercent),
      displayValue: formatPercentLabel(sewagePercent),
      status: getMetricStatus(sewagePercent, 'sewage'),
    },
  ]
  const hasStationWarning =
    resourceGauges.find((item) => item.key === 'station')?.status === 'exception'
  const hasSupplyWarning = resourceGauges.some(
    (item) => item.key !== 'station' && item.status === 'exception',
  )
  const resourceWarningMessages = [
    ...(hasStationWarning ? ['请确认充电桩在线'] : []),
    ...(hasSupplyWarning ? ['请点击回家按钮补给'] : []),
  ]
  const hasResourceWarning = isActive && resourceWarningMessages.length > 0
  const isGatewayReadyForReturnHome = snapshot.isConnected || snapshot.status === 'mock'
  const canRequestReturnHome = isGatewayReadyForReturnHome && robotStatus.canReturnHome
  const returnHomeDisabledReason = !isGatewayReadyForReturnHome
    ? '等待 ROS 会话恢复'
    : robotStatus.canReturnHome
      ? null
      : robotRuntimeOnline
        ? '请先结束当前任务，机器人空闲后再回家补给'
        : '等待机器人实时状态刷新'
  const dailyDistanceM = Object.values(dailyStats.runs).reduce(
    (total, run) => total + run.maxDistanceM,
    0,
  )
  const dailyAreaM2 = dailyDistanceM * CLEANING_WIDTH_M
  const cumulativeDistanceM = Object.values(cumulativeStats.runs).reduce(
    (total, run) => total + Math.max(0, run.maxDistanceM || 0),
    0,
  )
  const cumulativeAreaM2 = cumulativeDistanceM * CLEANING_WIDTH_M

  const handleReturnHomeSupply = async () => {
    setReturnHomeError(null)
    if (!canRequestReturnHome) {
      const blockedMessage = returnHomeDisabledReason || '机器人空闲后才可以回家补给。'
      setReturnHomeError(blockedMessage)
      void message.warning(blockedMessage)
      return
    }

    setReturningHome(true)
    try {
      const result = await executeTaskCommand('RETURN', 0)
      if (!result.success) {
        const fallbackMessage = result.message || '回家补给指令未被机器人接受。'
        setReturnHomeError(fallbackMessage)
        void message.warning(fallbackMessage)
        return
      }

      void message.success('回家补给指令已下发。')
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '回家补给指令下发失败。'
      setReturnHomeError(errorMessage)
      void message.error(errorMessage)
    } finally {
      setReturningHome(false)
    }
  }

  useEffect(() => {
    if (!runProgress) {
      return
    }

    const distanceM = getRunDistance(runProgress)
    const areaM2 = getRunArea(runProgress)
    const completed = getRunCompleted(runProgress)
    const backendRunId = getBackendRunId(runProgress)
    const runIdentityBase = getRunIdentityBase(runProgress)
    const trackingRun =
      runProgressActive ||
      runProgressPaused ||
      (!completed && distanceM !== null && distanceM > 0)
    let runId = backendRunId

    if (!runId) {
      const existingSyntheticRun = syntheticRunRef.current

      if (
        trackingRun &&
        (!existingSyntheticRun ||
          existingSyntheticRun.baseId !== runIdentityBase ||
          existingSyntheticRun.completed)
      ) {
        syntheticRunRef.current = {
          baseId: runIdentityBase,
          completed: false,
          runId: createSyntheticRunId(runProgress),
        }
      }

      runId = syntheticRunRef.current?.runId ?? null
    }

    if (!runId) {
      return
    }

    const observedActiveRunIds = observedActiveRunIdsRef.current

    if (!completed) {
      observedActiveRunIds.add(runId)
    } else if (!observedActiveRunIds.has(runId)) {
      return
    } else if (syntheticRunRef.current?.runId === runId) {
      syntheticRunRef.current = {
        ...syntheticRunRef.current,
        completed: true,
      }
    }

    if (distanceM === null && areaM2 === null && !completed) {
      return
    }

    // Runtime topic messages are the external source for today's counters.
    setDailyStats((current) => {
      const base = current.dateKey === dateKey ? current : createEmptyDailyStats(dateKey)
      const previousRun = base.runs[runId] ?? {
        completed: false,
        maxAreaM2: null,
        maxDistanceM: 0,
      }
      const nextRun = {
        completed: previousRun.completed || completed,
        maxAreaM2:
          areaM2 === null
            ? previousRun.maxAreaM2
            : Math.max(previousRun.maxAreaM2 ?? 0, areaM2),
        maxDistanceM:
          distanceM === null ? previousRun.maxDistanceM : Math.max(previousRun.maxDistanceM, distanceM),
      }
      const nextStats = {
        ...base,
        completedTaskCount:
          !previousRun.completed && nextRun.completed
            ? base.completedTaskCount + 1
            : base.completedTaskCount,
        runs: {
          ...base.runs,
          [runId]: nextRun,
        },
      }

      saveDailyStats(nextStats)
      return nextStats
    })

    if (distanceM !== null || completed) {
      setCumulativeStats((current) => {
        const previousRun = current.runs[runId] ?? {
          completed: false,
          maxDistanceM: 0,
        }
        const nextRun = {
          completed: previousRun.completed || completed,
          maxDistanceM:
            distanceM === null
              ? previousRun.maxDistanceM
              : Math.max(previousRun.maxDistanceM, distanceM),
        }
        const nextStats = {
          completedTaskCount:
            !previousRun.completed && nextRun.completed
              ? current.completedTaskCount + 1
              : current.completedTaskCount,
          runs: {
            ...current.runs,
            [runId]: nextRun,
          },
        }

        saveCumulativeStats(nextStats)
        return nextStats
      })
    }
  }, [dateKey, runProgress, runProgressActive, runProgressPaused])

  return (
    <div className="overview-page">
      <div className="overview-top-action-row">
        <div className="overview-top-action-center">
          {hasResourceWarning ? (
            <AppFeedbackBanner
              tone="warning"
              title={
                <div className="overview-resource-warning-title">
                  {resourceWarningMessages.map((warningText) => (
                    <span key={warningText}>{warningText}</span>
                  ))}
                </div>
              }
              description={returnHomeError}
              className="overview-resource-warning"
            />
          ) : null}
        </div>
      </div>

      <div className="overview-primary-grid">
        <Card className="overview-resource-card" title="设备状态">
          <div className="overview-resource-grid">
            {resourceGauges.map((item) => (
              <div key={item.key} className="overview-resource-item">
                <Progress
                  type="circle"
                  percent={item.percent}
                  status={item.status}
                  strokeColor={item.strokeColor}
                  size={112}
                  format={() => (
                    <span className="overview-resource-circle-value">{item.displayValue}</span>
                  )}
                />
                <div className="overview-resource-meta">
                  <span className="overview-resource-icon">{item.icon}</span>
                  <Typography.Text strong>{item.label}</Typography.Text>
                </div>
                {item.tag ? <div className="overview-resource-tag">{item.tag}</div> : null}
              </div>
            ))}
          </div>
        </Card>

        <ExecutionCommandCard
          className="overview-panel-card overview-command-card"
          showStartBlockedAdvice={isActive}
        >
          <div className="overview-command-progress">
            <div className="overview-command-progress-title">执行进度</div>
            <ExecutionProgressInline topic={topicMap.runProgress} />
          </div>
        </ExecutionCommandCard>
      </div>

      <div className="overview-summary-grid">
        <div className="overview-status-card-grid">
          <Card className="overview-panel-card overview-robot-status-card" title="机器人状态">
            <div className="overview-robot-status-panel">
              <Progress
                type="circle"
                percent={robotStatus.percent}
                status={robotStatus.status}
                strokeColor={robotStatus.strokeColor}
                size={108}
                format={() => (
                  <span className="overview-robot-status-value">{robotStatus.label}</span>
                )}
              />
            </div>
          </Card>
          <Card className="overview-panel-card overview-manual-card">
            <div className="overview-manual-card-body">
              <ManualDriveControl className="overview-manual-card-action" />
            </div>
          </Card>
          <Card className="overview-panel-card overview-home-card">
            <div className="overview-home-card-body">
              <Button
                type="primary"
                icon={<HomeOutlined />}
                loading={returningHome}
                disabled={!canRequestReturnHome}
                className="overview-home-card-button"
                title={returnHomeDisabledReason ?? undefined}
                onClick={() => void handleReturnHomeSupply()}
              >
                回家
              </Button>
              {returnHomeError || returnHomeDisabledReason ? (
                <Typography.Text className="overview-home-card-error">
                  {returnHomeError || returnHomeDisabledReason}
                </Typography.Text>
              ) : null}
            </div>
          </Card>
        </div>
        <Card
          className="overview-today-card overview-final-today-card"
          title={
            <Space size="small">
              <CheckCircleOutlined />
              <span>完成情况</span>
            </Space>
          }
        >
          <div className="overview-completion-groups">
            <section className="overview-completion-group">
              <div className="overview-completion-label">今日</div>
              <div className="overview-today-grid">
                <div className="overview-today-metric">
                  <span>完成任务</span>
                  <strong>{dailyStats.completedTaskCount} 个</strong>
                </div>
                <div className="overview-today-metric">
                  <span>清扫距离</span>
                  <strong>{formatDistance(dailyDistanceM)}</strong>
                </div>
                <div className="overview-today-metric">
                  <span>清扫面积</span>
                  <strong>{formatArea(dailyAreaM2)}</strong>
                </div>
              </div>
            </section>
            <section className="overview-completion-group">
              <div className="overview-completion-label">累计</div>
              <div className="overview-today-grid">
                <div className="overview-today-metric">
                  <span>完成任务</span>
                  <strong>{cumulativeStats.completedTaskCount} 个</strong>
                </div>
                <div className="overview-today-metric">
                  <span>清扫距离</span>
                  <strong>{formatDistance(cumulativeDistanceM)}</strong>
                </div>
                <div className="overview-today-metric">
                  <span>清扫面积</span>
                  <strong>{formatArea(cumulativeAreaM2)}</strong>
                </div>
              </div>
            </section>
          </div>
        </Card>
      </div>
    </div>
  )
}
