import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { fetchGatewayOdometryTopicSnapshot } from '../api/gateway/siteGatewayClient'
import { getOdometryState } from '../api/gateway/robotGateway'
import {
  ODOMETRY_STATE_TOPIC_NAME,
  ODOMETRY_STATE_TOPIC_TYPE,
} from '../api/ros/queryContracts'
import type { OdometryTopicSnapshot } from '../types/odometry'
import type { RosConnectionSnapshot } from '../types/ros'
import { ODOMETRY_STATE_STALE_AFTER_MS } from '../utils/topicFreshness'

const ODOMETRY_TOPIC_POLL_INTERVAL_MS = 1000

function getTopicHealth(
  isConnected: boolean,
  _messageType: string,
  publishers: string[],
  lastMessageAt: number | null,
  now: number,
) {
  if (!isConnected) {
    return 'disconnected' as const
  }

  if (lastMessageAt === null) {
    return publishers.length > 0 ? ('waiting' as const) : ('unavailable' as const)
  }

  return now - lastMessageAt > ODOMETRY_STATE_STALE_AFTER_MS
    ? ('stale' as const)
    : ('live' as const)
}

export function useOdometryStatus(snapshot: RosConnectionSnapshot, robotId = 'local_robot') {
  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'
  const [clock, setClock] = useState(() => Date.now())

  const serviceQuery = useQuery({
    queryKey: ['odometry-status', robotId, snapshot.url, snapshot.sessionId],
    queryFn: () => getOdometryState(),
    enabled: servicesReady && snapshot.status !== 'mock',
    retry: false,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  })

  const topicQuery = useQuery({
    queryKey: ['odometry-topic', robotId, snapshot.sessionId],
    queryFn: () => fetchGatewayOdometryTopicSnapshot(),
    enabled: servicesReady && snapshot.status !== 'mock',
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval:
      servicesReady && snapshot.status !== 'mock' ? ODOMETRY_TOPIC_POLL_INTERVAL_MS : false,
  })

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setClock(Date.now())
    }, 1000)

    return () => {
      globalThis.clearInterval(timer)
    }
  }, [])

  const topicSnapshot = useMemo(() => {
    if (snapshot.status === 'mock') {
      return {
        topicName: ODOMETRY_STATE_TOPIC_NAME,
        messageType: ODOMETRY_STATE_TOPIC_TYPE,
        publishers: ['mock://clean_robot_server/odometry_state'],
        subscribers: ['site-gateway'],
        metaError: null,
        subscribeError: null,
        health: 'live',
        messageCount: 1,
        lastMessageAt: clock,
        ageMs: 0,
        state: {
          robotId,
          odomSource: 'mock_ekf',
          odomTopic: '/odom',
          rawOdomTopic: '/raw_odom',
          imuTopic: '/imu/data',
          connected: true,
          wheelSpeedNodeReady: true,
          imuPreprocessNodeReady: true,
          ekfNodeReady: true,
          wheelSpeedFresh: true,
          imuFresh: true,
          odomFresh: true,
          odomValid: true,
          wheelSpeedAgeS: 0,
          imuAgeS: 0,
          odomAgeS: 0,
          errorCode: '',
          message: 'mock odometry ready',
          warnings: ['mock data'],
          stampMs: clock,
          raw: {},
        },
      } satisfies OdometryTopicSnapshot
    }

    const topicData = topicQuery.data
    const lastMessageAt = topicData?.lastMessageAt ?? null
    const ageMs = lastMessageAt === null ? null : Math.max(0, clock - lastMessageAt)
    const publishers = topicData?.publishers ?? []

    return {
      topicName: topicData?.topicName || ODOMETRY_STATE_TOPIC_NAME,
      messageType: topicData?.messageType || ODOMETRY_STATE_TOPIC_TYPE,
      publishers,
      subscribers: topicData?.subscribers ?? [],
      metaError: topicData?.metaError ?? null,
      subscribeError: topicData?.subscribeError ?? null,
      health: getTopicHealth(servicesReady, '', publishers, lastMessageAt, clock),
      messageCount: topicData?.messageCount ?? 0,
      lastMessageAt,
      ageMs,
      state: topicData?.payload ?? null,
    } satisfies OdometryTopicSnapshot
  }, [clock, robotId, servicesReady, snapshot.status, topicQuery.data])

  return {
    serviceQuery,
    topicSnapshot,
    effectiveState: topicSnapshot.state ?? serviceQuery.data?.state ?? null,
  }
}
