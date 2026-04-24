import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function openTabAndAssert(page: Page, tabLabel: string, markerText: string | RegExp) {
  await page.getByRole('tab', { name: tabLabel }).click()
  await expect(page.getByRole('heading', { name: markerText }).first()).toBeVisible()
}

test('@mock loads the mock shell and opens the major trial pages', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByText('Mock 数据').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '导出诊断包' })).toBeVisible()

  await openTabAndAssert(page, '地图工作台', /地图工作台/)
  await openTabAndAssert(page, '任务', /任务管理/)
  await openTabAndAssert(page, '调度', /调度管理/)
  await openTabAndAssert(page, '执行控制', /任务执行控制/)
  await openTabAndAssert(page, '运行监控', /运行监控/)
  await openTabAndAssert(page, 'SLAM', /SLAM .*台/)
  await openTabAndAssert(page, '执行机构调试', /执行机构调试/)
})
