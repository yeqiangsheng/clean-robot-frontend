import { getRosConnectionManager } from './client'

import type {
  RuntimeMonitorOptions,
  RuntimeTopicConfig,
  RuntimeTopicKey,
  RuntimeTopicMeta,
} from '../../types/runtime'
import type { RosServiceRequest } from '../../types/ros'

type JsonRecord = Record<string, unknown>

const ROSAPI_TOPIC_TYPE_SERVICE = '/rosapi/topic_type'
const ROSAPI_TOPIC_TYPE = 'rosapi/TopicType'
const ROSAPI_PUBLISHERS_SERVICE = '/rosapi/publishers'
const ROSAPI_PUBLISHERS_TYPE = 'rosapi/Publishers'
const ROSAPI_SUBSCRIBERS_SERVICE = '/rosapi/subscribers'
const ROSAPI_SUBSCRIBERS_TYPE = 'rosapi/Subscribers'

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function pickString(record: JsonRecord, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

async function callRosApiService(
  serviceName: string,
  serviceType: string,
  request: RosServiceRequest,
) {
  const client = getRosConnectionManager()
  return client.callService<RosServiceRequest, JsonRecord>({
    serviceName,
    serviceType,
    request,
  })
}

async function fetchTopicType(topicName: string) {
  const payload = await callRosApiService(ROSAPI_TOPIC_TYPE_SERVICE, ROSAPI_TOPIC_TYPE, {
    topic: topicName,
  })

  return isRecord(payload) ? pickString(payload, 'type') : ''
}

async function fetchTopicPublishers(topicName: string) {
  const payload = await callRosApiService(
    ROSAPI_PUBLISHERS_SERVICE,
    ROSAPI_PUBLISHERS_TYPE,
    {
      topic: topicName,
    },
  )

  return isRecord(payload) ? normalizeStringArray(payload.publishers) : []
}

async function fetchTopicSubscribers(topicName: string) {
  const payload = await callRosApiService(
    ROSAPI_SUBSCRIBERS_SERVICE,
    ROSAPI_SUBSCRIBERS_TYPE,
    {
      topic: topicName,
    },
  )

  return isRecord(payload) ? normalizeStringArray(payload.subscribers) : []
}

export function getRuntimeTopicConfigs(topicKeys?: RuntimeTopicKey[]) {
  if (!topicKeys || topicKeys.length === 0) {
    return RUNTIME_TOPIC_CONFIGS
  }

  return topicKeys
    .map((key) => RUNTIME_TOPIC_CONFIG_MAP[key])
    .filter((config): config is RuntimeTopicConfig => Boolean(config))
}

export async function fetchRuntimeTopicMeta(
  topicName: string,
  options: Pick<RuntimeMonitorOptions, 'includeEndpointInfo'> = {},
): Promise<RuntimeTopicMeta> {
  try {
    const includeEndpointInfo = options.includeEndpointInfo !== false
    const messageType = await fetchTopicType(topicName)

    let publishers: string[] = []
    let subscribers: string[] = []

    if (includeEndpointInfo) {
      ;[publishers, subscribers] = await Promise.all([
        fetchTopicPublishers(topicName),
        fetchTopicSubscribers(topicName),
      ])
    } else if (messageType) {
      publishers = ['type-only']
    }

    return {
      messageType,
      publishers,
      subscribers,
      metaError: null,
    }
  } catch (error) {
    return {
      messageType: '',
      publishers: [],
      subscribers: [],
      metaError:
        error instanceof Error ? error.message : 'Runtime topic metadata query failed.',
    }
  }
}

export async function fetchRuntimeTopicMetas(
  options: RuntimeMonitorOptions = {},
) {
  const configs = getRuntimeTopicConfigs(options.topicKeys)
  const entries = await Promise.all(
    configs.map(async (config) => [
      config.key,
      await fetchRuntimeTopicMeta(config.topicName, options),
    ]),
  )

  return Object.fromEntries(entries) as Record<RuntimeTopicKey, RuntimeTopicMeta>
}
