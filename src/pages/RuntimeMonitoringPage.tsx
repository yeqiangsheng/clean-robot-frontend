import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  Card,
  Descriptions,
  Progress,
  Statistic,
  Typography,
} from 'antd'
import {
  DashboardOutlined,
  DeploymentUnitOutlined,
  DownloadOutlined,
  FieldTimeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import { exportDiagnostics } from '../api/gateway/diagnosticsGateway'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { SystemReadinessCard } from '../components/readiness/SystemReadinessCard'
import { ExecutionProgressDetailsCard } from '../components/runtime/ExecutionProgressCard'
import { useRuntimeMonitor } from '../hooks/useRuntimeMonitor'
import { useRosConnection } from '../hooks/useRosConnection'
import { useExecutionSessionStore } from '../stores/executionSessionStore'
import type { RuntimeTopicKey, RuntimeTopicSnapshot } from '../types/runtime'
import './RuntimeMonitoringPage.css'

type JsonRecord = Record<string, unknown>

const CORE_RUNTIME_TOPIC_KEYS: RuntimeTopicKey[] = [
  'taskState',
  'executorState',
  'batteryState',
]

interface CumulativeRunRecord {
  completed: boolean
  maxDistanceM: number
}

interface CumulativeRuntimeStats {
  completedTaskCount: number
  runs: Record<string, CumulativeRunRecord>
}

const CUMULATIVE_STATS_STORAGE_KEY = 'clean_robot_runtime_cumulative_stats_v2'
const CLEANING_WIDTH_M = 0.6

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStringTopicValue(topic: RuntimeTopicSnapshot) {
  if (!isRecord(topic.rawMessage)) {
    return null
  }

  if (typeof topic.rawMessage.data === 'string' && topic.rawMessage.data.trim().length > 0) {
    return topic.rawMessage.data
  }

  if (typeof topic.rawMessage.state === 'string' && topic.rawMessage.state.trim().length > 0) {
    return topic.rawMessage.state
  }

  return null
}

function getRecordTopicValue(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

function formatLocalTimestamp(value: number | null) {
  if (value === null) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatNumber(value: unknown, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '--'
}

function formatInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Math.round(value))
    : '--'
}

function normalizePercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  const percent = value >= 0 && value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, percent))
}

function formatPercent(value: unknown, digits = 0) {
  const percent = normalizePercent(value)

  if (percent === null) {
    return '--'
  }

  return `${percent.toFixed(digits)}%`
}

function formatBool(value: unknown) {
  if (typeof value !== 'boolean') {
    return '--'
  }

  return value ? '是' : '否'
}

function formatArray(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return '--'
  }

  return value.join(', ')
}

function getTopicFreshness(topic: RuntimeTopicSnapshot) {
  switch (topic.health) {
    case 'live':
      return '实时'
    case 'stale':
      return '延迟'
    case 'waiting':
      return '等待数据'
    case 'unavailable':
      return '暂无数据'
    default:
      return '离线'
  }
}

function getCurrentTaskLabel(taskId: number | null, taskName: string | null) {
  if (taskId === null && !taskName) {
    return '--'
  }

  if (taskId !== null && taskName) {
    return `${taskName} / #${taskId}`
  }

  return taskName || String(taskId)
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function createEmptyCumulativeStats(): CumulativeRuntimeStats {
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

    const parsed = JSON.parse(raw) as Partial<CumulativeRuntimeStats>
    if (!isRecord(parsed.runs)) {
      return createEmptyCumulativeStats()
    }

    return {
      completedTaskCount:
        typeof parsed.completedTaskCount === 'number' && Number.isFinite(parsed.completedTaskCount)
          ? parsed.completedTaskCount
          : 0,
      runs: parsed.runs as Record<string, CumulativeRunRecord>,
    }
  } catch {
    return createEmptyCumulativeStats()
  }
}

function saveCumulativeStats(stats: CumulativeRuntimeStats) {
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

function getRunId(runProgress: JsonRecord) {
  const runId = runProgress.run_id
  const taskId = runProgress.task_id
  const zoneId = runProgress.zone_id

  if (typeof runId === 'string' && runId.trim()) {
    return runId.trim()
  }

  if (typeof taskId === 'number' && Number.isFinite(taskId)) {
    return `task-${taskId}`
  }

  if (typeof zoneId === 'string' && zoneId.trim()) {
    return `zone-${zoneId.trim()}`
  }

  return 'active-run'
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

function getRunDistance(runProgress: JsonRecord) {
  return getFiniteNumber(
    runProgress.path_s,
    runProgress.cleaned_distance_m,
    runProgress.covered_distance_m,
    runProgress.distance_m,
  )
}

function formatDistanceMetric(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} km`
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} m`
}

function formatAreaMetric(value: number) {
  return `${value.toFixed(value >= 100 ? 0 : 1)} m²`
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function RuntimeMonitoringPage() {
  const { snapshot, reconnect } = useRosConnection()
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false)
  const focusedTaskId = useExecutionSessionStore((state) => state.focusedTaskId)
  const focusedTaskName = useExecutionSessionStore((state) => state.focusedTaskName)
  const lastResult = useExecutionSessionStore((state) => state.lastResult)
  const transportError = useExecutionSessionStore((state) => state.transportError)
  const runtimeMonitor = useRuntimeMonitor(snapshot, { includeEndpointInfo: false })
  const { metaError, topicList, topicMap } = runtimeMonitor

  const taskStateTopic = topicMap.taskState
  const taskEventTopic = topicMap.taskEvent
  const executorStateTopic = topicMap.executorState
  const batteryStateTopic = topicMap.batteryState
  const combinedStatusTopic = topicMap.combinedStatus
  const dockSupplyTopic = topicMap.dockSupplyState
  const stationStatusTopic = topicMap.stationStatus
  const runProgressTopic = topicMap.runProgress
  const runProgress = getRecordTopicValue(runProgressTopic)
  const [cumulativeStats, setCumulativeStats] = useState<CumulativeRuntimeStats>(() =>
    loadCumulativeStats(),
  )
  const observedActiveRunIdsRef = useRef<Set<string>>(new Set())

  const coreRuntimeTopics = useMemo(
    () => topicList.filter((topic) => CORE_RUNTIME_TOPIC_KEYS.includes(topic.key)),
    [topicList],
  )
  const coreLiveTopicCount = useMemo(
    () => coreRuntimeTopics.filter((topic) => topic.health === 'live').length,
    [coreRuntimeTopics],
  )

  const taskStateValue = getStringTopicValue(taskStateTopic)
  const taskEventValue = getStringTopicValue(taskEventTopic)
  const executorStateValue = getStringTopicValue(executorStateTopic)
  const dockSupplyValue = getStringTopicValue(dockSupplyTopic)
  const stationStatusValue = getStringTopicValue(stationStatusTopic)
  const batteryState = getRecordTopicValue(batteryStateTopic)
  const combinedStatus = getRecordTopicValue(combinedStatusTopic)
  const batteryPercent =
    normalizePercent(batteryState?.percentage) ??
    normalizePercent(combinedStatus?.battery_percentage)
  const latestRuntimeUpdate = Math.max(
    taskStateTopic.lastMessageAt ?? 0,
    executorStateTopic.lastMessageAt ?? 0,
    batteryStateTopic.lastMessageAt ?? 0,
    combinedStatusTopic.lastMessageAt ?? 0,
    dockSupplyTopic.lastMessageAt ?? 0,
    stationStatusTopic.lastMessageAt ?? 0,
    runProgressTopic.lastMessageAt ?? 0,
  )
  const cumulativeDistanceM = useMemo(
    () =>
      Object.values(cumulativeStats.runs).reduce(
        (totalDistance, record) => totalDistance + Math.max(0, record.maxDistanceM || 0),
        0,
      ),
    [cumulativeStats.runs],
  )
  const cumulativeAreaM2 = cumulativeDistanceM * CLEANING_WIDTH_M
  const currentTaskLabel = getCurrentTaskLabel(focusedTaskId, focusedTaskName)
  const latestResultLabel = lastResult
    ? lastResult.success
      ? '成功'
      : '失败'
    : '空闲'
  const runtimeDataStatus = !snapshot.isConnected
    ? '离线'
    : coreLiveTopicCount === CORE_RUNTIME_TOPIC_KEYS.length
      ? '核心实时'
      : coreLiveTopicCount > 0
        ? '部分实时'
        : '等待数据'

  const handleReconnect = async () => {
    await reconnect()
  }

  const handleExportDiagnostics = async () => {
    setExportError(null)
    setExportingDiagnostics(true)

    try {
      const { filename, bundle } = await exportDiagnostics()
      downloadJson(filename, bundle)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出诊断包失败。')
    } finally {
      setExportingDiagnostics(false)
    }
  }

  useEffect(() => {
    if (!runProgress) {
      return
    }

    const runId = getRunId(runProgress)
    const distanceM = getRunDistance(runProgress)
    const completed = getRunCompleted(runProgress)
    const observedActiveRunIds = observedActiveRunIdsRef.current

    if (!completed) {
      observedActiveRunIds.add(runId)
    } else if (!observedActiveRunIds.has(runId)) {
      return
    }

    if (distanceM === null && !completed) {
      return
    }

    setCumulativeStats((current) => {
      const previousRun = current.runs[runId] ?? {
        completed: false,
        maxDistanceM: 0,
      }
      const nextRun = {
        completed: previousRun.completed || completed,
        maxDistanceM:
          distanceM === null ? previousRun.maxDistanceM : Math.max(previousRun.maxDistanceM, distanceM),
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
  }, [runProgress])

  return (
    <div className="runtime-page" data-testid="runtime-page">
      {snapshot.status === 'error' && snapshot.lastError ? (
        <AppFeedbackBanner
          tone="error"
          title="站点连接异常"
          description={snapshot.lastError}
          actionLabel="重连"
          onAction={() => void handleReconnect()}
          className="runtime-banner"
        />
      ) : null}

      {metaError ? (
        <AppFeedbackBanner
          tone="error"
          title="运行数据未返回"
          description={metaError}
          actionLabel="重连"
          onAction={() => void handleReconnect()}
          className="runtime-banner"
        />
      ) : null}

      {exportError ? (
        <AppFeedbackBanner
          tone="error"
          title="诊断包导出失败"
          description={exportError}
          className="runtime-banner"
        />
      ) : null}

      <div className="runtime-action-row">
        <Button
          className="runtime-export-diagnostics"
          data-testid="runtime-export-diagnostics"
          type="primary"
          icon={<DownloadOutlined />}
          loading={exportingDiagnostics}
          onClick={() => void handleExportDiagnostics()}
        >
          导出诊断包
        </Button>
      </div>

      <div className="runtime-summary-grid">
        <Card className="runtime-summary-card">
          <Statistic
            title="任务管理"
            value={taskStateValue || '--'}
            prefix={<DashboardOutlined />}
          />
        </Card>
        <Card className="runtime-summary-card">
          <Statistic
            title="执行器"
            value={executorStateValue || '--'}
            prefix={<FieldTimeOutlined />}
          />
        </Card>
        <Card className="runtime-summary-card">
          <Statistic
            title="电量"
            value={batteryPercent === null ? '--' : Math.round(batteryPercent)}
            suffix={batteryPercent === null ? undefined : '%'}
            prefix={<ThunderboltOutlined />}
          />
        </Card>
        <Card className="runtime-summary-card">
          <Statistic
            title="数据状态"
            value={runtimeDataStatus}
            prefix={<DeploymentUnitOutlined />}
          />
        </Card>
      </div>

      <Card
        title="累计完成情况"
        className="runtime-card runtime-cumulative-card"
      >
        <div className="runtime-cumulative-grid">
          <div className="runtime-cumulative-metric">
            <span>已完成任务</span>
            <strong>{cumulativeStats.completedTaskCount} 个</strong>
          </div>
          <div className="runtime-cumulative-metric">
            <span>清扫距离</span>
            <strong>{formatDistanceMetric(cumulativeDistanceM)}</strong>
          </div>
          <div className="runtime-cumulative-metric">
            <span>清扫面积</span>
            <strong>{formatAreaMetric(cumulativeAreaM2)}</strong>
          </div>
        </div>
      </Card>

      <div className="runtime-readiness">
        <SystemReadinessCard
          snapshot={snapshot}
          taskId={focusedTaskId ?? 0}
          title="任务启动前 readiness"
          compact
        />
      </div>

      <div className="runtime-grid">
        <aside className="runtime-column">
          <Card title="当前任务" className="runtime-card">
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="任务">
                <Typography.Text data-testid="shared-current-page-task">
                  {currentTaskLabel}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="任务 ID">
                <Typography.Text data-testid="shared-focused-task-id">
                  {focusedTaskId ?? '--'}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="最近命令">
                <Typography.Text data-testid="shared-latest-command">
                  {lastResult?.command ?? '--'}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="命令结果">
                <Typography.Text data-testid="shared-latest-result">
                  {latestResultLabel}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="回执">
                <Typography.Text data-testid="shared-latest-command-message">
                  {transportError || lastResult?.message || '--'}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="任务状态" className="runtime-card">
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="任务管理器">
                <Typography.Text data-testid="runtime-task-state-value">
                  {taskStateValue || '--'}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="执行器">
                <Typography.Text data-testid="runtime-executor-state-value">
                  {executorStateValue || '--'}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="最近事件">{taskEventValue || '--'}</Descriptions.Item>
              <Descriptions.Item label="任务状态数据">
                {getTopicFreshness(taskStateTopic)}
              </Descriptions.Item>
              <Descriptions.Item label="执行器数据">
                {getTopicFreshness(executorStateTopic)}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="补给与回桩" className="runtime-card">
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="补给状态">{dockSupplyValue || '--'}</Descriptions.Item>
              <Descriptions.Item label="充电桩">{stationStatusValue || '--'}</Descriptions.Item>
              <Descriptions.Item label="补给数据">{getTopicFreshness(dockSupplyTopic)}</Descriptions.Item>
              <Descriptions.Item label="充电桩数据">
                {getTopicFreshness(stationStatusTopic)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </aside>

        <main className="runtime-column">
          <ExecutionProgressDetailsCard
            className="runtime-card"
            topic={topicMap.runProgress}
          />

          <Card title="机器人状态" className="runtime-card">
            <div className="runtime-status-sections">
              <section className="runtime-status-section">
                <div className="runtime-section-title">电池</div>
                <Progress
                  percent={batteryPercent === null ? 0 : Math.round(batteryPercent)}
                  status={batteryPercent !== null && batteryPercent < 20 ? 'exception' : 'active'}
                />
                <Descriptions column={2} size="small" colon={false}>
                  <Descriptions.Item label="SOC">
                    {formatPercent(batteryState?.percentage ?? combinedStatus?.battery_percentage)}
                  </Descriptions.Item>
                  <Descriptions.Item label="电压">
                    {formatNumber(batteryState?.voltage ?? combinedStatus?.battery_voltage, 2)}
                  </Descriptions.Item>
                  <Descriptions.Item label="电流">
                    {formatNumber(batteryState?.current, 2)}
                  </Descriptions.Item>
                  <Descriptions.Item label="温度">
                    {formatNumber(batteryState?.temperature, 1)}
                  </Descriptions.Item>
                  <Descriptions.Item label="电池在线">
                    {formatBool(batteryState?.present)}
                  </Descriptions.Item>
                  <Descriptions.Item label="电池数据">
                    {getTopicFreshness(batteryStateTopic)}
                  </Descriptions.Item>
                </Descriptions>
              </section>

              <section className="runtime-status-section">
                <div className="runtime-section-title">清洁机构</div>
                <Descriptions column={2} size="small" colon={false}>
                  <Descriptions.Item label="清水量">
                    {formatPercent(combinedStatus?.clean_level)}
                  </Descriptions.Item>
                  <Descriptions.Item label="污水量">
                    {formatPercent(combinedStatus?.sewage_level)}
                  </Descriptions.Item>
                  <Descriptions.Item label="刷盘位置">
                    {formatInteger(combinedStatus?.brush_position)}
                  </Descriptions.Item>
                  <Descriptions.Item label="刮水耙位置">
                    {formatInteger(combinedStatus?.scraper_position)}
                  </Descriptions.Item>
                  <Descriptions.Item label="障碍状态">
                    {formatArray(combinedStatus?.obstacle_status)}
                  </Descriptions.Item>
                  <Descriptions.Item label="综合数据">
                    {getTopicFreshness(combinedStatusTopic)}
                  </Descriptions.Item>
                </Descriptions>
              </section>
            </div>
          </Card>

          <Card title="数据更新时间" className="runtime-card runtime-update-card">
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="最近更新">
                {latestRuntimeUpdate > 0 ? formatLocalTimestamp(latestRuntimeUpdate) : '--'}
              </Descriptions.Item>
              <Descriptions.Item label="核心通道">
                {coreLiveTopicCount} / {CORE_RUNTIME_TOPIC_KEYS.length}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </main>
      </div>
    </div>
  )
}
