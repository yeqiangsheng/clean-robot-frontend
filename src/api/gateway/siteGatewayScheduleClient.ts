import type { AuditEventRecord } from '../../types/appShell'
import type { ScheduleDraftInput, ScheduleEntity } from '../../types/schedule'
import type { TaskEntity } from '../../types/task'
import { appendAuditEventFromResponse, requestJson } from './siteGatewayHttp'

export async function requestScheduleList() {
  return requestJson<ScheduleEntity[]>('/schedules')
}

export async function requestScheduleDetail(scheduleId: string, taskId = 0) {
  return requestJson<ScheduleEntity | null>(
    `/schedules/${encodeURIComponent(scheduleId)}?taskId=${Math.max(0, Math.round(taskId))}`,
  )
}

export async function requestCreateSchedule(input: ScheduleDraftInput, task: TaskEntity | null) {
  const result = await requestJson<{
    schedule: ScheduleEntity
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>('/schedules', {
    method: 'POST',
    body: JSON.stringify({ input, task }),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestUpdateSchedule(
  schedule: ScheduleEntity,
  input: ScheduleDraftInput,
  task: TaskEntity | null,
) {
  const result = await requestJson<{
    schedule: ScheduleEntity
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>(`/schedules/${encodeURIComponent(schedule.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ input, task }),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestDeleteSchedule(scheduleId: string, taskId = 0) {
  const result = await requestJson<{
    message: string
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>(`/schedules/${encodeURIComponent(scheduleId)}?taskId=${Math.max(0, Math.round(taskId))}`, {
    method: 'DELETE',
  })
  appendAuditEventFromResponse(result)
  return result
}

