import type { ScheduleDraftInput, ScheduleEntity } from '../../types/schedule'
import type { TaskEntity } from '../../types/task'

export const DOW_OPTIONS = [
  { label: '周一', value: 0 },
  { label: '周二', value: 1 },
  { label: '周三', value: 2 },
  { label: '周四', value: 3 },
  { label: '周五', value: 4 },
  { label: '周六', value: 5 },
  { label: '周日', value: 6 },
]

export function buildTimestampScheduleId(prefix: string) {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')

  return `${prefix}_${stamp}`
}

export function formatScheduleTimestamp(value: number | null) {
  if (!value) {
    return '--'
  }

  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

export function formatDow(values: number[]) {
  if (values.length === 0) {
    return '--'
  }

  return values
    .map((value) => DOW_OPTIONS.find((option) => option.value === value)?.label ?? String(value))
    .join(', ')
}

export function formatReturnToDock(value: boolean) {
  return value ? '完成后回桩' : '原地结束'
}

export function formatRepeatAfterFullCharge(value: boolean) {
  return value ? '满电后续扫' : '不续扫'
}

export function formatScheduleType(value: string) {
  switch (value) {
    case 'once':
      return '单次'
    case 'daily':
      return '每日'
    case 'weekly':
      return '每周'
    default:
      return value || '--'
  }
}

export function buildCreateScheduleDefaults(task: TaskEntity | null): ScheduleDraftInput {
  const now = new Date()
  const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(now.getDate()).padStart(2, '0')}`
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`

  return {
    scheduleId: buildTimestampScheduleId('schedule'),
    taskId: task?.id ?? 0,
    enabled: false,
    type: 'once',
    dow: [4],
    time: currentTime,
    at: `${currentDate} ${currentTime}`,
    timezone: 'Asia/Shanghai',
    startDate: currentDate,
    endDate: '',
  }
}

export function buildEditScheduleDefaults(schedule: ScheduleEntity): ScheduleDraftInput {
  return {
    scheduleId: schedule.id,
    taskId: schedule.taskId,
    enabled: schedule.enabled,
    type: schedule.type,
    dow: schedule.dow,
    time: schedule.time,
    at: schedule.at,
    timezone: schedule.timezone,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
  }
}

export function getScheduleMetadataEntries(schedule: ScheduleEntity | null) {
  if (!schedule) {
    return []
  }

  return Object.entries(schedule.metadata).slice(0, 16)
}
