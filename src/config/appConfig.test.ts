import { describe, expect, it } from 'vitest'

import {
  AppConfigValidationError,
  getDefaultAppConfig,
  normalizeConfig,
  sanitizeAppConfig,
} from './appConfig'

describe('appConfig', () => {
  it('normalizes a valid site-gateway frontend config', () => {
    const baseConfig = sanitizeAppConfig(getDefaultAppConfig())

    const result = normalizeConfig({
      ...baseConfig,
      siteName: 'Trial Site',
      robotId: 'robot-01',
      apiBaseUrl: '/api',
      supportPhone: '400-000-0000',
    })

    expect(result.siteName).toBe('Trial Site')
    expect(result.robotId).toBe('robot-01')
    expect(result.apiBaseUrl).toBe('/api')
    expect(result.supportPhone).toBe('400-000-0000')
  })

  it('blocks invalid startup config values with actionable issues', () => {
    const baseConfig = sanitizeAppConfig(getDefaultAppConfig())

    expect(() =>
      normalizeConfig({
        ...baseConfig,
        apiBaseUrl: 'ws://127.0.0.1:9090',
        enabledModules: {},
      }),
    ).toThrow(AppConfigValidationError)

    try {
      normalizeConfig({
        ...baseConfig,
        apiBaseUrl: 'ws://127.0.0.1:9090',
        enabledModules: {},
      })
    } catch (error) {
      expect(error).toBeInstanceOf(AppConfigValidationError)

      if (error instanceof AppConfigValidationError) {
        expect(error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'apiBaseUrl' }),
            expect.objectContaining({ field: 'enabledModules.overview' }),
          ]),
        )
      }
    }
  })

  it('rejects gateway-only fields from the browser-visible config', () => {
    const baseConfig = sanitizeAppConfig(getDefaultAppConfig())

    expect(() =>
      normalizeConfig({
        ...baseConfig,
        rosbridgeUrl: 'ws://localhost:9090',
        quickRosbridgeUrls: ['ws://localhost:9090'],
        rolePolicy: { engineer: ['overview'] },
        engineerUnlockMode: 'direct',
      }),
    ).toThrow(AppConfigValidationError)

    try {
      normalizeConfig({
        ...baseConfig,
        rosbridgeUrl: 'ws://localhost:9090',
        quickRosbridgeUrls: ['ws://localhost:9090'],
        rolePolicy: { engineer: ['overview'] },
        engineerUnlockMode: 'direct',
      })
    } catch (error) {
      expect(error).toBeInstanceOf(AppConfigValidationError)

      if (error instanceof AppConfigValidationError) {
        expect(error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'rosbridgeUrl' }),
            expect.objectContaining({ field: 'quickRosbridgeUrls' }),
            expect.objectContaining({ field: 'rolePolicy' }),
            expect.objectContaining({ field: 'engineerUnlockMode' }),
          ]),
        )
      }
    }
  })
})
