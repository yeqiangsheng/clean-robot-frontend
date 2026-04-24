import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SystemReadinessCard } from './SystemReadinessCard'
import { useSystemReadiness } from '../../hooks/useSystemReadiness'
import type { RosConnectionSnapshot } from '../../types/ros'

vi.mock('../../hooks/useSystemReadiness', () => ({
  useSystemReadiness: vi.fn(),
}))

const mockSnapshot: RosConnectionSnapshot = {
  status: 'connected',
  url: 'ws://127.0.0.1:9090',
  isConnected: true,
  lastError: null,
  connectedAt: Date.now(),
  sessionId: 1,
  gatewayStatus: 'online',
  gatewayLastError: null,
}

const mockReadiness = {
  overallReady: true,
  canStartTask: true,
  taskId: 0,
  taskName: '',
  taskMapName: '',
  taskZoneId: '',
  taskPlanProfile: '',
  activeMapName: 'demo-map',
  activeMapId: '',
  activeMapMd5: '',
  runtimeMapName: 'demo-map',
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
}

describe('SystemReadinessCard', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.mocked(useSystemReadiness).mockReturnValue({
      serviceQuery: {
        isFetching: false,
        isLoading: false,
        data: { success: true, message: '', readiness: mockReadiness },
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
        messageCount: 3,
        lastMessageAt: Date.now(),
        ageMs: 0,
        readiness: mockReadiness,
      },
      effectiveReadiness: mockReadiness,
      topicMatchesTask: true,
    } as unknown as ReturnType<typeof useSystemReadiness>)
  })

  it('marks task_id=0 as system-only instead of a start-ready task', () => {
    render(<SystemReadinessCard snapshot={mockSnapshot} taskId={0} />)

    expect(screen.getAllByText('系统基线 (task_id=0)')).toHaveLength(2)
    expect(screen.getByText('当前只是在看系统基线')).toBeInTheDocument()
    expect(screen.getByText('N/A')).toBeInTheDocument()
    expect(screen.queryByText('选中任务已通过启动前检查')).not.toBeInTheDocument()
  })

  it('formats known checks into operator-friendly summaries', () => {
    const readinessWithChecks = {
      ...mockReadiness,
      warnings: ['station_status stale or missing'],
      checks: [
        {
          key: 'health',
          level: 'ok',
          ok: true,
          fresh: true,
          stale: false,
          missing: false,
          ageS: -1,
          summary: 'OK',
          raw: {},
        },
        {
          key: 'battery',
          level: 'ok',
          ok: true,
          fresh: true,
          stale: false,
          missing: false,
          ageS: 0.2,
          summary: 'soc=0.620',
          raw: {},
        },
        {
          key: 'task_manager',
          level: 'ok',
          ok: true,
          fresh: true,
          stale: false,
          missing: false,
          ageS: 0.3,
          summary: 'mission=IDLE phase=IDLE public=IDLE',
          raw: {},
        },
        {
          key: 'station_status',
          level: 'warn',
          ok: false,
          fresh: false,
          stale: true,
          missing: false,
          ageS: -1,
          summary: 'stale/missing',
          raw: {},
        },
      ],
    }

    vi.mocked(useSystemReadiness).mockReturnValue({
      serviceQuery: {
        isFetching: false,
        isLoading: false,
        data: { success: true, message: '', readiness: readinessWithChecks },
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
        messageCount: 3,
        lastMessageAt: Date.now(),
        ageMs: 0,
        readiness: readinessWithChecks,
      },
      effectiveReadiness: readinessWithChecks,
      topicMatchesTask: true,
    } as unknown as ReturnType<typeof useSystemReadiness>)

    render(<SystemReadinessCard snapshot={mockSnapshot} taskId={0} />)

    expect(screen.getByText('系统健康')).toBeInTheDocument()
    expect(screen.getByText('系统健康正常')).toBeInTheDocument()
    expect(screen.getByText('电量 62%')).toBeInTheDocument()
    expect(
      screen.getByText('任务管理状态：IDLE，阶段 IDLE，对外状态 IDLE'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/站状态.*延迟或缺失/).length).toBeGreaterThan(0)
    expect(screen.queryByText('原始键：battery')).not.toBeInTheDocument()
    expect(screen.queryByText('-1.0s')).not.toBeInTheDocument()
  })

  it('keeps station_status stale or missing as a non-blocking warning for a selected task', () => {
    const readinessWithStationWarning = {
      ...mockReadiness,
      taskId: 42,
      taskName: 'night-clean',
      canStartTask: true,
      warnings: ['station_status stale or missing'],
      checks: [
        {
          key: 'station_status',
          level: 'warn',
          ok: false,
          fresh: false,
          stale: true,
          missing: false,
          ageS: -1,
          summary: 'stale/missing',
          raw: {},
        },
      ],
    }

    vi.mocked(useSystemReadiness).mockReturnValue({
      serviceQuery: {
        isFetching: false,
        isLoading: false,
        data: { success: true, message: '', readiness: readinessWithStationWarning },
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
        messageCount: 3,
        lastMessageAt: Date.now(),
        ageMs: 0,
        readiness: readinessWithStationWarning,
      },
      effectiveReadiness: readinessWithStationWarning,
      topicMatchesTask: true,
    } as unknown as ReturnType<typeof useSystemReadiness>)

    render(<SystemReadinessCard snapshot={mockSnapshot} taskId={42} />)

    expect(screen.getByText('当前任务已通过启动前检查')).toBeInTheDocument()
    expect(screen.getAllByText('非阻塞 warning').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/站状态.*延迟或缺失/).length).toBeGreaterThan(0)
    expect(screen.queryByText('存在阻断启动的问题')).not.toBeInTheDocument()
  })
})
