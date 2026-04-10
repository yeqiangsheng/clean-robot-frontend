import { describe, expect, it } from 'vitest'

import {
  AppConfigValidationError,
  getDefaultAppConfig,
  normalizeConfig,
  sanitizeAppConfig,
} from './appConfig'

describe('appConfig', () => {
  it('normalizes a valid trial deployment config', () => {
    const baseConfig = sanitizeAppConfig(getDefaultAppConfig())

    const result = normalizeConfig({
      ...baseConfig,
      siteName: 'Trial Site',
      robotId: 'robot-01',
      rosbridgeUrl: 'ws://127.0.0.1:9090',
      quickRosbridgeUrls: [
        'ws://127.0.0.1:9090',
        'wss://robot.example.com:9443',
      ],
      logRetentionDays: 7,
    })

    expect(result.siteName).toBe('Trial Site')
    expect(result.robotId).toBe('robot-01')
    expect(result.rosbridgeUrl).toBe(new URL('ws://127.0.0.1:9090').toString())
    expect(result.quickRosbridgeUrls).toEqual([
      new URL('ws://127.0.0.1:9090').toString(),
      new URL('wss://robot.example.com:9443').toString(),
    ])
    expect(result.engineerUnlockMode).toBe('direct')
    expect(result.logRetentionDays).toBe(7)
  })

  it('blocks invalid startup config values with actionable issues', () => {
    const baseConfig = sanitizeAppConfig(getDefaultAppConfig())

    expect(() =>
      normalizeConfig({
        ...baseConfig,
        rosbridgeUrl: 'http://127.0.0.1:9090',
        quickRosbridgeUrls: [],
        engineerUnlockMode: 'passcode',
      }),
    ).toThrow(AppConfigValidationError)

    try {
      normalizeConfig({
        ...baseConfig,
        rosbridgeUrl: 'http://127.0.0.1:9090',
        quickRosbridgeUrls: [],
        engineerUnlockMode: 'passcode',
      })
    } catch (error) {
      expect(error).toBeInstanceOf(AppConfigValidationError)

      if (error instanceof AppConfigValidationError) {
        expect(error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'rosbridgeUrl' }),
            expect.objectContaining({ field: 'quickRosbridgeUrls' }),
            expect.objectContaining({ field: 'engineerUnlockMode' }),
          ]),
        )
      }
    }
  })
})
