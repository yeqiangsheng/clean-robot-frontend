import type { RosConnectionSnapshot } from '../../types/ros'

export function getTaskListQueryKey(snapshot: RosConnectionSnapshot) {
  return ['tasks', 'list', snapshot.url, snapshot.sessionId] as const
}

export function getTaskDetailQueryKey(
  snapshot: RosConnectionSnapshot,
  taskId: number | null,
) {
  return ['tasks', 'detail', taskId ?? 0, snapshot.url, snapshot.sessionId] as const
}
