import type { RuntimeTopicConfig, RuntimeTopicKey } from '../../types/runtime'

export const RUNTIME_TOPIC_CONFIGS: RuntimeTopicConfig[] = [
  {
    key: 'taskState',
    label: 'Task State',
    topicName: '/coverage_task_manager/state',
    staleAfterMs: 120_000,
  },
  {
    key: 'taskEvent',
    label: 'Task Event',
    topicName: '/coverage_task_manager/event',
    staleAfterMs: 120_000,
  },
  {
    key: 'executorState',
    label: 'Executor State',
    topicName: '/coverage_executor/state',
    staleAfterMs: 120_000,
  },
  {
    key: 'runProgress',
    label: 'Run Progress',
    topicName: '/coverage_executor/run_progress',
    staleAfterMs: 5_000,
  },
  {
    key: 'dockSupplyState',
    label: 'Dock / Supply State',
    topicName: '/dock_supply/state',
    staleAfterMs: 30_000,
  },
  {
    key: 'batteryState',
    label: 'Battery State',
    topicName: '/battery_state',
    staleAfterMs: 30_000,
  },
  {
    key: 'combinedStatus',
    label: 'Combined Status',
    topicName: '/combined_status',
    staleAfterMs: 30_000,
  },
  {
    key: 'stationStatus',
    label: 'Station Status',
    topicName: '/station_status',
    staleAfterMs: 30_000,
  },
]

const RUNTIME_TOPIC_CONFIG_MAP = Object.fromEntries(
  RUNTIME_TOPIC_CONFIGS.map((config) => [config.key, config]),
) as Record<RuntimeTopicKey, RuntimeTopicConfig>

export function getRuntimeTopicConfigs(topicKeys?: RuntimeTopicKey[]) {
  if (!topicKeys || topicKeys.length === 0) {
    return RUNTIME_TOPIC_CONFIGS
  }

  return topicKeys
    .map((key) => RUNTIME_TOPIC_CONFIG_MAP[key])
    .filter((config): config is RuntimeTopicConfig => Boolean(config))
}
