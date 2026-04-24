import { expect, type Page } from '@playwright/test'

export interface LiveTestEnv {
  username: string
  password: string
  taskName: string | null
  expectedMapName: string | null
  requireReady: boolean
  enableSlamWrite: boolean
  enableTaskWrite: boolean
  enableScheduleWrite: boolean
  enableMapWrite: boolean
  slamMapPrefix: string
}

function readBooleanEnv(name: string, defaultValue = false) {
  const raw = process.env[name]?.trim().toLowerCase()

  if (!raw) {
    return defaultValue
  }

  return ['1', 'true', 'yes', 'on'].includes(raw)
}

export function getLiveTestEnv(): LiveTestEnv {
  return {
    username: process.env.PLAYWRIGHT_LIVE_USERNAME?.trim() ?? '',
    password: process.env.PLAYWRIGHT_LIVE_PASSWORD ?? '',
    taskName: process.env.PLAYWRIGHT_LIVE_TASK_NAME?.trim() || null,
    expectedMapName: process.env.PLAYWRIGHT_LIVE_EXPECT_MAP_NAME?.trim() || null,
    requireReady: readBooleanEnv('PLAYWRIGHT_LIVE_REQUIRE_READY', false),
    enableSlamWrite: readBooleanEnv('PLAYWRIGHT_LIVE_ENABLE_SLAM_WRITE', false),
    enableTaskWrite: readBooleanEnv('PLAYWRIGHT_LIVE_ENABLE_TASK_WRITE', false),
    enableScheduleWrite: readBooleanEnv('PLAYWRIGHT_LIVE_ENABLE_SCHEDULE_WRITE', false),
    enableMapWrite: readBooleanEnv('PLAYWRIGHT_LIVE_ENABLE_MAP_WRITE', false),
    slamMapPrefix: process.env.PLAYWRIGHT_LIVE_SLAM_MAP_PREFIX?.trim() || 'live_regression',
  }
}

export function hasLiveCredentials(env: LiveTestEnv) {
  return env.username.length > 0 && env.password.length > 0
}

export async function loginToLiveSite(page: Page, env: LiveTestEnv) {
  await page.goto('/')

  if (await page.getByTestId('app-shell').count()) {
    await expect(page.getByTestId('app-shell')).toBeVisible()
    return
  }

  await page.locator('input[autocomplete="username"]').fill(env.username)
  await page.locator('input[autocomplete="current-password"]').fill(env.password)
  await page.locator('button[type="submit"]').click()
  await expect(page.getByTestId('app-shell')).toBeVisible()
}

export async function fetchGatewayJson<T>(page: Page, pathname: string) {
  return requestGatewayJson<T>(page, pathname, { method: 'GET' })
}

export async function requestGatewayJson<T>(
  page: Page,
  pathname: string,
  options: {
    method: string
    body?: unknown
  },
) {
  const result = await page.evaluate(async (nextPathname) => {
    const { pathname: requestPathname, method, body } = nextPathname
    const response = await fetch(requestPathname, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const responseBody = await response.json()

    return {
      status: response.status,
      ok: response.ok,
      body: responseBody,
    }
  }, { pathname, method: options.method, body: options.body })

  return result as {
    status: number
    ok: boolean
    body: T
  }
}

export async function openTabAndAssertHeading(
  page: Page,
  tabLabel: string,
  headingName: string | RegExp,
) {
  await page.getByRole('tab', { name: tabLabel }).click()
  await expect(page.getByRole('heading', { name: headingName }).first()).toBeVisible()
}

export async function selectExecutionTask(page: Page, taskName: string) {
  const taskSelector = page.getByRole('combobox').first()
  await taskSelector.click()
  await page.getByText(new RegExp(taskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).first().click()
  await expect(page.getByText(taskName).first()).toBeVisible()
}

export function buildLiveMapName(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `${prefix}_${stamp}`
}
