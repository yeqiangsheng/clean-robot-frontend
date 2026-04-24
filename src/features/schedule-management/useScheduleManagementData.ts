import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { manageSchedule, manageTask } from '../../api/gateway/robotGateway'
import { getTaskListQueryKey } from '../task-management/taskQueryKeys'
import type { RosConnectionSnapshot } from '../../types/ros'

function isScheduleNotFoundError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.trim().toLowerCase().includes('schedule not found')
  )
}

export function useScheduleManagementData(
  snapshot: RosConnectionSnapshot,
  selectedScheduleId: string | null,
) {
  const servicesReady = snapshot.status !== 'connecting'

  const schedulesQuery = useQuery({
    queryKey: ['schedule-management', 'schedules', snapshot.url, snapshot.sessionId],
    queryFn: () => manageSchedule({ action: 'list' }),
    enabled: servicesReady,
    retry: false,
    staleTime: 15_000,
  })

  const tasksQuery = useQuery({
    queryKey: getTaskListQueryKey(snapshot),
    queryFn: () => manageTask({ action: 'list' }),
    enabled: servicesReady,
    retry: false,
    staleTime: 15_000,
  })

  const selectedSchedule = useMemo(
    () => schedulesQuery.data?.find((schedule) => schedule.id === selectedScheduleId) ?? null,
    [selectedScheduleId, schedulesQuery.data],
  )

  const selectedTaskForDetail = useMemo(
    () =>
      tasksQuery.data?.find((task) => task.id === (selectedSchedule?.taskId ?? 0)) ?? null,
    [selectedSchedule?.taskId, tasksQuery.data],
  )

  const detailQuery = useQuery({
    queryKey: [
      'schedule-management',
      'schedule-detail',
      selectedScheduleId,
      selectedSchedule?.taskId ?? 0,
      snapshot.url,
      snapshot.sessionId,
    ],
    queryFn: () =>
      manageSchedule({
        action: 'detail',
        scheduleId: selectedScheduleId ?? '',
        taskId: selectedSchedule?.taskId ?? 0,
      }),
    enabled: servicesReady && Boolean(selectedScheduleId),
    retry: false,
    staleTime: 15_000,
  })

  const detailNotFound = isScheduleNotFoundError(detailQuery.error)
  const selectedScheduleDetail = detailNotFound
    ? null
    : detailQuery.data ?? selectedSchedule

  const refetchScheduleData = async (options: { includeDetail?: boolean } = {}) => {
    const includeDetail = options.includeDetail !== false
    await Promise.all([schedulesQuery.refetch(), tasksQuery.refetch()])

    if (includeDetail && selectedScheduleId !== null) {
      await detailQuery.refetch()
    }
  }

  return {
    servicesReady,
    schedulesQuery,
    tasksQuery,
    detailQuery,
    selectedSchedule,
    selectedScheduleDetail,
    selectedTaskForDetail,
    detailNotFound,
    refetchScheduleData,
  }
}
