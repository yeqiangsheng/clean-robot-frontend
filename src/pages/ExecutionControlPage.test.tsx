import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executeTaskCommand } from '../api/gateway/executionGateway'
import { manageTask } from '../api/gateway/taskGateway'
import { useRosConnection } from '../hooks/useRosConnection'
import { useSlamWorkflowState } from '../hooks/useSlamWorkflowState'
import { useTaskStartGate } from '../hooks/useTaskStartGate'
import { useExecutionSessionStore } from '../stores/executionSessionStore'
import type { RosConnectionSnapshot } from '../types/ros'
import type { SystemReadiness } from '../types/systemReadiness'
import type { TaskEntity } from '../types/task'
import { ExecutionControlPage } from './ExecutionControlPage'

vi.mock('../api/gateway/executionGateway', () => ({
  executeTaskCommand: vi.fn(),
}))

vi.mock('../api/gateway/taskGateway', () => ({
  manageTask: vi.fn(),
}))

vi.mock('../hooks/useRosConnection', () => ({
  useRosConnection: vi.fn(),
}))

vi.mock('../hooks/useSlamWorkflowState', () => ({
  useSlamWorkflowState: vi.fn(),
}))

vi.mock('../hooks/useTaskStartGate', () => ({
  useTaskStartGate: vi.fn(),
}))

const connectedSnapshot: RosConnectionSnapshot = {
  status: 'connected',
  isConnected: true,
  lastError: null,
  connectedAt: Date.now(),
  sessionId: 1,
  gatewayStatus: 'online',
  gatewayLastError: null,
}

const selectedTask: TaskEntity = {
  id: 7,
  name: 'task_live_probe',
  enabled: true,
  status: 0,
  mapName: 'site_map_live',
  zoneId: 'zone_live',
  planProfileName: 'cover_standard',
  sysProfileName: 'standard',
  cleanMode: 'scrub',
  returnToDockOnFinish: false,
  repeatAfterFullCharge: false,
  loops: 1,
  metadata: {},
  raw: {},
}

const readyState: SystemReadiness = {
  overallReady: true,
  canStartTask: true,
  taskId: 7,
  taskName: selectedTask.name,
  taskMapName: selectedTask.mapName,
  taskZoneId: selectedTask.zoneId,
  taskPlanProfile: selectedTask.planProfileName,
  activeMapName: selectedTask.mapName,
  activeMapId: '',
  activeMapMd5: '',
  runtimeMapName: selectedTask.mapName,
  runtimeMapId: '',
  runtimeMapMd5: '',
  missionState: 'IDLE',
  phase: 'IDLE',
  publicState: 'IDLE',
  executorState: 'IDLE',
  dockSupplyState: 'IDLE',
  batterySoc: 80,
  batteryValid: true,
  blockingReasons: [],
  warnings: [],
  checks: [],
  stampMs: Date.now(),
  raw: {},
}

function renderExecutionControlPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ExecutionControlPage />
    </QueryClientProvider>,
  )
}

describe('ExecutionControlPage', () => {
  const readinessRefetch = vi.fn()

  beforeEach(() => {
    useExecutionSessionStore.getState().reset()
    useExecutionSessionStore.getState().setFocusedTaskId(selectedTask.id)
    useExecutionSessionStore.getState().setFocusedTaskName(selectedTask.name)

    vi.mocked(manageTask).mockResolvedValue([selectedTask] as never)
    vi.mocked(executeTaskCommand).mockResolvedValue({
      command: 'START',
      taskId: selectedTask.id,
      success: true,
      message: 'accepted: start',
      raw: {},
    })
    vi.mocked(useRosConnection).mockReturnValue({
      snapshot: connectedSnapshot,
      reconnect: vi.fn(),
    } as unknown as ReturnType<typeof useRosConnection>)
    vi.mocked(useSlamWorkflowState).mockReturnValue({
      effectiveState: {
        activeJobId: '',
        activeJobPhase: '',
        activeJobStatus: '',
      },
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useSlamWorkflowState>)

    readinessRefetch.mockResolvedValue({
      data: {
        success: true,
        message: '',
        readiness: readyState,
      },
    })
    vi.mocked(useTaskStartGate).mockReturnValue({
      serviceQuery: {
        refetch: readinessRefetch,
        isFetching: false,
        isLoading: false,
        data: {
          success: true,
          message: '',
          readiness: readyState,
        },
        error: null,
      },
      topicSnapshot: {
        topicName: '/coverage_task_manager/system_readiness',
        messageType: 'cleanrobot_app_msgs/SystemReadiness',
        publishers: ['node-a'],
        subscribers: [],
        metaError: null,
        subscribeError: null,
        health: 'live',
        messageCount: 10,
        lastMessageAt: Date.now(),
        ageMs: 0,
        readiness: readyState,
      },
      effectiveReadiness: readyState,
      topicMatchesTask: true,
      canIssueStart: true,
      blockingChecks: [],
      warningChecks: [],
      blockingCheckSummaries: [],
      warningCheckSummaries: [],
      allWarningSummaries: [],
      primaryBlockReason: '',
    } as unknown as ReturnType<typeof useTaskStartGate>)
  })

  afterEach(() => {
    vi.clearAllMocks()
    useExecutionSessionStore.getState().reset()
  })

  it('keeps START on the canonical task_id and refreshes readiness before dispatch', async () => {
    renderExecutionControlPage()

    expect(await screen.findByText(/task_live_probe/)).toBeInTheDocument()
    expect(screen.queryByText('readiness card')).not.toBeInTheDocument()
    expect(screen.queryByText('\u6b63\u5f0f task_id')).not.toBeInTheDocument()
    expect(screen.getByText(/START \u524d\u68c0\u67e5\u901a\u8fc7/)).toBeInTheDocument()
    expect(screen.queryByText(['/exe', '_task_server'].join(''))).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /START/ }))

    await waitFor(() => {
      expect(readinessRefetch).toHaveBeenCalled()
      expect(executeTaskCommand).toHaveBeenCalledWith('START', selectedTask.id)
    })

    expect(readinessRefetch.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(executeTaskCommand).mock.invocationCallOrder[0],
    )
  })
})
