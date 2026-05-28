import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  CaretRightOutlined,
  PauseOutlined,
  PlaySquareOutlined,
  StopOutlined,
} from '@ant-design/icons'

import { executeTaskCommand } from '../api/gateway/executionGateway'
import { manageTask } from '../api/gateway/taskGateway'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { ExecutionProgressCard } from '../components/runtime/ExecutionProgressCard'
import { getTaskListQueryKey } from '../features/task-management/taskQueryKeys'
import { useRosConnection } from '../hooks/useRosConnection'
import { useSlamWorkflowState } from '../hooks/useSlamWorkflowState'
import { useTaskStartGate } from '../hooks/useTaskStartGate'
import { useExecutionSessionStore } from '../stores/executionSessionStore'
import type { ExecutionCommandName } from '../types/execution'
import type { SystemReadiness } from '../types/systemReadiness'
import type { TaskEntity } from '../types/task'
import './ExecutionControlPage.css'

const UI_TEXT = {
  connectionConnected: 'ROS \u5df2\u8fde\u63a5',
  connectionConnecting: '\u8fde\u63a5\u4e2d',
  connectionError: '\u8fde\u63a5\u5f02\u5e38',
  connectionMock: 'Mock \u6570\u636e',
  connectionClosed: '\u8fde\u63a5\u5173\u95ed',
  connectionIdle: '\u7a7a\u95f2',
  disabledTask: '\u5df2\u7981\u7528',
  title: '\u4efb\u52a1\u6267\u884c\u63a7\u5236',
  intro:
    '\u5f53\u524d\u9875\u9762\u6b63\u5f0f\u53ea\u56f4\u7ed5 /coverage_task_manager/app/exe_task_server\u3001/coverage_task_manager/app/get_system_readiness \u4e0e /coverage_task_manager/system_readiness \u5de5\u4f5c\u3002\u5546\u7528\u4ea4\u4e92\u6539\u4e3a\u5148\u9009\u4efb\u52a1\u540d\u79f0\uff0c\u524d\u7aef\u518d\u81ea\u52a8\u643a\u5e26\u5bf9\u5e94\u7684\u6b63\u5f0f task_id \u6267\u884c START\uff0c\u4e0d\u518d\u8981\u6c42\u73b0\u573a\u4eba\u5458\u624b\u5de5\u8f93\u5165 task_id\u3002',
  interfaceTag: 'Execution \u6b63\u5f0f\u63a5\u53e3',
  rosFailed: 'ROS \u8fde\u63a5\u5931\u8d25',
  slamBusyTitle: '\u5f53\u524d\u5b58\u5728\u8fd0\u884c\u4e2d\u7684 SLAM \u4f5c\u4e1a',
  slamBusyDescriptionPrefix:
    '\u6267\u884c\u63a7\u5236\u5df2\u4e34\u65f6\u6536\u53e3\uff0c\u5f85\u4f5c\u4e1a\u7ed3\u675f\u540e\u518d\u5141\u8bb8 START\u3002',
  taskListLoadFailed: '\u4efb\u52a1\u5217\u8868\u52a0\u8f7d\u5931\u8d25',
  executionFailed: '\u4efb\u52a1\u6267\u884c\u547d\u4ee4\u5931\u8d25',
  commandReturnedSuffix: ' \u8fd4\u56de',
  controlCardTitle: '\u542f\u52a8\u524d\u68c0\u67e5\u4e0e\u547d\u4ee4\u4e0b\u53d1',
  taskNameLabel: '\u4efb\u52a1\u540d\u79f0',
  selectedTaskLabel: '\u5df2\u9009\u4efb\u52a1',
  currentTaskIdLabel: '\u6b63\u5f0f task_id',
  canStartTaskLabel: '\u5141\u8bb8\u542f\u52a8',
  taskMapLabel: '\u4efb\u52a1\u5730\u56fe',
  activeMapLabel: '\u5f53\u524d\u6fc0\u6d3b\u5730\u56fe',
  runtimeMapLabel: '\u8fd0\u884c\u65f6\u5730\u56fe',
  executorStateLabel: '\u6267\u884c\u5668\u72b6\u6001',
  slamJobLabel: 'SLAM \u4f5c\u4e1a',
  loadingTaskOptions: '\u6b63\u5728\u52a0\u8f7d\u4efb\u52a1\u5217\u8868',
  selectTaskPlaceholder: '\u8bf7\u9009\u62e9\u8981\u6267\u884c\u7684\u4efb\u52a1',
  selectTaskFirst: '\u8bf7\u5148\u9009\u62e9\u4efb\u52a1',
  selectTaskFirstDescription:
    '\u5546\u7528\u6267\u884c\u9875\u5df2\u53d6\u6d88\u624b\u5de5 task_id\u3002\u8bf7\u9009\u62e9\u4efb\u52a1\u540d\u79f0\uff0c\u524d\u7aef\u4f1a\u81ea\u52a8\u5e26\u4e0a\u5bf9\u5e94\u7684\u6b63\u5f0f task_id\u3002',
  startBlocked: '\u5f53\u524d START \u88ab\u95e8\u7981\u963b\u65ad',
  startReady: 'START \u524d\u68c0\u67e5\u901a\u8fc7',
  startReadyDescription:
    '\u524d\u7aef\u5f53\u524d\u770b\u5230 can_start_task=true\uff1b\u70b9\u51fb START \u65f6\u4ecd\u4f1a\u518d\u6b21\u4e3b\u52a8\u5237\u65b0 readiness\u3002',
  noTasksTitle: '\u6682\u65e0\u53ef\u9009\u4efb\u52a1',
  noTasksDescription:
    '\u8bf7\u5148\u5728\u4efb\u52a1\u7ba1\u7406\u9875\u521b\u5efa\u5e76\u542f\u7528\u4efb\u52a1\uff0c\u518d\u56de\u5230\u8fd9\u91cc\u6267\u884c\u3002',
  liveContextTitle: '\u5b9e\u65f6\u6267\u884c\u4e0a\u4e0b\u6587',
  returnDeferredNotice:
    '\u672c\u671f\u6309\u53d7\u63a7 live \u9a8c\u6536\u8fb9\u754c\uff0c\u6267\u884c\u9875\u6682\u4e0d\u5f00\u653e RETURN\u3002',
  selectTaskStartMessage:
    '\u8bf7\u5148\u9009\u62e9\u4efb\u52a1\u540d\u79f0\u3002START \u4f1a\u81ea\u52a8\u643a\u5e26\u8be5\u4efb\u52a1\u7684\u6b63\u5f0f task_id\u3002',
  startReadinessFailed:
    '\u542f\u52a8\u524d readiness \u68c0\u67e5\u5931\u8d25\uff0c\u672a\u83b7\u5f97\u6709\u6548\u7ed3\u679c\u3002',
  startReadinessBlockedPrefix: 'START \u5df2\u88ab readiness \u963b\u65ad\uff1a',
  startBlockedPrefix: 'START \u5df2\u88ab\u963b\u65ad\uff1a',
  startBlockedDefaultReason: '\u540e\u7aef\u8fd4\u56de can_start_task=false\u3002',
  startPrecheckPassedTitle: 'START 前 readiness 复查通过',
  startPrecheckBlockedTitle: 'START 前 readiness 复查阻断',
  startPrecheckFailedTitle: 'START 前 readiness 复查失败',
  blockingItemsLabel: '阻塞启动的问题',
  nonBlockingWarningsLabel: '非阻塞 warning',
  noNonBlockingWarnings: '无非阻塞 warning。',
  startPrecheckPassedDescription:
    '本次点击 START 前已主动刷新 readiness，后端返回 can_start_task=true。',
  executionServiceFailed: '\u4efb\u52a1\u6267\u884c\u670d\u52a1\u8c03\u7528\u5931\u8d25\u3002',
  autoTaskIdReason:
    '\u8bf7\u5148\u9009\u62e9\u4efb\u52a1\u540d\u79f0\u3002\u524d\u7aef\u4f1a\u81ea\u52a8\u5e26\u4e0a\u8be5\u4efb\u52a1\u7684\u6b63\u5f0f task_id\uff0c\u518d\u6267\u884c START\u3002',
  slamBusyReasonPrefix: '\u5f53\u524d SLAM \u4f5c\u4e1a\u4ecd\u5728\u6267\u884c\uff1a',
} as const

function normalizeExecutionToken(value: string | null | undefined) {
  return (value ?? '').trim().toUpperCase()
}

function getExecutionStateTokens(task: {
  missionState?: string
  phase?: string
  publicState?: string
  executorState?: string
} | null) {
  return [
    normalizeExecutionToken(task?.missionState),
    normalizeExecutionToken(task?.phase),
    normalizeExecutionToken(task?.publicState),
    normalizeExecutionToken(task?.executorState),
  ].filter((token) => token.length > 0)
}

function tokenMatchesAny(token: string, patterns: string[]) {
  return patterns.some((pattern) => token === pattern || token.includes(pattern))
}

function isPauseAllowed(task: {
  missionState?: string
  phase?: string
  publicState?: string
  executorState?: string
} | null) {
  const tokens = getExecutionStateTokens(task)

  return tokens.some((token) =>
    tokenMatchesAny(token, ['RUNNING', 'ACTIVE', 'EXECUT', 'WORKING', 'CLEANING', 'STARTING']),
  )
}

function isContinueAllowed(task: {
  missionState?: string
  phase?: string
  publicState?: string
  executorState?: string
} | null) {
  const tokens = getExecutionStateTokens(task)

  return tokens.some((token) =>
    tokenMatchesAny(token, ['PAUSE', 'PAUSED', 'HOLD', 'HELD', 'SUSPEND', 'SUSPENDED']),
  )
}

function isStopAllowed(task: {
  missionState?: string
  phase?: string
  publicState?: string
  executorState?: string
  blockingReasons?: string[]
} | null) {
  const tokens = getExecutionStateTokens(task)

  const hasActiveExecutionToken = tokens.some(
    (token) =>
      !tokenMatchesAny(token, ['IDLE', 'READY', 'SUCCEEDED', 'FAILED', 'STOPPED', 'DONE']),
  )

  if (hasActiveExecutionToken) {
    return true
  }

  const blockingReasons = task?.blockingReasons ?? []
  return blockingReasons.some((reason) =>
    normalizeExecutionToken(reason).startsWith('EXECUTOR NOT IDLE'),
  )
}

type ExecutionReadinessState = SystemReadiness | null

const EXECUTION_SETTLE_RETRY_COUNT = 12
const EXECUTION_SETTLE_DELAY_MS = 1_000

function doesCommandStateMatch(
  command: ExecutionCommandName,
  readiness: ExecutionReadinessState,
) {
  if (!readiness) {
    return false
  }

  switch (command) {
    case 'START':
      return !readiness.canStartTask && isPauseAllowed(readiness)
    case 'PAUSE':
      return isContinueAllowed(readiness)
    case 'CONTINUE':
      return isPauseAllowed(readiness)
    case 'STOP':
      return readiness.canStartTask
    default:
      return false
  }
}

function waitForExecutionSettle(delayMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs)
  })
}

const commandConfig: Array<{
  command: ExecutionCommandName
  title: string
  icon: ReactNode
  styleType?: 'primary' | 'default'
  danger?: boolean
}> = [
  { command: 'START', title: 'START', icon: <CaretRightOutlined />, styleType: 'primary' },
  { command: 'PAUSE', title: 'PAUSE', icon: <PauseOutlined /> },
  { command: 'CONTINUE', title: 'CONTINUE', icon: <PlaySquareOutlined /> },
  { command: 'STOP', title: 'STOP', icon: <StopOutlined />, danger: true },
]

function buildTaskOptionLabel(task: TaskEntity) {
  return task.name.trim() || `task-${task.id}`
}

export function ExecutionControlPage() {
  const { snapshot, reconnect } = useRosConnection()
  const [activeCommand, setActiveCommand] = useState<ExecutionCommandName | null>(null)
  const focusedTaskId = useExecutionSessionStore((state) => state.focusedTaskId)
  const focusedTaskName = useExecutionSessionStore((state) => state.focusedTaskName)
  const lastResult = useExecutionSessionStore((state) => state.lastResult)
  const transportError = useExecutionSessionStore((state) => state.transportError)
  const setFocusedTaskId = useExecutionSessionStore((state) => state.setFocusedTaskId)
  const setFocusedTaskName = useExecutionSessionStore((state) => state.setFocusedTaskName)
  const setLastResult = useExecutionSessionStore((state) => state.setLastResult)
  const setTransportError = useExecutionSessionStore((state) => state.setTransportError)

  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'
  const tasksQuery = useQuery({
    queryKey: getTaskListQueryKey(snapshot),
    queryFn: () => manageTask({ action: 'list' }),
    enabled: servicesReady,
    // The live task service can respond slowly when the robot is busy;
    // a light retry avoids leaving the execution page in a failed state
    // because of a single transient gateway timeout.
    retry: 1,
    retryDelay: 1_000,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })
  const selectedTask = useMemo(
    () => tasksQuery.data?.find((task) => task.id === focusedTaskId) ?? null,
    [focusedTaskId, tasksQuery.data],
  )
  const effectiveTaskId = selectedTask?.id ?? 0
  const readinessGate = useTaskStartGate(effectiveTaskId, snapshot)
  const slamState = useSlamWorkflowState(snapshot)
  const activeSlamJobId = slamState.effectiveState?.activeJobId?.trim() ?? ''
  const activeSlamJobPhase = slamState.effectiveState?.activeJobPhase?.trim() ?? ''
  const activeSlamJobStatus = slamState.effectiveState?.activeJobStatus?.trim() ?? ''
  const hasActiveSlamJob = activeSlamJobId.length > 0
  const taskOptions = useMemo(
    () =>
      (tasksQuery.data ?? []).map((task) => ({
        label: buildTaskOptionLabel(task),
        value: task.id,
        disabled: !task.enabled,
      })),
    [tasksQuery.data],
  )
  const slamJobSummary = useMemo(() => {
    const parts = [activeSlamJobId, activeSlamJobPhase, activeSlamJobStatus].filter(Boolean)
    return parts.length > 0 ? parts.join(' / ') : '--'
  }, [activeSlamJobId, activeSlamJobPhase, activeSlamJobStatus])

  const canStart = useMemo(
    () => servicesReady && selectedTask !== null && readinessGate.canIssueStart && !hasActiveSlamJob,
    [hasActiveSlamJob, readinessGate.canIssueStart, selectedTask, servicesReady],
  )
  const hasSelectedTask = selectedTask !== null && effectiveTaskId > 0
  const canPause = useMemo(
    () => servicesReady && hasSelectedTask && isPauseAllowed(readinessGate.effectiveReadiness),
    [hasSelectedTask, readinessGate.effectiveReadiness, servicesReady],
  )
  const canContinue = useMemo(
    () =>
      servicesReady && hasSelectedTask && isContinueAllowed(readinessGate.effectiveReadiness),
    [hasSelectedTask, readinessGate.effectiveReadiness, servicesReady],
  )
  const canStop = useMemo(
    () => servicesReady && hasSelectedTask && isStopAllowed(readinessGate.effectiveReadiness),
    [hasSelectedTask, readinessGate.effectiveReadiness, servicesReady],
  )

  useEffect(() => {
    if (!tasksQuery.data) {
      return
    }
    if (focusedTaskId !== null && !selectedTask) {
      setFocusedTaskId(null)
      setFocusedTaskName(null)
    }
  }, [focusedTaskId, selectedTask, setFocusedTaskId, setFocusedTaskName, tasksQuery.data])

  useEffect(() => {
    if (selectedTask && focusedTaskName !== selectedTask.name) {
      setFocusedTaskName(selectedTask.name)
    }
  }, [focusedTaskName, selectedTask, setFocusedTaskName])

  const handleReconnect = async () => {
    await reconnect()
    await Promise.all([
      readinessGate.serviceQuery.refetch(),
      slamState.refresh(),
      tasksQuery.refetch(),
    ])
  }

  const handleTaskChange = (nextTaskId: number | null) => {
    const nextTask =
      nextTaskId === null
        ? null
        : (tasksQuery.data?.find((task) => task.id === nextTaskId) ?? null)
    setFocusedTaskId(nextTask?.id ?? null)
    setFocusedTaskName(nextTask?.name ?? null)
    setLastResult(null)
    setTransportError(null)
  }

  const refreshExecutionReadiness = async (
    command: ExecutionCommandName,
    waitForStateChange: boolean,
  ) => {
    let latestReadiness: ExecutionReadinessState = readinessGate.effectiveReadiness
    const attempts = waitForStateChange ? EXECUTION_SETTLE_RETRY_COUNT : 1

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const nextPayload = await readinessGate.serviceQuery.refetch()
      latestReadiness = nextPayload.data?.readiness ?? latestReadiness

      if (doesCommandStateMatch(command, latestReadiness)) {
        break
      }

      if (attempt < attempts - 1) {
        // The execution service can acknowledge before the task manager/readiness
        // snapshot has flipped; keep the button loading state until the UI catches up.
        await waitForExecutionSettle(EXECUTION_SETTLE_DELAY_MS)
      }
    }
  }

  const handleCommand = async (command: ExecutionCommandName) => {
    setTransportError(null)
    setActiveCommand(command)
    try {
      if (command === 'START') {
        if (!selectedTask || effectiveTaskId <= 0) {
          setTransportError(UI_TEXT.selectTaskStartMessage)
          return
        }
        if (hasActiveSlamJob) {
          return
        }
        const readinessResult = await readinessGate.serviceQuery.refetch()
        const servicePayload = readinessResult.data
        const latestReadiness =
          servicePayload?.readiness ??
          readinessGate.topicSnapshot.readiness ??
          readinessGate.effectiveReadiness
        if (!servicePayload?.success) {
          const message = servicePayload?.message || UI_TEXT.startReadinessFailed
          setTransportError(message)
          return
        }
        if (!latestReadiness?.canStartTask) {
          return
        }
      }
      const result = await executeTaskCommand(command, effectiveTaskId)
      setLastResult(result)

      try {
        await refreshExecutionReadiness(command, result.success)
      } catch {
        // Preserve the execution service result even when the follow-up
        // readiness refresh hits a transient transport issue.
      }
    } catch (error) {
      try {
        await refreshExecutionReadiness(command, false)
      } catch {
        // The original execution error is more important than the refresh failure.
      }
      setTransportError(error instanceof Error ? error.message : UI_TEXT.executionServiceFailed)
    } finally {
      setActiveCommand(null)
    }
  }

  return (
    <div className="execution-page">
      <header className="execution-page-header">
        <div>
          <Typography.Title level={2}>{UI_TEXT.title}</Typography.Title>
        </div>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <AppFeedbackBanner
          tone="error"
          title={UI_TEXT.rosFailed}
          description={snapshot.lastError}
          actionLabel="重连"
          onAction={() => void handleReconnect()}
          className="execution-banner"
        />
      ) : null}

      {hasActiveSlamJob ? (
        <AppFeedbackBanner
          tone="warning"
          title={UI_TEXT.slamBusyTitle}
          description={`${UI_TEXT.slamBusyDescriptionPrefix}${slamJobSummary}`}
          className="execution-banner"
        />
      ) : null}

      {tasksQuery.error instanceof Error ? (
        <AppFeedbackBanner
          tone="warning"
          title={UI_TEXT.taskListLoadFailed}
          description={tasksQuery.error.message}
          actionLabel="重试"
          onAction={() => void tasksQuery.refetch()}
          className="execution-banner"
        />
      ) : null}

      {transportError ? (
        <AppFeedbackBanner
          tone="error"
          title={UI_TEXT.executionFailed}
          description={transportError}
          className="execution-banner"
        />
      ) : null}

      {lastResult && !lastResult.success ? (
        <AppFeedbackBanner
          tone="warning"
          title={`${lastResult.command}${UI_TEXT.commandReturnedSuffix}`}
          description={lastResult.message || '(empty backend message)'}
          className="execution-banner"
        />
      ) : null}

      <div className="execution-grid">
        <aside className="execution-column">
          <Card title={UI_TEXT.controlCardTitle} className="execution-card">
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Typography.Text strong>{UI_TEXT.taskNameLabel}</Typography.Text>
                <Select
                  showSearch
                  allowClear
                  loading={tasksQuery.isLoading}
                  style={{ width: '100%', marginTop: 8 }}
                  value={selectedTask?.id}
                  options={taskOptions}
                  optionFilterProp="label"
                  onChange={(value) =>
                    handleTaskChange(typeof value === 'number' ? value : null)
                  }
                  placeholder={
                    tasksQuery.isLoading ? UI_TEXT.loadingTaskOptions : UI_TEXT.selectTaskPlaceholder
                  }
                />
              </div>

              <div className="execution-command-grid">
                {commandConfig.map((entry) => {
                  const commandAllowed =
                    entry.command === 'START'
                      ? canStart
                      : entry.command === 'PAUSE'
                        ? canPause
                        : entry.command === 'CONTINUE'
                          ? canContinue
                          : canStop
                  const disabled =
                    !servicesReady ||
                    tasksQuery.isLoading ||
                    activeCommand !== null ||
                    !commandAllowed
                  return (
                    <Button
                      key={entry.command}
                      className="execution-command-button"
                      size="large"
                      type={entry.styleType}
                      danger={entry.danger}
                      icon={entry.icon}
                      loading={activeCommand === entry.command}
                      disabled={disabled}
                      onClick={() => void handleCommand(entry.command)}
                    >
                      {entry.title}
                    </Button>
                  )
                })}
              </div>

              {selectedTask === null || canStart ? (
                <div className="execution-command-status">
                  {selectedTask === null ? (
                    <Tag>{UI_TEXT.selectTaskFirst}</Tag>
                  ) : (
                    <Tag color="green">{UI_TEXT.startReady}</Tag>
                  )}
                </div>
              ) : null}

              {!tasksQuery.isLoading && (tasksQuery.data?.length ?? 0) === 0 ? (
                <AppEmptyState
                  title={UI_TEXT.noTasksTitle}
                  description={UI_TEXT.noTasksDescription}
                  actionLabel="刷新任务列表"
                  onAction={() => void tasksQuery.refetch()}
                />
              ) : null}
            </Space>
          </Card>
        </aside>

        <main className="execution-column">
          <ExecutionProgressCard className="execution-card" />
        </main>
      </div>
    </div>
  )
}
