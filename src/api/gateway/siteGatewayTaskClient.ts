import type { AuditEventRecord } from '../../types/appShell'
import type { TaskDraftInput, TaskEntity } from '../../types/task'
import { appendAuditEventFromResponse, requestJson } from './siteGatewayHttp'

export async function requestTaskList() {
  return requestJson<TaskEntity[]>('/tasks')
}

export async function requestTaskDetail(taskId: number) {
  return requestJson<TaskEntity | null>(`/tasks/${Math.max(0, Math.round(taskId))}`)
}

export async function requestCreateTask(input: TaskDraftInput) {
  const result = await requestJson<{
    task: TaskEntity
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestUpdateTask(task: TaskEntity, input: TaskDraftInput) {
  const result = await requestJson<{
    task: TaskEntity
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>(`/tasks/${task.id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestDeleteTask(taskId: number) {
  const result = await requestJson<{
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>(`/tasks/${Math.max(0, Math.round(taskId))}`, {
    method: 'DELETE',
  })
  appendAuditEventFromResponse(result)
  return result
}

