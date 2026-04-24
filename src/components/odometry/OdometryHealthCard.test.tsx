import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OdometryHealthCard } from './OdometryHealthCard'
import type { OdometryState, OdometryTopicSnapshot } from '../../types/odometry'

const mockState: OdometryState = {
  robotId: 'local_robot',
  odomSource: 'ekf',
  odomTopic: '/odom',
  rawOdomTopic: '/wheel_odom',
  imuTopic: '/imu/data',
  connected: true,
  wheelSpeedNodeReady: true,
  imuPreprocessNodeReady: true,
  ekfNodeReady: false,
  wheelSpeedFresh: true,
  imuFresh: false,
  odomFresh: false,
  odomValid: false,
  wheelSpeedAgeS: 0.1,
  imuAgeS: 2.4,
  odomAgeS: 3.1,
  errorCode: 'ODOM_TIMEOUT',
  message: 'odom topic stale',
  warnings: ['imu delayed'],
  stampMs: Date.now(),
  raw: {},
}

const mockTopicSnapshot: OdometryTopicSnapshot = {
  topicName: '/clean_robot_server/odometry_state',
  messageType: 'cleanrobot_app_msgs/OdometryState',
  publishers: ['node-a'],
  subscribers: [],
  metaError: null,
  subscribeError: null,
  health: 'stale',
  messageCount: 12,
  lastMessageAt: Date.now(),
  ageMs: 3100,
  state: mockState,
}

describe('OdometryHealthCard', () => {
  it('shows translated health information and opens the diagnostic drawer', async () => {
    render(
      <OdometryHealthCard
        state={mockState}
        topicSnapshot={mockTopicSnapshot}
        serviceError={null}
      />,
    )

    expect(screen.getByText('里程计健康')).toBeInTheDocument()
    expect(screen.getAllByText('ODOM_TIMEOUT').length).toBeGreaterThan(0)
    expect(screen.getByText('里程计 topic 已延迟')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看诊断' }))

    expect(await screen.findByText('里程计诊断详情')).toBeInTheDocument()
    expect(screen.getByText('节点与数据链路')).toBeInTheDocument()
    expect(screen.getByText('/wheel_odom')).toBeInTheDocument()
  })
})
