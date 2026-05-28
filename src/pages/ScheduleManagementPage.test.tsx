import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { manageSchedule } from '../api/gateway/scheduleGateway'
import { useProfileCatalog } from '../hooks/useProfileCatalog'
import { useRosConnection } from '../hooks/useRosConnection'
import type { RosConnectionSnapshot } from '../types/ros'
import type { ScheduleEntity } from '../types/schedule'
import type { TaskEntity } from '../types/task'
import { useScheduleManagementData } from '../features/schedule-management/useScheduleManagementData'
import { ScheduleManagementPage } from './ScheduleManagementPage'

vi.mock('../api/gateway/scheduleGateway', () => ({
  manageSchedule: vi.fn(),
}))

vi.mock('../hooks/useRosConnection', () => ({
  useRosConnection: vi.fn(),
}))

vi.mock('../hooks/useProfileCatalog', () => ({
  useProfileCatalog: vi.fn(),
}))

vi.mock('../features/schedule-management/useScheduleManagementData', () => ({
  useScheduleManagementData: vi.fn(),
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

const schedule: ScheduleEntity = {
  id: 'schedule_live_delete',
  taskId: 7,
  taskName: 'task_live_probe',
  enabled: true,
  type: 'daily',
  dow: [],
  time: '09:30',
  at: '',
  timezone: 'Asia/Shanghai',
  startDate: '',
  endDate: '',
  mapName: 'site_map_live',
  zoneId: 'zone_live',
  loops: 1,
  planProfileName: 'cover_standard',
  sysProfileName: 'standard',
  cleanMode: 'scrub',
  returnToDockOnFinish: false,
  repeatAfterFullCharge: false,
  lastFireTs: null,
  lastDoneTs: null,
  lastStatus: '',
  metadata: {},
  raw: {},
}

const task: TaskEntity = {
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

describe('ScheduleManagementPage', () => {
  const refetchScheduleData = vi.fn()
  let scheduleDeleted = false

  beforeEach(() => {
    scheduleDeleted = false
    refetchScheduleData.mockReset()
    refetchScheduleData.mockResolvedValue(undefined)

    vi.mocked(useRosConnection).mockReturnValue({
      snapshot: connectedSnapshot,
      reconnect: vi.fn(),
    } as unknown as ReturnType<typeof useRosConnection>)

    vi.mocked(useProfileCatalog).mockReturnValue(({
      entries: [],
      entryByName: new Map(),
      selectOptions: [],
      defaultEntry: null,
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown) as ReturnType<typeof useProfileCatalog>)

    vi.mocked(useScheduleManagementData).mockImplementation((_snapshot, selectedScheduleId) => {
      const schedules = scheduleDeleted ? [] : [schedule]
      const selectedSchedule =
        selectedScheduleId && !scheduleDeleted
          ? schedules.find((item) => item.id === selectedScheduleId) ?? null
          : null

      return {
        servicesReady: true,
        schedulesQuery: {
          data: schedules,
          isLoading: false,
          isFetching: false,
          error: null,
          refetch: vi.fn(),
        },
        tasksQuery: {
          data: [task],
          isLoading: false,
          isFetching: false,
          error: null,
          refetch: vi.fn(),
        },
        detailQuery: {
          data: selectedSchedule,
          isLoading: false,
          isFetching: false,
          error: null,
          refetch: vi.fn(),
        },
        selectedSchedule,
        selectedScheduleDetail: selectedSchedule,
        selectedTaskForDetail: task,
        detailNotFound: false,
        refetchScheduleData,
      } as unknown as ReturnType<typeof useScheduleManagementData>
    })

    vi.mocked(manageSchedule).mockImplementation(async (options) => {
      if (options.action === 'delete') {
        scheduleDeleted = true
        return {
          success: true,
          message: 'deleted',
          raw: {},
        } as never
      }

      return null as never
    })
  })

  it('clears the selected detail and list after a hard delete response', async () => {
    const { container } = render(<ScheduleManagementPage />)

    expect(await screen.findAllByText('schedule_live_delete')).not.toHaveLength(0)
    expect(screen.getByText('当前显示 1 / 1 条调度。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /删\s*除/ }).length).toBeGreaterThan(1)
    })

    const deleteButtons = screen.getAllByRole('button', { name: /删\s*除/ })
    fireEvent.click(deleteButtons[deleteButtons.length - 1])

    await waitFor(() => {
      expect(manageSchedule).toHaveBeenCalledWith({
        action: 'delete',
        scheduleId: 'schedule_live_delete',
        taskId: 7,
      })
    })

    expect(refetchScheduleData).toHaveBeenCalledWith({ includeDetail: false })
    expect(
      await screen.findByText('调度 schedule_live_delete 已删除，后端返回：deleted。'),
    ).toBeInTheDocument()
    expect(screen.getByText('当前显示 0 / 0 条调度。')).toBeInTheDocument()
    expect(screen.getByText('暂无调度')).toBeInTheDocument()
    expect(screen.getByText('请选择一个调度')).toBeInTheDocument()
    expect(container.querySelectorAll('.schedule-list-item')).toHaveLength(0)
  })
})
