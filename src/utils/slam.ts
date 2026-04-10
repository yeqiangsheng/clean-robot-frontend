import type {
  SlamTopicHealth,
  SlamWorkflowJob,
  SlamWorkflowState,
} from '../types/slam-workflow'

function normalizeStateToken(value: string) {
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

export function buildTimestampedMapName(baseName?: string) {
  const normalizedBase = sanitizeMapNamePart(baseName || 'slam_map') || 'slam_map'
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
  ].join('') + `_${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}${padDatePart(now.getSeconds())}`

  return `${normalizedBase}_${stamp}`
}

export function getSlamConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: '已连接' }
    case 'connecting':
      return { color: 'processing', label: '连接中' }
    case 'error':
      return { color: 'error', label: '异常' }
    case 'closed':
      return { color: 'warning', label: '已关闭' }
    case 'mock':
      return { color: 'purple', label: '模拟数据' }
    default:
      return { color: 'default', label: '空闲' }
  }
}

export function getTopicHealthPresentation(health: SlamTopicHealth) {
  switch (health) {
    case 'live':
      return { color: 'green', label: '实时更新' }
    case 'stale':
      return { color: 'orange', label: '回报延迟' }
    case 'waiting':
      return { color: 'blue', label: '等待回报' }
    case 'unavailable':
      return { color: 'default', label: '未发布' }
    default:
      return { color: 'red', label: '已断开' }
  }
}

export function getWorkflowStateTag(state: SlamWorkflowState | null) {
  const token = normalizeStateToken(state?.workflowState ?? '')

  if (token === 'LOCALIZED') {
    return { color: 'success', label: '已定位' }
  }

  if (token === 'LOCALIZING') {
    return { color: 'processing', label: '定位中' }
  }

  if (token === 'MAPPING') {
    return { color: 'geekblue', label: '建图中' }
  }

  if (token === 'MANUAL_ASSIST_REQUIRED') {
    return { color: 'orange', label: '需要人工辅助' }
  }

  if (token === 'IDLE') {
    return { color: 'default', label: '空闲' }
  }

  return { color: 'default', label: state?.workflowState ?? '--' }
}

export function getLocalizationTag(state: SlamWorkflowState | null) {
  const token = normalizeStateToken(state?.localizationState ?? '')

  if (token.includes('LOCALIZED') || state?.localizationValid === true) {
    return { color: 'success', label: '已定位' }
  }

  if (token.includes('RELOCALIZING') || token.includes('LOCALIZING')) {
    return { color: 'processing', label: '定位中' }
  }

  if (token.includes('NOT') || token.includes('INVALID')) {
    return { color: 'warning', label: '未定位' }
  }

  return { color: 'default', label: state?.localizationState || '--' }
}

export function getTaskReadyTag(state: SlamWorkflowState | null) {
  if (state?.taskReady) {
    return { color: 'success', label: '任务可执行' }
  }

  return { color: 'default', label: '尚未就绪' }
}

export function getManualAssistTag(state: SlamWorkflowState | null) {
  return state?.manualAssistRequired
    ? { color: 'orange', label: '人工辅助' }
    : { color: 'default', label: '无需辅助' }
}

export function getMappingSessionTag(state: SlamWorkflowState | null) {
  return state?.mappingSessionActive
    ? { color: 'geekblue', label: '建图会话进行中' }
    : { color: 'default', label: '未建图' }
}

export function getSlamJobStateTag(job: SlamWorkflowJob | null) {
  const token = normalizeStateToken(job?.jobState ?? '')

  if (token === 'SUCCEEDED') {
    return { color: 'success', label: '已成功' }
  }

  if (token === 'FAILED') {
    return { color: 'error', label: '失败' }
  }

  if (token === 'MANUAL_ASSIST_REQUIRED') {
    return { color: 'orange', label: '需要人工辅助' }
  }

  if (token === 'CANCELED') {
    return { color: 'default', label: '已取消' }
  }

  if (token.length > 0) {
    return { color: 'processing', label: job?.jobState ?? '进行中' }
  }

  return { color: 'default', label: '--' }
}
