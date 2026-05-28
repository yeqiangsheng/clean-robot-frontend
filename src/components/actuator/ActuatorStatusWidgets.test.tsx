import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ActuatorStatus } from '../../types/actuator'
import { CommandStateLine } from './ActuatorStatusWidgets'

function createStatus(lastCommand: ActuatorStatus['lastCommand']): ActuatorStatus {
  return {
    success: true,
    available: true,
    disabledReasons: [],
    mcoreConnected: true,
    stationConnected: true,
    cleanLevel: 80,
    sewageLevel: 20,
    batteryPercentage: 90,
    batteryVoltage: 24000,
    brush: { position: 0, label: '原位' },
    scraper: { position: 1, label: '到位' },
    lastCommand,
    topics: {
      combinedStatus: {
        topicName: '/combined_status',
        messageType: 'robot_platform_msgs/CombinedStatus',
        fresh: true,
        ageMs: 100,
      },
      mcoreConnected: {
        topicName: '/mcore_tcp_bridge/connected',
        messageType: 'std_msgs/Bool',
        fresh: true,
        ageMs: 100,
      },
    },
  }
}

describe('CommandStateLine', () => {
  afterEach(() => {
    cleanup()
  })

  it('hides the internal noop command from the field UI', () => {
    render(
      <CommandStateLine
        status={createStatus({
          kind: '__noop',
          state: 'failed',
          startedAtMs: 0,
          sentAtMs: 0,
          failedAtMs: 1,
          message: 'Unsupported actuator command: __noop',
        })}
      />,
    )

    expect(screen.getByText('暂无命令')).toBeInTheDocument()
    expect(screen.queryByText('__noop')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsupported actuator command: __noop')).not.toBeInTheDocument()
  })

  it('keeps real failed command details visible', () => {
    render(
      <CommandStateLine
        status={createStatus({
          kind: 'waterSequence',
          state: 'failed',
          startedAtMs: 0,
          sentAtMs: 0,
          failedAtMs: 1,
          message: 'M-core bridge 未连接。',
        })}
      />,
    )

    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('waterSequence')).toBeInTheDocument()
    expect(screen.getByText('M-core bridge 未连接。')).toBeInTheDocument()
  })
})
