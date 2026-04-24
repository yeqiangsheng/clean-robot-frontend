import { expect, test } from '@playwright/test'

import {
  buildLiveMapName,
  fetchGatewayJson,
  getLiveTestEnv,
  hasLiveCredentials,
  loginToLiveSite,
  openTabAndAssertHeading,
  requestGatewayJson,
  selectExecutionTask,
} from './live-helpers'

type GatewayHealthResponse = {
  status: string
  ros: {
    status: string
    isConnected: boolean
    url: string
  }
}

type SystemReadinessResponse = {
  success: boolean
  message: string
  readiness: {
    canStartTask: boolean
    taskId: number
    taskName: string
    activeMapName: string
    runtimeMapName: string
    localizationState?: string
    executorState: string
    missionState: string
    phase: string
    blockingReasons: string[]
  } | null
}

type OdometryResponse = {
  success: boolean
  message: string
  state: {
    odomSource: string
    odomValid: boolean | null
    message: string
  } | null
}

type SlamStateResponse = {
  activeMapName: string
  runtimeMapName: string
  localizationState: string
  localizationValid: boolean | null
  canRestartLocalization: boolean
  canStartMapping: boolean
  canSaveMapping: boolean
  canStopMapping: boolean
} | null

type TaskEntity = {
  id: number
  name: string
  mapName: string
  enabled: boolean
  [key: string]: unknown
}

type ScheduleEntity = {
  id: string
  taskId: number
  taskName: string
  enabled: boolean
  [key: string]: unknown
}

type MapCatalogEntity = {
  mapName: string
  displayName: string
  isActive: boolean
  [key: string]: unknown
}

type CurrentMapResponse = {
  map_name: string
  map_revision_id: string
  map_data: {
    info: {
      width: number
      height: number
      resolution: number
    }
  }
}

type WorkbenchZoneRecord = {
  id?: string
  zone_id?: string
  display_name?: string
  zone_version?: number
  alignment_version?: string
  plan_profile_name?: string
  display_region?: unknown
  map_region?: unknown
  active_plan_id?: string
  [key: string]: unknown
}

type ZonePlanPathResponse = {
  success: boolean
  message: string
  zone_id: string
  active_plan_id?: string
  display_path?: unknown
  map_path?: unknown
}

type CoveragePreviewResponse = {
  success?: boolean
  valid?: boolean
  message?: string
  estimated_length_m?: number
  estimated_duration_s?: number
  display_preview_path?: unknown
  warnings?: string[]
}

type CoverageCommitResponse = {
  success?: boolean
  message?: string
  zone_id?: string
  zone_version?: number
  plan_id?: string
  warnings?: string[]
}

type DeleteWorkbenchZoneResponse = {
  message: string
  raw: Record<string, unknown>
}

type ScheduleDraftInput = {
  scheduleId: string
  taskId: number
  enabled: boolean
  type: string
  dow: number[]
  time: string
  at: string
  timezone: string
  startDate: string
  endDate: string
}

type ScheduleCreateResponse = {
  schedule: ScheduleEntity
  raw: Record<string, unknown>
}

type ScheduleDeleteResponse = {
  message: string
  raw: {
    message?: string
    [key: string]: unknown
  }
}

type GatewayErrorResponse = {
  code: string
  message: string
}

type SlamActionResponse = {
  accepted: boolean
  jobId: string
  message: string
}

type ExecutionCommandResponse = {
  success: boolean
  message: string
  command: string
  taskId: number
}

const liveEnv = getLiveTestEnv()

test.describe('@live-readonly 真机只读回归', () => {
  test.skip(!hasLiveCredentials(liveEnv), '需要先设置 PLAYWRIGHT_LIVE_USERNAME / PLAYWRIGHT_LIVE_PASSWORD。')

  test.beforeEach(async ({ page }) => {
    await loginToLiveSite(page, liveEnv)
  })

  test('@live-readonly health 与核心快照接口返回可用真值', async ({ page }) => {
    const health = await fetchGatewayJson<GatewayHealthResponse>(page, '/api/health')
    expect(health.status).toBe(200)
    expect(health.body.status).toBe('ok')
    expect(health.body.ros.status).toBe('connected')
    expect(health.body.ros.isConnected).toBe(true)
    expect(health.body.ros.url.trim().length).toBeGreaterThan(0)

    const readiness = await fetchGatewayJson<SystemReadinessResponse>(
      page,
      '/api/system/readiness?taskId=0',
    )
    expect(readiness.status).toBe(200)
    expect(readiness.body.success).toBe(true)
    expect(readiness.body.readiness).not.toBeNull()
    expect(readiness.body.readiness?.activeMapName.trim().length).toBeGreaterThan(0)
    expect(readiness.body.readiness?.runtimeMapName.trim().length).toBeGreaterThan(0)

    const odometry = await fetchGatewayJson<OdometryResponse>(page, '/api/odometry/state')
    expect(odometry.status).toBe(200)
    expect(odometry.body.success).toBe(true)
    expect(odometry.body.state).not.toBeNull()
    expect(odometry.body.state?.odomSource.trim().length).toBeGreaterThan(0)
    expect(odometry.body.state?.odomValid).not.toBeNull()

    const slamState = await fetchGatewayJson<SlamStateResponse>(page, '/api/slam/state')
    expect(slamState.status).toBe(200)
    expect(slamState.body).not.toBeNull()
    expect(slamState.body?.activeMapName.trim().length).toBeGreaterThan(0)
    expect(slamState.body?.runtimeMapName.trim().length).toBeGreaterThan(0)
    expect(slamState.body?.localizationState.trim().length).toBeGreaterThan(0)

    const taskList = await fetchGatewayJson<TaskEntity[]>(page, '/api/tasks')
    expect(taskList.status).toBe(200)
    expect(Array.isArray(taskList.body)).toBe(true)
    expect(taskList.body.length).toBeGreaterThan(0)

    if (liveEnv.taskName) {
      expect(taskList.body.some((task) => task.name === liveEnv.taskName)).toBe(true)
    }

    if (liveEnv.expectedMapName) {
      expect(readiness.body.readiness?.activeMapName).toBe(liveEnv.expectedMapName)
      expect(readiness.body.readiness?.runtimeMapName).toBe(liveEnv.expectedMapName)
      expect(slamState.body?.activeMapName).toBe(liveEnv.expectedMapName)
      expect(slamState.body?.runtimeMapName).toBe(liveEnv.expectedMapName)
    }

    if (liveEnv.requireReady) {
      expect(readiness.body.readiness?.canStartTask).toBe(true)
      expect(readiness.body.readiness?.missionState).toBe('IDLE')
      expect(readiness.body.readiness?.phase).toBe('IDLE')
      expect(readiness.body.readiness?.executorState).toBe('IDLE')
      expect(readiness.body.readiness?.blockingReasons ?? []).toEqual([])
    }
  })

  test('@live-readonly 执行控制页展示任务与 readiness 真值', async ({ page }) => {
    const readiness = await fetchGatewayJson<SystemReadinessResponse>(
      page,
      '/api/system/readiness?taskId=0',
    )
    expect(readiness.body.readiness).not.toBeNull()

    await openTabAndAssertHeading(page, '执行控制', '任务执行控制')

    if (liveEnv.taskName) {
      await selectExecutionTask(page, liveEnv.taskName)
      await expect(page.getByText(liveEnv.taskName).first()).toBeVisible()
    }

    await expect(page.getByText('任务启动前 readiness')).toBeVisible()
    await expect(page.getByRole('button', { name: 'START' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'PAUSE' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CONTINUE' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'STOP' })).toBeVisible()
    await expect(page.getByText(readiness.body.readiness?.activeMapName ?? '--').first()).toBeVisible()
    await expect(page.getByText(readiness.body.readiness?.runtimeMapName ?? '--').first()).toBeVisible()
    await expect(page.getByTestId('app-shell')).toContainText(
      readiness.body.readiness?.executorState ?? '--',
    )
  })

  test('@live-readonly SLAM 与运行监控页展示站点网关快照', async ({ page }) => {
    const slamState = await fetchGatewayJson<SlamStateResponse>(page, '/api/slam/state')
    expect(slamState.body).not.toBeNull()

    await openTabAndAssertHeading(page, 'SLAM', 'SLAM 工作台')
    await expect(page.getByText('里程计健康').first()).toBeVisible()
    await expect(page.getByText('系统 readiness 摘要').first()).toBeVisible()
    await expect(page.getByText(slamState.body?.runtimeMapName ?? '--').first()).toBeVisible()
    await expect(page.getByText(slamState.body?.localizationState ?? '--').first()).toBeVisible()

    await openTabAndAssertHeading(page, '运行监控', '运行监控')
    await expect(page.getByText('Task State').first()).toBeVisible()
    await expect(page.getByText('Executor State').first()).toBeVisible()
    await expect(page.getByText('Topic Health').first()).toBeVisible()
  })

  test('@live-readonly MapWorkbench 业务只读 IO 接通 canonical gateway', async ({
    page,
  }) => {
    const maps = await fetchGatewayJson<MapCatalogEntity[]>(page, '/api/maps')
    expect(maps.status).toBe(200)
    expect(Array.isArray(maps.body)).toBe(true)
    expect(maps.body.length).toBeGreaterThan(0)
    expect(maps.body.some((map) => map.isActive)).toBe(true)

    const currentMap = await fetchGatewayJson<CurrentMapResponse>(page, '/api/maps/current')
    expect(currentMap.status).toBe(200)
    expect(currentMap.body.map_name.trim().length).toBeGreaterThan(0)
    expect(currentMap.body.map_data.info.width).toBeGreaterThan(0)
    expect(currentMap.body.map_data.info.height).toBeGreaterThan(0)

    const mapName = currentMap.body.map_name
    const encodedMapName = encodeURIComponent(mapName)

    const alignment = await fetchGatewayJson<Record<string, unknown> | null>(
      page,
      `/api/workbench/alignment?mapName=${encodedMapName}`,
    )
    expect(alignment.status).toBe(200)

    const zones = await fetchGatewayJson<WorkbenchZoneRecord[]>(
      page,
      `/api/workbench/zones?mapName=${encodedMapName}`,
    )
    expect(zones.status).toBe(200)
    expect(Array.isArray(zones.body)).toBe(true)

    const noGoAreas = await fetchGatewayJson<Record<string, unknown>[]>(
      page,
      `/api/workbench/no-go-areas?mapName=${encodedMapName}`,
    )
    expect(noGoAreas.status).toBe(200)
    expect(Array.isArray(noGoAreas.body)).toBe(true)

    const virtualWalls = await fetchGatewayJson<Record<string, unknown>[]>(
      page,
      `/api/workbench/virtual-walls?mapName=${encodedMapName}`,
    )
    expect(virtualWalls.status).toBe(200)
    expect(Array.isArray(virtualWalls.body)).toBe(true)

    const firstZone = zones.body[0] ?? null
    const zoneId = firstZone?.zone_id ?? firstZone?.id ?? ''
    if (zoneId) {
      const encodedZoneId = encodeURIComponent(zoneId)
      const zoneDetail = await fetchGatewayJson<WorkbenchZoneRecord>(
        page,
        `/api/workbench/zones/${encodedZoneId}?mapName=${encodedMapName}`,
      )
      expect(zoneDetail.status).toBe(200)
      expect(zoneDetail.body.zone_id ?? zoneDetail.body.id).toBe(zoneId)

      const zonePlanPath = await fetchGatewayJson<ZonePlanPathResponse>(
        page,
        `/api/workbench/zones/${encodedZoneId}/plan-path?mapName=${encodedMapName}`,
      )
      expect(zonePlanPath.status).toBe(200)
      expect(zonePlanPath.body.success).toBe(true)
      expect(zonePlanPath.body.zone_id).toBe(zoneId)
      expect(zonePlanPath.body.display_path ?? zonePlanPath.body.map_path).toBeTruthy()
    }

    await openTabAndAssertHeading(page, '地图工作台', '地图工作台')
    await expect(page.getByTestId('app-shell')).toContainText(mapName)
  })
})

test.describe.serial('@live-write-slam 受控 SLAM 写动作', () => {
  test.skip(!hasLiveCredentials(liveEnv), '需要先设置 PLAYWRIGHT_LIVE_USERNAME / PLAYWRIGHT_LIVE_PASSWORD。')
  test.skip(!liveEnv.enableSlamWrite, '需要显式设置 PLAYWRIGHT_LIVE_ENABLE_SLAM_WRITE=true。')

  test.beforeEach(async ({ page }) => {
    await loginToLiveSite(page, liveEnv)
    await openTabAndAssertHeading(page, 'SLAM', 'SLAM 工作台')
  })

  test('@live-write relocalize -> start_mapping -> save_mapping -> stop_mapping', async ({
    page,
  }) => {
    const relocalizeButton = page.getByRole('button', { name: '提交重定位' })
    await expect(relocalizeButton).toBeEnabled()

    const restartResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/slam/actions') &&
        response.request().method() === 'POST',
    )
    await relocalizeButton.click()
    const restartResponse = (await (await restartResponsePromise).json()) as SlamActionResponse
    expect(restartResponse.accepted).toBe(true)
    expect(restartResponse.jobId.trim().length).toBeGreaterThan(0)
    await expect(page.getByText('重定位请求已提交')).toBeVisible()

    const startMapName = buildLiveMapName(`${liveEnv.slamMapPrefix}_mapping`)
    const startCard = page.locator('.slam-card').filter({ has: page.getByText('开始建图') }).first()
    await startCard.getByRole('textbox').first().fill(startMapName)
    await expect(startCard.getByRole('button', { name: '开始建图' })).toBeEnabled()
    const startResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/slam/actions') &&
        response.request().method() === 'POST',
    )
    await startCard.getByRole('button', { name: '开始建图' }).click()
    const startResponse = (await (await startResponsePromise).json()) as SlamActionResponse
    expect(startResponse.accepted).toBe(true)
    expect(startResponse.jobId.trim().length).toBeGreaterThan(0)
    await expect(page.getByText('开始建图请求已提交')).toBeVisible()

    const saveCard = page.locator('.slam-card').filter({ has: page.getByText('保存建图结果') }).first()
    const saveButton = saveCard.getByRole('button', { name: '保存地图' })
    await expect(saveButton).toBeEnabled({ timeout: 60_000 })
    await saveCard.getByRole('textbox').first().fill(buildLiveMapName(`${liveEnv.slamMapPrefix}_save`))
    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/slam/actions') &&
        response.request().method() === 'POST',
    )
    await saveButton.click()
    const saveResponse = (await (await saveResponsePromise).json()) as SlamActionResponse
    expect(saveResponse.accepted).toBe(true)
    expect(saveResponse.jobId.trim().length).toBeGreaterThan(0)
    await expect(page.getByText('保存地图请求已提交')).toBeVisible()

    const stopButton = page.getByRole('button', { name: '结束建图' }).last()
    await expect(stopButton).toBeEnabled({ timeout: 60_000 })
    const stopResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/slam/actions') &&
        response.request().method() === 'POST',
    )
    await stopButton.click()
    await page.getByRole('button', { name: '结束建图' }).last().click()
    const stopResponse = (await (await stopResponsePromise).json()) as SlamActionResponse
    expect(stopResponse.accepted).toBe(true)
    expect(stopResponse.jobId.trim().length).toBeGreaterThan(0)
    await expect(page.getByText('结束建图请求已提交')).toBeVisible()
  })
})

test.describe.serial('@live-write-task 受控执行写动作', () => {
  test.skip(!hasLiveCredentials(liveEnv), '需要先设置 PLAYWRIGHT_LIVE_USERNAME / PLAYWRIGHT_LIVE_PASSWORD。')
  test.skip(!liveEnv.enableTaskWrite, '需要显式设置 PLAYWRIGHT_LIVE_ENABLE_TASK_WRITE=true。')
  test.skip(!liveEnv.taskName, '需要显式设置 PLAYWRIGHT_LIVE_TASK_NAME。')

  test.beforeEach(async ({ page }) => {
    await loginToLiveSite(page, liveEnv)
    await openTabAndAssertHeading(page, '执行控制', '任务执行控制')
    await selectExecutionTask(page, liveEnv.taskName as string)
  })

  test('@live-write START -> PAUSE -> CONTINUE -> STOP', async ({ page }) => {
    const startButton = page.getByRole('button', { name: 'START' })
    await expect(startButton).toBeEnabled({ timeout: 30_000 })

    const startResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/execution/commands') &&
        response.request().method() === 'POST',
    )
    await startButton.click()
    const startResponse = (await (await startResponsePromise).json()) as ExecutionCommandResponse
    expect(startResponse.command).toBe('START')
    expect(startResponse.success).toBe(true)
    await expect(page.getByText('START 返回')).toBeVisible()

    const pauseButton = page.getByRole('button', { name: 'PAUSE' })
    await expect(pauseButton).toBeEnabled({ timeout: 60_000 })
    const pauseResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/execution/commands') &&
        response.request().method() === 'POST',
    )
    await pauseButton.click()
    const pauseResponse = (await (await pauseResponsePromise).json()) as ExecutionCommandResponse
    expect(pauseResponse.command).toBe('PAUSE')
    expect(pauseResponse.success).toBe(true)
    await expect(page.getByText('PAUSE 返回')).toBeVisible()

    const continueButton = page.getByRole('button', { name: 'CONTINUE' })
    await expect(continueButton).toBeEnabled({ timeout: 60_000 })
    const continueResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/execution/commands') &&
        response.request().method() === 'POST',
    )
    await continueButton.click()
    const continueResponse = (await (await continueResponsePromise).json()) as ExecutionCommandResponse
    expect(continueResponse.command).toBe('CONTINUE')
    expect(continueResponse.success).toBe(true)
    await expect(page.getByText('CONTINUE 返回')).toBeVisible()

    const stopButton = page.getByRole('button', { name: 'STOP' })
    await expect(stopButton).toBeEnabled({ timeout: 60_000 })
    const stopResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/execution/commands') &&
        response.request().method() === 'POST',
    )
    await stopButton.click()
    const stopResponse = (await (await stopResponsePromise).json()) as ExecutionCommandResponse
    expect(stopResponse.command).toBe('STOP')
    expect(stopResponse.success).toBe(true)
    await expect(page.getByText('STOP 返回')).toBeVisible()
  })
})

test.describe.serial('@live-write-map 受控地图工作台写动作', () => {
  test.skip(!hasLiveCredentials(liveEnv), '需要先设置 PLAYWRIGHT_LIVE_USERNAME / PLAYWRIGHT_LIVE_PASSWORD。')
  test.skip(!liveEnv.enableMapWrite, '需要显式设置 PLAYWRIGHT_LIVE_ENABLE_MAP_WRITE=true。')

  test.beforeEach(async ({ page }) => {
    await loginToLiveSite(page, liveEnv)
  })

  test('@live-write-map coverage preview -> temp zone commit -> cleanup delete', async ({
    page,
  }) => {
    const currentMap = await fetchGatewayJson<CurrentMapResponse>(page, '/api/maps/current')
    expect(currentMap.status).toBe(200)
    expect(currentMap.body.map_name.trim().length).toBeGreaterThan(0)
    expect(currentMap.body.map_revision_id.trim().length).toBeGreaterThan(0)

    const mapName = currentMap.body.map_name
    const encodedMapName = encodeURIComponent(mapName)
    const zones = await fetchGatewayJson<WorkbenchZoneRecord[]>(
      page,
      `/api/workbench/zones?mapName=${encodedMapName}`,
    )
    expect(zones.status).toBe(200)
    expect(zones.body.length).toBeGreaterThan(0)

    const templateZone = zones.body.find((zone) => zone.display_region || zone.map_region)
    expect(templateZone).toBeTruthy()

    const region = templateZone?.display_region ?? templateZone?.map_region
    const profileName = templateZone?.plan_profile_name || 'cover_standard'
    const alignmentVersion = templateZone?.alignment_version ?? ''
    const previewPayload = {
      map_name: mapName,
      map_revision_id: currentMap.body.map_revision_id,
      alignment_version: alignmentVersion,
      region,
      profile_name: profileName,
      debug_publish_markers: false,
    }

    const preview = await requestGatewayJson<CoveragePreviewResponse>(
      page,
      '/api/workbench/zones/coverage-preview',
      {
        method: 'POST',
        body: previewPayload,
      },
    )
    expect(preview.status).toBe(200)
    expect(preview.body.success ?? true).toBe(true)
    expect(preview.body.estimated_length_m ?? 0).toBeGreaterThan(0)

    const now = new Date()
    const stamp = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14)
    const zoneId = `live_zone_probe_${stamp}`
    let committed = false

    try {
      const commit = await requestGatewayJson<CoverageCommitResponse>(
        page,
        '/api/workbench/zones',
        {
          method: 'POST',
          body: {
            ...previewPayload,
            zone_id: zoneId,
            base_zone_version: 0,
            display_name: zoneId,
            set_active_plan: true,
          },
        },
      )
      expect(commit.status).toBe(200)
      expect(commit.body.success ?? true).toBe(true)
      expect(commit.body.zone_id).toBe(zoneId)
      committed = true

      const detail = await fetchGatewayJson<WorkbenchZoneRecord>(
        page,
        `/api/workbench/zones/${encodeURIComponent(zoneId)}?mapName=${encodedMapName}`,
      )
      expect(detail.status).toBe(200)
      expect(detail.body.zone_id ?? detail.body.id).toBe(zoneId)
    } finally {
      if (committed) {
        const deleted = await requestGatewayJson<DeleteWorkbenchZoneResponse>(
          page,
          `/api/workbench/zones/${encodeURIComponent(zoneId)}?mapName=${encodedMapName}`,
          { method: 'DELETE' },
        )
        expect(deleted.status).toBe(200)

        const listAfterDelete = await fetchGatewayJson<WorkbenchZoneRecord[]>(
          page,
          `/api/workbench/zones?mapName=${encodedMapName}`,
        )
        expect(listAfterDelete.status).toBe(200)
        expect(
          listAfterDelete.body.some((zone) => (zone.zone_id ?? zone.id) === zoneId),
        ).toBe(false)
      }
    }
  })
})

test.describe.serial('@live-write-schedule 受控调度写动作', () => {
  test.skip(!hasLiveCredentials(liveEnv), '需要先设置 PLAYWRIGHT_LIVE_USERNAME / PLAYWRIGHT_LIVE_PASSWORD。')
  test.skip(!liveEnv.enableScheduleWrite, '需要显式设置 PLAYWRIGHT_LIVE_ENABLE_SCHEDULE_WRITE=true。')

  test.beforeEach(async ({ page }) => {
    await loginToLiveSite(page, liveEnv)
  })

  test('@live-write-schedule create temp schedule -> delete -> list/detail absent', async ({
    page,
  }) => {
    const taskList = await fetchGatewayJson<TaskEntity[]>(page, '/api/tasks')
    expect(taskList.status).toBe(200)
    expect(taskList.body.length).toBeGreaterThan(0)

    const task = taskList.body[0]
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    const scheduleId = [
      'live_delete_probe',
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('_')
    const startDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    const input: ScheduleDraftInput = {
      scheduleId,
      taskId: task.id,
      enabled: false,
      type: 'once',
      dow: [0],
      time,
      at: `${startDate} ${time}`,
      timezone: 'Asia/Shanghai',
      startDate,
      endDate: '',
    }

    const created = await requestGatewayJson<ScheduleCreateResponse>(page, '/api/schedules', {
      method: 'POST',
      body: { input, task },
    })
    expect(created.status).toBe(200)
    expect(created.body.schedule.id).toBe(scheduleId)

    const deleted = await requestGatewayJson<ScheduleDeleteResponse>(
      page,
      `/api/schedules/${encodeURIComponent(scheduleId)}?taskId=${task.id}`,
      { method: 'DELETE' },
    )
    expect(deleted.status).toBe(200)
    expect(deleted.body.message).toBe('deleted')
    expect(deleted.body.raw.message).toBe('deleted')

    const listAfterDelete = await fetchGatewayJson<ScheduleEntity[]>(page, '/api/schedules')
    expect(listAfterDelete.status).toBe(200)
    expect(listAfterDelete.body.some((schedule) => schedule.id === scheduleId)).toBe(false)

    const detailAfterDelete = await fetchGatewayJson<ScheduleEntity | GatewayErrorResponse>(
      page,
      `/api/schedules/${encodeURIComponent(scheduleId)}?taskId=${task.id}`,
    )
    expect(detailAfterDelete.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(detailAfterDelete.body).toLowerCase()).toContain('schedule not found')
  })
})
