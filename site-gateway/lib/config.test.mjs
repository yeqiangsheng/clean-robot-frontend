import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadSiteConfig, normalizeSiteConfig } from './config.mjs'

const originalSiteRosbridgeUrl = process.env.SITE_ROSBRIDGE_URL

afterEach(() => {
  if (originalSiteRosbridgeUrl === undefined) {
    delete process.env.SITE_ROSBRIDGE_URL
    return
  }

  process.env.SITE_ROSBRIDGE_URL = originalSiteRosbridgeUrl
})

describe('normalizeSiteConfig', () => {
  it('normalizes a valid site gateway config with defaults', () => {
    const config = normalizeSiteConfig({
      siteName: 'Clean Robot Site',
      robotId: 'robot-001',
      rosbridgeUrl: 'ws://127.0.0.1:9090',
      enabledModules: {
        overview: true,
        workbench: true,
        tasks: true,
        schedules: true,
        execution: true,
        'dock-calibration': true,
        slam: true,
        runtime: true,
        'actuator-control': false,
      },
      rolePolicy: {
        operator: ['overview', 'taskManagement'],
        service: ['overview', 'mapWorkbench', 'runtimeMonitoring'],
        engineer: ['overview', 'slamWorkbench', 'actuatorControl'],
        admin: ['overview', 'taskManagement', 'scheduleManagement', 'executionControl'],
      },
      bootstrapUsers: [
        {
          username: 'engineer',
          displayName: 'Field Engineer',
          role: 'engineer',
          password: 'site-deploy-test-passphrase',
        },
      ],
    })

    expect(config.rosbridgeUrl).toBe('ws://127.0.0.1:9090/')
    expect(config.sessionTtlHours).toBe(12)
    expect(config.clearSessionsOnStartup).toBe(true)
    expect(config.logRetentionDays).toBe(14)
    expect(config.mapImportPbstreamDir).toBe('/opt/carto/map')
    expect(config.enabledModules['actuator-control']).toBe(false)
    expect(config.bootstrapUsers[0]).toMatchObject({
      username: 'engineer',
      role: 'engineer',
    })
  })

  it('allows startup session clearing to be disabled explicitly', () => {
    const config = normalizeSiteConfig({
      siteName: 'Clean Robot Site',
      robotId: 'robot-001',
      rosbridgeUrl: 'ws://127.0.0.1:9090',
      enabledModules: {
        overview: true,
        workbench: true,
        tasks: true,
        schedules: true,
        execution: true,
        'dock-calibration': true,
        slam: true,
        runtime: true,
        'actuator-control': true,
      },
      rolePolicy: {
        operator: ['overview'],
        service: ['overview'],
        engineer: ['overview'],
        admin: ['overview'],
      },
      clearSessionsOnStartup: false,
    })

    expect(config.clearSessionsOnStartup).toBe(false)
  })

  it('rejects placeholder bootstrap passwords', () => {
    const buildConfig = (password) => ({
      siteName: 'Clean Robot Site',
      robotId: 'robot-001',
      rosbridgeUrl: 'ws://127.0.0.1:9090',
      enabledModules: {
        overview: true,
        workbench: true,
        tasks: true,
        schedules: true,
        execution: true,
        'dock-calibration': true,
        slam: true,
        runtime: true,
        'actuator-control': true,
      },
      rolePolicy: {
        operator: ['overview'],
        service: ['overview'],
        engineer: ['overview'],
        admin: ['overview'],
      },
      bootstrapUsers: [
        {
          username: 'engineer',
          displayName: 'Field Engineer',
          role: 'engineer',
          password,
        },
      ],
    })

    expect(() => normalizeSiteConfig(buildConfig('change-me-engineer'))).toThrow(
      'bootstrapUsers[0].password must be replaced with a site-specific secret.',
    )

    expect(() =>
      normalizeSiteConfig({
        ...buildConfig('REPLACE_WITH_SITE_SPECIFIC_ENGINEER_SECRET'),
      }),
    ).toThrow('bootstrapUsers[0].password must be replaced with a site-specific secret.')
  })

  it('rejects non-websocket rosbridge urls', () => {
    expect(() =>
      normalizeSiteConfig({
        siteName: 'Clean Robot Site',
        robotId: 'robot-001',
        rosbridgeUrl: 'http://127.0.0.1:9090',
        enabledModules: {
          overview: true,
          workbench: true,
          tasks: true,
          schedules: true,
          execution: true,
          'dock-calibration': true,
          slam: true,
          runtime: true,
          'actuator-control': true,
        },
        rolePolicy: {
          operator: ['overview'],
          service: ['overview'],
          engineer: ['overview'],
          admin: ['overview'],
        },
      }),
    ).toThrow('rosbridgeUrl must use ws:// or wss://.')
  })

  it('allows deployment environment to override the packaged rosbridge url', () => {
    const tempDir = mkdirSync(join(tmpdir(), `clean-robot-config-${Date.now()}-`), {
      recursive: true,
    })
    const configPath = join(tempDir, 'site-config.json')

    writeFileSync(
      configPath,
      JSON.stringify({
        siteName: 'Clean Robot Site',
        robotId: 'robot-001',
        rosbridgeUrl: 'ws://127.0.0.1:9090',
        enabledModules: {
          overview: true,
          workbench: true,
          tasks: true,
          schedules: true,
          execution: true,
          'dock-calibration': true,
          slam: true,
          runtime: true,
          'actuator-control': true,
        },
        rolePolicy: {
          operator: ['overview'],
          service: ['overview'],
          engineer: ['overview'],
          admin: ['overview'],
        },
      }),
    )

    process.env.SITE_ROSBRIDGE_URL = 'ws://192.0.2.10:9090'

    try {
      expect(loadSiteConfig(configPath).rosbridgeUrl).toBe('ws://192.0.2.10:9090/')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
