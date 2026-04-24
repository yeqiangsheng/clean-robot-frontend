import type {
  SlamActionKind,
  SlamTopicHealth,
  SlamWorkflowJob,
  SlamWorkflowState,
} from '../types/slam-workflow'

export type SlamPageMode =
  | 'steady_localization'
  | 'steady_mapping'
  | 'job_running'
  | 'system_blocked'
  | 'job_failed'

export const SLAM_STATE_QUERY_INTERVAL_MS = 2_000
export const SLAM_JOB_POLL_INTERVAL_MS = 1_000

function normalizeToken(value: string) {
  return value.trim().toUpperCase()
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function sanitizeMapNamePart(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^0-9A-Za-z_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeLookupKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const SLAM_ACTION_LABELS: Record<string, string> = {
  switch_map: '切图并定位',
  switch_map_and_localize: '切图并定位',
  restart_localization: '重新定位',
  relocalize: '重新定位',
  start_mapping: '开始建图',
  save_mapping: '保存地图',
  stop_mapping: '停止建图',
  prepare_for_task: '任务前准备',
  verify_map_revision: '校验地图版本',
  activate_map_revision: '激活地图版本',
}

const SLAM_PHASE_LABELS: Record<string, string> = {
  accepted: '已受理',
  queued: '排队中',
  pending: '等待执行',
  dispatching: '正在下发',
  starting: '准备启动',
  switching_map: '切换地图',
  switch_map_and_localize: '切图并定位',
  relocalizing: '重新定位',
  restart_localization: '重新定位',
  creating_map: '正在采图',
  mapping: '建图中',
  saving_map: '保存地图',
  stop_mapping: '停止建图',
  finishing: '收尾中',
  succeeded: '已完成',
  success: '已完成',
  failed: '执行失败',
  rejected: '已拒绝',
  canceled: '已取消',
  cancelled: '已取消',
}

export function isMappingMode(state: SlamWorkflowState | null) {
  return normalizeToken(state?.currentMode ?? '') === 'MAPPING'
}

export function isSlamJobTerminalState(jobStatus: string, done?: boolean | null) {
  if (done === true) {
    return true
  }

  const normalized = normalizeToken(jobStatus)
  return ['SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELED', 'CANCELLED'].includes(
    normalized,
  )
}

export function formatBoolText(value: boolean | null) {
  if (value === null) {
    return '--'
  }

  return value ? '是' : '否'
}

export function formatPercent(value: number | null, digits = 0) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  const normalized = value >= 0 && value <= 1 ? value * 100 : value
  return `${normalized.toFixed(digits)}%`
}

export function formatDateTime(value: number | null) {
  if (value === null) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

export function formatAge(ageMs: number | null) {
  if (ageMs === null) {
    return '--'
  }

  if (ageMs < 1000) {
    return `${ageMs} ms 前`
  }

  return `${(ageMs / 1000).toFixed(1)} s 前`
}

export function formatAgeSeconds(value: number | null) {
  if (value === null) {
    return '--'
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} s`
}

export function buildTimestampedMapName(baseName?: string) {
  const normalizedBase = sanitizeMapNamePart(baseName || 'slam_map') || 'slam_map'
  const now = new Date()
  const stamp =
    [now.getFullYear(), padDatePart(now.getMonth() + 1), padDatePart(now.getDate())].join('') +
    `_${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}${padDatePart(now.getSeconds())}`

  return `${normalizedBase}_${stamp}`
}

export function getSlamActionLabel(action: SlamActionKind | string | null | undefined) {
  const raw = typeof action === 'string' ? action.trim() : ''

  if (!raw) {
    return 'SLAM 动作'
  }

  return SLAM_ACTION_LABELS[normalizeLookupKey(raw)] ?? raw
}

export function getSlamPhaseLabel(phase: string | null | undefined) {
  const raw = typeof phase === 'string' ? phase.trim() : ''

  if (!raw) {
    return '--'
  }

  return SLAM_PHASE_LABELS[normalizeLookupKey(raw)] ?? raw
}

export function getSlamJobProgressPercent(job: SlamWorkflowJob | null) {
  if (job?.progress01 === null || job?.progress01 === undefined) {
    return job?.done && job.success === true ? 100 : null
  }

  if (!Number.isFinite(job.progress01)) {
    return null
  }

  return job.progress01 >= 0 && job.progress01 <= 1 ? job.progress01 * 100 : job.progress01
}

export function getSlamJobProgressLabel(job: SlamWorkflowJob | null) {
  const percent = getSlamJobProgressPercent(job)

  if (percent === null) {
    return '--'
  }

  return `${percent.toFixed(percent >= 10 || Number.isInteger(percent) ? 0 : 1)}%`
}

export function getSlamJobHeadline(job: SlamWorkflowJob | null) {
  if (!job) {
    return '当前没有 SLAM 作业'
  }

  const actionLabel = getSlamActionLabel(job.operationName)
  const token = normalizeToken(job.status)

  if (job.done && job.success === true) {
    return `${actionLabel}已完成`
  }

  if (job.done && job.success === false) {
    return `${actionLabel}失败`
  }

  if (['PENDING', 'QUEUED', 'ACCEPTED'].includes(token)) {
    return `${actionLabel}已提交`
  }

  return `${actionLabel}进行中`
}

export function getSlamJobSummary(job: SlamWorkflowJob | null) {
  if (!job) {
    return '等待新的 SLAM 动作提交。'
  }

  const parts: string[] = []
  const phaseLabel = getSlamPhaseLabel(job.phase)
  const progressLabel = getSlamJobProgressLabel(job)
  const mapName = job.resolvedMapName || job.requestedMapName

  if (phaseLabel !== '--') {
    parts.push(`阶段：${phaseLabel}`)
  }

  if (progressLabel !== '--') {
    parts.push(`进度：${progressLabel}`)
  }

  if (mapName) {
    parts.push(`地图：${mapName}`)
  }

  return parts.join(' | ') || '等待后端返回更多作业信息。'
}

export function getSlamJobResultDetail(job: SlamWorkflowJob | null) {
  if (!job) {
    return '后端暂未返回可用的作业结果。'
  }

  const parts: string[] = []

  if (job.errorCode) {
    parts.push(`错误码：${job.errorCode}`)
  }

  if (job.message) {
    parts.push(job.message)
  }

  if (parts.length > 0) {
    return parts.join(' | ')
  }

  if (job.done && job.success === true) {
    const mapName = job.resolvedMapName || job.requestedMapName
    return mapName ? `目标地图：${mapName}` : '作业已完成，后端未附带额外说明。'
  }

  if (job.phase) {
    return `当前阶段：${getSlamPhaseLabel(job.phase)}`
  }

  return '等待后端返回更多作业信息。'
}

export function getSlamConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: 'ROS 已连接' }
    case 'connecting':
      return { color: 'processing', label: '连接中' }
    case 'error':
      return { color: 'error', label: '连接异常' }
    case 'closed':
      return { color: 'warning', label: '连接关闭' }
    case 'mock':
      return { color: 'purple', label: 'Mock 数据' }
    default:
      return { color: 'default', label: '空闲' }
  }
}

export function getTopicHealthPresentation(health: SlamTopicHealth) {
  switch (health) {
    case 'live':
      return { color: 'green', label: '实时' }
    case 'stale':
      return { color: 'orange', label: '延迟' }
    case 'waiting':
      return { color: 'blue', label: '等待首帧' }
    case 'unavailable':
      return { color: 'default', label: '暂无发布' }
    default:
      return { color: 'red', label: '已断开' }
  }
}

export function getWorkflowStateTag(state: SlamWorkflowState | null) {
  if (!state) {
    return { color: 'default', label: '--' }
  }

  if (isMappingMode(state)) {
    return { color: 'geekblue', label: '建图中' }
  }

  if (state.activeJobId.trim()) {
    return { color: 'processing', label: '作业执行中' }
  }

  if (state.localizationValid === true) {
    return { color: 'success', label: '定位稳定' }
  }

  if (state.localizationValid === false) {
    return { color: 'warning', label: '定位未就绪' }
  }

  return { color: 'default', label: state.currentMode || '--' }
}

export function getLocalizationTag(state: SlamWorkflowState | null) {
  const token = normalizeToken(state?.localizationState ?? '')

  if (state?.localizationValid === true || token.includes('LOCALIZED')) {
    return { color: 'success', label: '已定位' }
  }

  if (token.includes('RELOCALIZING') || token.includes('LOCALIZING')) {
    return { color: 'processing', label: '重定位中' }
  }

  if (state?.localizationValid === false || token.includes('INVALID') || token.includes('LOST')) {
    return { color: 'warning', label: '定位异常' }
  }

  return { color: 'default', label: state?.localizationState || '--' }
}

export function getTaskReadyTag(canStartTask: boolean | null) {
  if (canStartTask === true) {
    return { color: 'success', label: '任务可启动' }
  }

  if (canStartTask === false) {
    return { color: 'error', label: '启动受阻' }
  }

  return { color: 'default', label: '待检查' }
}

export function getMapFreshnessTag(state: SlamWorkflowState | null) {
  if (state?.mapTopicFresh === true) {
    return { color: 'success', label: '地图新鲜' }
  }

  if (state?.mapTopicFresh === false) {
    return { color: 'warning', label: '地图延迟' }
  }

  return { color: 'default', label: '地图未知' }
}

export function getSlamJobStateTag(job: SlamWorkflowJob | null) {
  const token = normalizeToken(job?.status ?? '')

  if (job?.done && job.success === true) {
    return { color: 'success', label: '已完成' }
  }

  if (job?.done && job.success === false) {
    return { color: 'error', label: '已失败' }
  }

  if (['RUNNING', 'ACTIVE'].includes(token)) {
    return { color: 'processing', label: '执行中' }
  }

  if (['PENDING', 'QUEUED', 'ACCEPTED'].includes(token)) {
    return { color: 'blue', label: '排队中' }
  }

  if (token.length > 0) {
    return { color: 'default', label: job?.status ?? '--' }
  }

  return { color: 'default', label: '--' }
}

export function getSlamPageModeTag(pageMode: SlamPageMode) {
  switch (pageMode) {
    case 'steady_mapping':
      return { color: 'geekblue', label: '建图稳态' }
    case 'job_running':
      return { color: 'processing', label: '作业运行中' }
    case 'system_blocked':
      return { color: 'error', label: '系统阻断' }
    case 'job_failed':
      return { color: 'error', label: '最近作业失败' }
    default:
      return { color: 'success', label: '定位稳态' }
  }
}

export function getSlamPageMode(options: {
  state: SlamWorkflowState | null
  readinessBlocked: boolean
  job: SlamWorkflowJob | null
}) {
  if (options.state?.activeJobId.trim()) {
    return 'job_running' as const
  }

  if (options.readinessBlocked) {
    return 'system_blocked' as const
  }

  if (options.job?.done && options.job.success === false) {
    return 'job_failed' as const
  }

  if (isMappingMode(options.state)) {
    return 'steady_mapping' as const
  }

  return 'steady_localization' as const
}
