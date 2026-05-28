import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { get } from 'node:http'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import net from 'node:net'

import { chromium } from 'playwright'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputRoot = resolve(repoRoot, '.tmp', 'tablet-ui-regression')
const viewport = { width: 1280, height: 800 }
const roles = ['operator', 'service', 'engineer']

const roleExpectations = {
  operator: {
    tabs: [],
    requiredText: ['设备状态', '任务控制', '手动', '回家', '完成情况'],
  },
  service: {
    tabs: [
      '总览',
      '地图工作台',
      '任务',
      '调度',
      '执行控制',
      '充电桩标定',
      '运行监控',
      'SLAM',
    ],
    forbiddenTabs: ['执行机构调试'],
  },
  engineer: {
    tabs: [
      '总览',
      '地图工作台',
      '任务',
      '调度',
      '执行控制',
      '充电桩标定',
      '运行监控',
      'SLAM',
      '执行机构调试',
    ],
  },
}

const moduleKeysByLabel = new Map([
  ['总览', 'overview'],
  ['地图工作台', 'workbench'],
  ['任务', 'tasks'],
  ['调度', 'schedules'],
  ['执行控制', 'execution'],
  ['充电桩标定', 'dock-calibration'],
  ['运行监控', 'runtime'],
  ['SLAM', 'slam'],
  ['执行机构调试', 'actuator-control'],
])

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function getEdgeExecutablePath() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolvePort(address.port)
          return
        }

        reject(new Error('Cannot allocate a local port for tablet UI smoke test.'))
      })
    })
  })
}

function waitForHttpOk(url, timeoutMs = 45000) {
  const startedAt = Date.now()

  return new Promise((resolveWait, reject) => {
    const poll = () => {
      const request = get(url, (response) => {
        response.resume()

        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
          resolveWait()
          return
        }

        retry()
      })

      request.on('error', retry)
      request.setTimeout(2000, () => {
        request.destroy()
        retry()
      })
    }

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for local dev server: ${url}`))
        return
      }

      setTimeout(poll, 350)
    }

    poll()
  })
}

async function stopProcessTree(processHandle) {
  if (!processHandle || processHandle.killed) {
    return
  }

  if (process.platform === 'win32') {
    await new Promise((resolveStop) => {
      execFile(
        'taskkill',
        ['/pid', String(processHandle.pid), '/T', '/F'],
        { windowsHide: true },
        () => resolveStop(),
      )
    })
    return
  }

  processHandle.kill('SIGTERM')
}

async function startDevServer(role) {
  const port = await getFreePort()
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm'
  const args =
    process.platform === 'win32'
      ? [
          '/c',
          'npm.cmd',
          'run',
          'dev',
          '--',
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--strictPort',
        ]
      : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
  const server = spawn(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_USE_MOCK_DATA: 'true',
      VITE_MOCK_ROLE: role,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const logs = []

  server.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  server.stderr.on('data', (chunk) => logs.push(chunk.toString()))

  const url = `http://127.0.0.1:${port}/`
  await waitForHttpOk(url)

  return { port, url, server, logs }
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    const shell = document.querySelector('.app-shell')
    const activePane = document.querySelector('.ant-tabs-tabpane-active')
    const overview = document.querySelector('.overview-page')
    const overviewRect = overview?.getBoundingClientRect()

    return {
      shellClass: shell?.className ?? '',
      tabs: Array.from(document.querySelectorAll('[role="tab"]')).map(
        (node) => node.textContent?.trim() ?? '',
      ),
      activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '',
      hasTabNav: Boolean(document.querySelector('.app-tabs > .ant-tabs-nav')),
      pageOverflowX: Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth,
      pageOverflowY: Math.max(root.scrollHeight, body.scrollHeight) - root.clientHeight,
      activePaneOverflowY: activePane ? activePane.scrollHeight - activePane.clientHeight : null,
      activePaneOverflow: activePane ? getComputedStyle(activePane).overflow : '',
      overviewRect: overviewRect
        ? {
            top: Math.round(overviewRect.top),
            height: Math.round(overviewRect.height),
            bottom: Math.round(overviewRect.bottom),
          }
        : null,
      bodyText: body.innerText,
    }
  })
}

async function clickTabByLabel(page, label) {
  const clicked = await page.evaluate((targetLabel) => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(
      (node) => node.textContent?.trim() === targetLabel,
    )

    if (!(tab instanceof HTMLElement)) {
      return false
    }

    tab.click()
    return true
  }, label)

  assert(clicked, `Cannot find tab: ${label}`)
  await delay(450)
}

async function runRoleSmoke(browser, role) {
  const serverHandle = await startDevServer(role)
  const roleOutputDir = join(outputRoot, role)
  mkdirSync(roleOutputDir, { recursive: true })

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false,
  })
  const page = await context.newPage()
  const consoleErrors = []
  const badResponses = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  page.on('response', (response) => {
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.url()}`)
    }
  })

  try {
    await page.goto(serverHandle.url, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('[data-testid="app-shell"]', { timeout: 30000 })
    await delay(800)

    const initialMetrics = await collectPageMetrics(page)
    const expectation = roleExpectations[role]

    assert(
      initialMetrics.pageOverflowX <= 1,
      `${role} initial page has horizontal overflow: ${initialMetrics.pageOverflowX}px`,
    )

    if (role === 'operator') {
      assert(!initialMetrics.hasTabNav, 'operator must not show the module navigation tabs')
      assert(initialMetrics.tabs.length === 0, `operator leaked tabs: ${initialMetrics.tabs.join(', ')}`)
      assert(
        initialMetrics.shellClass.includes('app-module-overview'),
        `operator shell is not in overview mode: ${initialMetrics.shellClass}`,
      )
      assert(
        initialMetrics.pageOverflowY <= 1,
        `operator overview must fit in 1280x800 without vertical scroll; overflow=${initialMetrics.pageOverflowY}px`,
      )
      assert(
        initialMetrics.overviewRect?.bottom <= viewport.height + 1,
        `operator overview bottom exceeds viewport: ${initialMetrics.overviewRect?.bottom}`,
      )

      for (const text of expectation.requiredText) {
        assert(initialMetrics.bodyText.includes(text), `operator overview is missing text: ${text}`)
      }

      await page.screenshot({ path: join(roleOutputDir, 'overview.png'), fullPage: true })

      return {
        role,
        visited: ['总览'],
        overflowY: initialMetrics.pageOverflowY,
        overflowX: initialMetrics.pageOverflowX,
        screenshots: [join(roleOutputDir, 'overview.png')],
      }
    }

    for (const label of expectation.tabs) {
      assert(
        initialMetrics.tabs.includes(label),
        `${role} is missing expected tab "${label}". Current tabs: ${initialMetrics.tabs.join(', ')}`,
      )
    }

    for (const label of expectation.forbiddenTabs ?? []) {
      assert(
        !initialMetrics.tabs.includes(label),
        `${role} must not show forbidden tab "${label}". Current tabs: ${initialMetrics.tabs.join(', ')}`,
      )
    }

    const visited = []
    const screenshots = []

    for (const label of initialMetrics.tabs) {
      await clickTabByLabel(page, label)
      const moduleKey = moduleKeysByLabel.get(label)
      const metrics = await collectPageMetrics(page)
      const screenshotPath = join(roleOutputDir, `${moduleKey ?? label}.png`)

      assert(metrics.pageOverflowX <= 1, `${role}/${label} has horizontal overflow: ${metrics.pageOverflowX}px`)

      if (moduleKey) {
        assert(
          metrics.shellClass.includes(`app-module-${moduleKey}`),
          `${role}/${label} did not switch shell module class correctly: ${metrics.shellClass}`,
        )
      }

      if (moduleKey !== 'overview') {
        assert(
          !metrics.shellClass.includes('app-module-overview'),
          `${role}/${label} is incorrectly locked in overview layout mode`,
        )
      }

      await page.screenshot({ path: screenshotPath, fullPage: true })
      visited.push(label)
      screenshots.push(screenshotPath)
    }

    assert(consoleErrors.length === 0, `${role} console errors:\n${consoleErrors.join('\n')}`)
    assert(badResponses.length === 0, `${role} bad HTTP responses:\n${badResponses.join('\n')}`)

    return {
      role,
      visited,
      overflowX: 0,
      screenshots,
    }
  } finally {
    await context.close()
    await stopProcessTree(serverHandle.server)
  }
}

async function main() {
  mkdirSync(outputRoot, { recursive: true })
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? getEdgeExecutablePath()
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  })

  const results = []

  try {
    for (const role of roles) {
      console.log(`Running 1280x800 tablet smoke for ${role}...`)
      results.push(await runRoleSmoke(browser, role))
    }
  } finally {
    await browser.close()
  }

  console.log(JSON.stringify({ ok: true, viewport, outputRoot, results }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
