import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { manageTask } from '../../api/gateway/taskGateway'
import { getTaskDetailQueryKey, getTaskListQueryKey } from './taskQueryKeys'
import type { RosConnectionSnapshot } from '../../types/ros'

export function useTaskManagementData(
  snapshot: RosConnectionSnapshot,
  selectedTaskId: number | null,
) {
  const servicesReady = snapshot.status !== 'connecting'

  const tasksQuery = useQuery({
    queryKey: getTaskListQueryKey(snapshot),
    queryFn: () => manageTask({ action: 'list' }),
    enabled: servicesReady,
    retry: false,
    staleTime: 15_000,
  })

  const selectedTask = useMemo(
    () => tasksQuery.data?.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasksQuery.data],
  )

  const detailQuery = useQuery({
    queryKey: getTaskDetailQueryKey(snapshot, selectedTaskId),
    queryFn: () => manageTask({ action: 'detail', taskId: selectedTaskId ?? 0 }),
    enabled: servicesReady && selectedTaskId !== null,
    retry: false,
    staleTime: 15_000,
  })

  const selectedTaskDetail = detailQuery.data ?? selectedTask

  const refetchTaskData = async () => {
    await tasksQuery.refetch()

    if (selectedTaskId !== null) {
      await detailQuery.refetch()
    }
  }

  return {
    servicesReady,
    tasksQuery,
    detailQuery,
    selectedTask,
    selectedTaskDetail,
    refetchTaskData,
  }
}
