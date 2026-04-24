import { Topic } from 'roslib'

import { getRosConnectionManager } from './client'
import {
  normalizeSlamWorkflowJob,
  normalizeSlamWorkflowState,
} from './slamWorkflowServices'
import {
  SLAM_WORKFLOW_JOB_TOPIC_NAME,
  SLAM_WORKFLOW_JOB_TOPIC_TYPE,
  SLAM_WORKFLOW_STATE_TOPIC_NAME,
  SLAM_WORKFLOW_STATE_TOPIC_TYPE,
} from './queryContracts'
export {
  SLAM_WORKFLOW_JOB_TOPIC_NAME,
  SLAM_WORKFLOW_JOB_TOPIC_TYPE,
  SLAM_WORKFLOW_STATE_TOPIC_NAME,
  SLAM_WORKFLOW_STATE_TOPIC_TYPE,
} from './queryContracts'

import type { RosServiceRequest } from '../../types/ros'
import type {
  JsonRecord,
  SlamTopicMeta,
  SlamWorkflowJob,
  SlamWorkflowState,
} from '../../types/slam-workflow'

const ROSAPI_TOPIC_TYPE_SERVICE = '/rosapi/topic_type'
const ROSAPI_TOPIC_TYPE = 'rosapi/TopicType'
const ROSAPI_PUBLISHERS_SERVICE = '/rosapi/publishers'
const ROSAPI_PUBLISHERS_TYPE = 'rosapi/Publishers'
const ROSAPI_SUBSCRIBERS_SERVICE = '/rosapi/subscribers'
const ROSAPI_SUBSCRIBERS_TYPE = 'rosapi/Subscribers'

export const SLAM_WORKFLOW_TOPIC_STALE_AFTER_MS = 5_000

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
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

  return isRecord(payload) && typeof payload.type === 'string' ? payload.type : ''
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

async function fetchTopicMeta(topicName: string): Promise<SlamTopicMeta> {
  try {
    const [messageType, publishers, subscribers] = await Promise.all([
      fetchTopicType(topicName),
      fetchTopicPublishers(topicName),
      fetchTopicSubscribers(topicName),
    ])

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
        error instanceof Error ? error.message : `Topic metadata query failed for ${topicName}.`,
    }
  }
}

export async function fetchSlamWorkflowTopicMeta() {
  return fetchTopicMeta(SLAM_WORKFLOW_STATE_TOPIC_NAME)
}

export async function fetchSlamJobTopicMeta() {
  return fetchTopicMeta(SLAM_WORKFLOW_JOB_TOPIC_NAME)
}

export function subscribeToSlamWorkflowState(options: {
  onMessage: (state: SlamWorkflowState) => void
  onWarning?: (warning: string) => void
}) {
  const ros = getRosConnectionManager().getRos()

  if (!ros) {
    throw new Error('rosbridge is not connected.')
  }

  const topic = new Topic<JsonRecord>({
    ros,
    name: SLAM_WORKFLOW_STATE_TOPIC_NAME,
    messageType: SLAM_WORKFLOW_STATE_TOPIC_TYPE,
    queue_length: 1,
    throttle_rate: 0,
    reconnect_on_close: true,
  })

  topic.on('warning', (warning) => {
    options.onWarning?.(warning)
  })

  topic.subscribe((message) => {
    const normalized = normalizeSlamWorkflowState(message)

    if (normalized) {
      options.onMessage(normalized)
    }
  })

  return () => {
    topic.unsubscribe()
  }
}

export function subscribeToSlamWorkflowJob(options: {
  onMessage: (job: SlamWorkflowJob) => void
  onWarning?: (warning: string) => void
}) {
  const ros = getRosConnectionManager().getRos()

  if (!ros) {
    throw new Error('rosbridge is not connected.')
  }

  const topic = new Topic<JsonRecord>({
    ros,
    name: SLAM_WORKFLOW_JOB_TOPIC_NAME,
    messageType: SLAM_WORKFLOW_JOB_TOPIC_TYPE,
    queue_length: 1,
    throttle_rate: 0,
    reconnect_on_close: true,
  })

  topic.on('warning', (warning) => {
    options.onWarning?.(warning)
  })

  topic.subscribe((message) => {
    const normalized = normalizeSlamWorkflowJob(message)

    if (normalized) {
      options.onMessage(normalized)
    }
  })

  return () => {
    topic.unsubscribe()
  }
}
