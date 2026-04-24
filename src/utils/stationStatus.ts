import type { RuntimeTopicSnapshot } from '../types/runtime'

export const STATION_STATUS_NON_BLOCKING_TITLE = '桩站状态暂未收到实时回报'
export const STATION_STATUS_NON_BLOCKING_DESCRIPTION =
  '当前未收到 /station_status 首包或最近反馈已延迟。这是非阻塞 warning，不影响主任务链、readiness、battery 或 combined_status，只影响桩站相关态感知。'

export function isStationStatusNonBlocking(topic: RuntimeTopicSnapshot) {
  return (
    topic.health === 'waiting' ||
    topic.health === 'stale' ||
    topic.health === 'unavailable'
  )
}

export function getStationStatusTag(topic: RuntimeTopicSnapshot) {
  if (topic.health === 'live') {
    return { color: 'green', label: '桩站状态实时' }
  }

  if (isStationStatusNonBlocking(topic)) {
    return { color: 'orange', label: '桩站状态缺失，不阻塞' }
  }

  return { color: 'default', label: '桩站状态未连接' }
}
