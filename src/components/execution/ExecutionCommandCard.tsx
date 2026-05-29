import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { CaretRightOutlined, PauseOutlined, PlaySquareOutlined, StopOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Select, Tag } from 'antd'

import { executeTaskCommand } from '../../api/gateway/executionGateway'
import { manageTask } from '../../api/gateway/taskGateway'
import { AppEmptyState } from '../feedback/AppEmptyState'
import { getTaskListQueryKey } from '../../features/task-management/taskQueryKeys'
import { useRosConnection } from '../../hooks/useRosConnection'
import { useSlamWorkflowState } from '../../hooks/useSlamWorkflowState'
import { useTaskStartGate } from '../../hooks/useTaskStartGate'
import { useAppShellStore } from '../../stores/appShellStore'
import { useExecutionSessionStore } from '../../stores/executionSessionStore'
import type { ExecutionCommandName } from '../../types/execution'
import type { SystemReadiness } from '../../types/systemReadiness'
import type { TaskEntity } from '../../types/task'
import './ExecutionCommandCard.css'

const UI_TEXT = {
  disabledTask: '已禁用',
  controlCardTitle: '任务控制',
  taskNameLabel: '任务名称',
  loadingTaskOptions: '正在加载任务列表',
  selectTaskPlaceholder: '请选择要执行的任务',
  selectTaskFirst: '请先选择任务',
  startReady: 'START 前检查通过',
  noTasksTitle: '暂无可选任务',
  noTasksDescription: '请先在任务管理页创建并启用任务，再回到这里执行。',
  refreshTaskList: '刷新任务列表',
  selectTaskStartMessage: '请先选择任务名称。START 会自动携带该任务的正式 task_id。',
  startReadinessFailed: '启动前 readiness 检查失败，未获得有效结果。',
  localizationBlockedAdvice: '当前定位无效，请把小车移动到不同的位置重启或者联系运维人员。',
  genericBlockedAdvice: '当前暂不满足启动条件，请重新启动或者联系运维人员。',
  executionServiceFailed: '任务执行服务调用失败。',
  taskListLoadFailed: '任务列表加载失败',
  slamBusy: 'SLAM 作业运行中',
} as const

type ExecutionReadinessState = SystemReadiness | null

const EXECUTION_SETTLE_RETRY_COUNT = 12
const EXECUTION_SETTLE_DELAY_MS = 1_000

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
    (token) => !tokenMatchesAny(token, ['IDLE', 'READY', 'SUCCEEDED', 'FAILED', 'STOPPED', 'DONE']),
  )

  if (hasActiveExecutionToken) {
    return true
  }

  const blockingReasons = task?.blockingReasons ?? []
  return blockingReasons.some((reason) =>
    normalizeExecutionToken(reason).startsWith('EXECUTOR NOT IDLE'),
  )
}

function doesCommandStateMatch(command: ExecutionCommandName, readiness: ExecutionReadinessState) {
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
  { command: 'START', title: '开始', icon: <CaretRightOutlined />, styleType: 'primary' },
  { command: 'PAUSE', title: '暂停', icon: <PauseOutlined /> },
  { command: 'CONTINUE', title: '继续', icon: <PlaySquareOutlined /> },
  { command: 'STOP', title: '结束', icon: <StopOutlined />, danger: true },
]

function buildTaskOptionLabel(task: TaskEntity) {
  return task.name.trim() || `task-${task.id}`
}

function normalizeBlockText(value: string) {
  return value.trim().toLowerCase()
}

function isLocalizationBlockText(value: string) {
  const normalized = normalizeBlockText(value)

  return (
    normalized.includes('localization') ||
    normalized.includes('localized') ||
    normalized.includes('manual_assist') ||
    normalized.includes('manual assist') ||
    normalized.includes('定位')
  )
}

function getStartBlockedAdvice(readinessGate: ReturnType<typeof useTaskStartGate>) {
  const readiness = readinessGate.effectiveReadiness
  const blockingTexts = [
    ...(readiness?.blockingReasons ?? []),
    ...readinessGate.blockingCheckSummaries,
    ...readinessGate.blockingChecks.flatMap((check) => [
      check.key,
      check.summary,
      JSON.stringify(check.raw ?? {}),
    ]),
  ].filter((value) => value.trim().length > 0)

  const hasLocalizationBlock =
    readinessGate.blockingChecks.some((check) => check.key === 'localization' && !check.ok) ||
    blockingTexts.some(isLocalizationBlockText)

  return hasLocalizationBlock ? UI_TEXT.localizationBlockedAdvice : UI_TEXT.genericBlockedAdvice
}

interface ExecutionCommandCardProps {
  className?: string
  children?: ReactNode
  showStartBlockedAdvice?: boolean
}

export function ExecutionCommandCard({
  className,
  children,
  showStartBlockedAdvice = false,
}: ExecutionCommandCardProps) {
  const { snapshot } = useRosConnection()
  const [activeCommand, setActiveCommand] = useState<ExecutionCommandName | null>(null)
  const focusedTaskId = useExecutionSessionStore((state) => state.focusedTaskId)
  const focusedTaskName = useExecutionSessionStore((state) => state.focusedTaskName)
  const setFocusedTaskId = useExecutionSessionStore((state) => state.setFocusedTaskId)
  const setFocusedTaskName = useExecutionSessionStore((state) => state.setFocusedTaskName)
  const setLastResult = useExecutionSessionStore((state) => state.setLastResult)
  const setTransportError = useExecutionSessionStore((state) => state.setTransportError)
  const grantedCapabilities = useAppShellStore((state) => state.grantedCapabilities)

  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'
  const tasksQuery = useQuery({
    queryKey: getTaskListQueryKey(snapshot),
    queryFn: () => manageTask({ action: 'list' }),
    enabled: servicesReady,
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
  const canReadSlamState = grantedCapabilities.includes('slamWorkbench')
  const slamState = useSlamWorkflowState(snapshot, { enabled: canReadSlamState })
  const hasActiveSlamJob = Boolean(slamState.effectiveState?.activeJobId?.trim())
  const hasSelectedTask = selectedTask !== null && effectiveTaskId > 0
  const startReadiness = readinessGate.effectiveReadiness
  const canIssueStart =
    effectiveTaskId > 0 &&
    snapshot.status !== 'connecting' &&
    Boolean(startReadiness?.canStartTask)

  const taskOptions = useMemo(
    () =>
      (tasksQuery.data ?? []).map((task) => {
        const taskLabel = buildTaskOptionLabel(task)

        return {
          label: (
            <span className="execution-command-card-task-option-label">
              {taskLabel}
            </span>
          ),
          searchLabel: taskLabel,
          value: task.id,
          disabled: !task.enabled,
        }
      }),
    [tasksQuery.data],
  )
  const canStart = useMemo(
    () => servicesReady && hasSelectedTask && canIssueStart && !hasActiveSlamJob,
    [canIssueStart, hasActiveSlamJob, hasSelectedTask, servicesReady],
  )
  const canPause = useMemo(
    () =>
      servicesReady &&
      hasSelectedTask &&
      isPauseAllowed(readinessGate.effectiveReadiness),
    [hasSelectedTask, readinessGate.effectiveReadiness, servicesReady],
  )
  const canContinue = useMemo(
    () =>
      servicesReady &&
      hasSelectedTask &&
      isContinueAllowed(readinessGate.effectiveReadiness),
    [hasSelectedTask, readinessGate.effectiveReadiness, servicesReady],
  )
  const canStop = useMemo(
    () =>
      servicesReady &&
      hasSelectedTask &&
      isStopAllowed(readinessGate.effectiveReadiness),
    [hasSelectedTask, readinessGate.effectiveReadiness, servicesReady],
  )
  const shouldShowStartBlockedAdvice =
    showStartBlockedAdvice &&
    servicesReady &&
    hasSelectedTask &&
    !canIssueStart &&
    Boolean(startReadiness) &&
    !canPause &&
    !canContinue &&
    !canStop
  const startBlockedAdvice = shouldShowStartBlockedAdvice
    ? getStartBlockedAdvice(readinessGate)
    : null

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
          setTransportError(UI_TEXT.slamBusy)
          return
        }
        const readinessResult = await readinessGate.serviceQuery.refetch()
        const servicePayload = readinessResult.data
        const latestReadiness =
          servicePayload?.readiness ??
          readinessGate.topicSnapshot.readiness ??
          readinessGate.effectiveReadiness

        if (!servicePayload?.success) {
          setTransportError(servicePayload?.message || UI_TEXT.startReadinessFailed)
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
        // Keep the execution service result visible even if readiness refresh is transient.
      }
    } catch (error) {
      try {
        await refreshExecutionReadiness(command, false)
      } catch {
        // The command error is the actionable result for the operator.
      }
      setTransportError(error instanceof Error ? error.message : UI_TEXT.executionServiceFailed)
    } finally {
      setActiveCommand(null)
    }
  }

  const cardClassName = ['execution-command-card', className].filter(Boolean).join(' ')

  return (
    <Card title={UI_TEXT.controlCardTitle} className={cardClassName}>
      <div className="execution-command-card-content">
        <div>
          <Select
            showSearch
            allowClear
            className="execution-command-card-task-select"
            classNames={{
              popup: {
                root: 'execution-command-card-task-select-popup',
                listItem: 'execution-command-card-task-select-option',
              },
            }}
            loading={tasksQuery.isLoading}
            style={{ width: '100%' }}
            value={selectedTask?.id}
            options={taskOptions}
            optionFilterProp="searchLabel"
            optionLabelProp="label"
            onChange={(value) => handleTaskChange(typeof value === 'number' ? value : null)}
            placeholder={
              <span className="execution-command-card-placeholder">
                {tasksQuery.isLoading ? UI_TEXT.loadingTaskOptions : UI_TEXT.selectTaskPlaceholder}
              </span>
            }
          />
        </div>

        <div className="execution-command-card-grid">
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
                className="execution-command-card-button"
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

        {selectedTask !== null && canStart ? (
          <div className="execution-command-card-status">
            <Tag color="green">{UI_TEXT.startReady}</Tag>
          </div>
        ) : null}

        {startBlockedAdvice ? (
          <div className="execution-command-card-start-advice" role="alert" aria-live="polite">
            <span className="execution-command-card-start-advice-icon" aria-hidden="true">
              !
            </span>
            <span className="execution-command-card-start-advice-text">{startBlockedAdvice}</span>
          </div>
        ) : null}

        {tasksQuery.error instanceof Error ? (
          <Tag color="orange">{`${UI_TEXT.taskListLoadFailed}: ${tasksQuery.error.message}`}</Tag>
        ) : null}

        {!tasksQuery.isLoading && (tasksQuery.data?.length ?? 0) === 0 ? (
          <AppEmptyState
            title={UI_TEXT.noTasksTitle}
            description={UI_TEXT.noTasksDescription}
            actionLabel={UI_TEXT.refreshTaskList}
            onAction={() => void tasksQuery.refetch()}
          />
        ) : null}

        {children ? <div className="execution-command-card-footer">{children}</div> : null}
      </div>
    </Card>
  )
}
