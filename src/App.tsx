import { Component, Suspense, lazy, useEffect, useMemo, useState } from 'react'
import type {
  ComponentType,
  ErrorInfo,
  LazyExoticComponent,
  ReactNode,
} from 'react'

import { Button, Space, Tabs } from 'antd'
import {
  AppstoreOutlined,
  CalendarOutlined,
  CompassOutlined,
  ControlOutlined,
  DashboardOutlined,
  HomeOutlined,
  LogoutOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import {
  fetchAuditLog,
  fetchCurrentSession,
  loginToSiteGateway,
  logoutFromSiteGateway,
} from './api/gateway/siteGatewayClient'
import { LoginScreen } from './components/app/LoginScreen'
import { SunnyBearLogo } from './components/app/SunnyBearLogo'
import { AppFeedbackBanner } from './components/feedback/AppFeedbackBanner'
import { AppLoadingState } from './components/feedback/AppLoadingState'
import { RuntimeMonitorBridge } from './components/runtime/RuntimeMonitorBridge'
import { getAppConfig, isModuleEnabled } from './config/appConfig'
import { USE_MOCK_DATA } from './config/runtimeMode'
import { useInputCapabilities } from './hooks/useInputCapabilities'
import { useRosConnection } from './hooks/useRosConnection'
import { useAppShellStore } from './stores/appShellStore'
import type { AppModuleKey, CapabilityFlag } from './types/appShell'
import type { RuntimeMonitorOptions, RuntimeTopicKey } from './types/runtime'
import { getConnectionRecoveryHint } from './utils/connectionStatus'
import './App.css'

const RUNTIME_BRIDGE_TABS: AppModuleKey[] = [
  'execution',
  'dock-calibration',
  'actuator-control',
]

const EXECUTION_RUNTIME_TOPIC_KEYS: RuntimeTopicKey[] = [
  'taskState',
  'executorState',
  'runProgress',
]

const ACTUATOR_RUNTIME_TOPIC_KEYS: RuntimeTopicKey[] = [
  'batteryState',
  'combinedStatus',
  'stationStatus',
]

const RUNTIME_BRIDGE_OPTIONS: Partial<Record<AppModuleKey, RuntimeMonitorOptions>> = {
  execution: {
    topicKeys: EXECUTION_RUNTIME_TOPIC_KEYS,
    includeEndpointInfo: false,
  },
  'dock-calibration': {
    topicKeys: EXECUTION_RUNTIME_TOPIC_KEYS,
    includeEndpointInfo: false,
  },
  'actuator-control': {
    topicKeys: ACTUATOR_RUNTIME_TOPIC_KEYS,
    includeEndpointInfo: false,
  },
}

type PageModule = Record<string, unknown>

interface PageComponentProps {
  isActive?: boolean
}

type TabPageComponent =
  | ComponentType<PageComponentProps>
  | LazyExoticComponent<ComponentType<PageComponentProps>>

interface TabDefinition {
  key: AppModuleKey
  label: string
  title: string
  description: string
  capability: CapabilityFlag
  icon: ReactNode
  component: TabPageComponent
}

const pageLoaders = import.meta.glob([
  './pages/*.tsx',
  '!./pages/*.test.tsx',
  '!./pages/*.spec.tsx',
])
const eagerPageModules = import.meta.env.DEV
  ? import.meta.glob(
      ['./pages/*.tsx', '!./pages/*.test.tsx', '!./pages/*.spec.tsx'],
      { eager: true },
    )
  : null

function createTabPage(modulePath: string, exportName: string): TabPageComponent {
  if (import.meta.env.DEV) {
    const module = eagerPageModules?.[modulePath]

    if (!module || typeof module !== 'object' || !(exportName in module)) {
      throw new Error(`Missing page export: ${exportName} from ${modulePath}`)
    }

    return (module as Record<string, ComponentType<PageComponentProps>>)[exportName]
  }

  return lazy(async () => {
    const loader = pageLoaders[modulePath]

    if (!loader) {
      throw new Error(`Missing page module: ${modulePath}`)
    }

    const module = (await loader()) as PageModule
    const component = module[exportName]

    if (!component) {
      throw new Error(`Missing page export: ${exportName} from ${modulePath}`)
    }

    return {
      default: component as ComponentType<PageComponentProps>,
    }
  })
}

const OperationsOverviewPage = createTabPage(
  './pages/OperationsOverviewPage.tsx',
  'OperationsOverviewPage',
)

const MapWorkbenchPage = createTabPage(
  './pages/MapWorkbenchPage.tsx',
  'MapWorkbenchPage',
)

const TaskManagementPage = createTabPage(
  './pages/TaskManagementPage.tsx',
  'TaskManagementPage',
)

const ScheduleManagementPage = createTabPage(
  './pages/ScheduleManagementPage.tsx',
  'ScheduleManagementPage',
)

const SlamWorkbenchPage = createTabPage(
  './pages/SlamWorkbenchPage.tsx',
  'SlamWorkbenchPage',
)

const ExecutionControlPage = createTabPage(
  './pages/ExecutionControlPage.tsx',
  'ExecutionControlPage',
)

const DockCalibrationPage = createTabPage(
  './pages/DockCalibrationPage.tsx',
  'DockCalibrationPage',
)

const ActuatorControlPage = createTabPage(
  './pages/ActuatorControlPage.tsx',
  'ActuatorControlPage',
)

const RuntimeMonitoringPage = createTabPage(
  './pages/RuntimeMonitoringPage.tsx',
  'RuntimeMonitoringPage',
)

function TabPageFallback() {
  return <AppLoadingState className="app-tab-loading" message="页面加载中..." />
}

function AppErrorFallback({
  title,
  description,
  onRetry,
}: {
  title: string
  description: string
  onRetry: () => void
}) {
  return (
    <div className="app-error-panel">
      <AppFeedbackBanner
        tone="error"
        title={title}
        description={description}
        actionLabel="重试"
        onAction={onRetry}
      />
    </div>
  )
}

class AppSectionErrorBoundary extends Component<
  {
    title: string
    description: string
    children: ReactNode
  },
  {
    error: Error | null
  }
> {
  state = {
    error: null as Error | null,
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[app-section-error] ${this.props.title}`, error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <AppErrorFallback
          title={this.props.title}
          description={`${this.props.description} ${this.state.error.message}`}
          onRetry={this.handleRetry}
        />
      )
    }

    return this.props.children
  }
}

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    key: 'overview',
    label: '总览',
    title: '总览页加载失败',
    description: '总览页发生异常，但壳层其余部分仍可继续使用。',
    capability: 'overview',
    icon: <HomeOutlined />,
    component: OperationsOverviewPage,
  },
  {
    key: 'workbench',
    label: '地图工作台',
    title: '地图工作台加载失败',
    description: '地图工作台发生异常，可单独重试当前标签页。',
    capability: 'mapWorkbench',
    icon: <AppstoreOutlined />,
    component: MapWorkbenchPage,
  },
  {
    key: 'tasks',
    label: '任务',
    title: '任务页加载失败',
    description: '任务页发生异常，可单独重试当前标签页。',
    capability: 'taskManagement',
    icon: <OrderedListOutlined />,
    component: TaskManagementPage,
  },
  {
    key: 'schedules',
    label: '调度',
    title: '调度页加载失败',
    description: '调度页发生异常，可单独重试当前标签页。',
    capability: 'scheduleManagement',
    icon: <CalendarOutlined />,
    component: ScheduleManagementPage,
  },
  {
    key: 'execution',
    label: '执行控制',
    title: '执行控制页加载失败',
    description: '执行控制页发生异常，可单独重试当前标签页。',
    capability: 'executionControl',
    icon: <PlayCircleOutlined />,
    component: ExecutionControlPage,
  },
  {
    key: 'dock-calibration',
    label: '充电桩标定',
    title: '充电桩标定页加载失败',
    description: '充电桩标定页发生异常，可单独重试当前标签页。',
    capability: 'dockCalibration',
    icon: <ThunderboltOutlined />,
    component: DockCalibrationPage,
  },
  {
    key: 'runtime',
    label: '运行监控',
    title: '运行监控页加载失败',
    description: '运行监控页发生异常，可单独重试当前标签页。',
    capability: 'runtimeMonitoring',
    icon: <DashboardOutlined />,
    component: RuntimeMonitoringPage,
  },
  {
    key: 'slam',
    label: 'SLAM',
    title: 'SLAM 工作台加载失败',
    description: 'SLAM 工作台发生异常，可单独重试当前标签页。',
    capability: 'slamWorkbench',
    icon: <CompassOutlined />,
    component: SlamWorkbenchPage,
  },
  {
    key: 'actuator-control',
    label: '执行机构调试',
    title: '执行机构调试页加载失败',
    description: '执行机构调试页发生异常，可单独重试当前标签页。',
    capability: 'actuatorControl',
    icon: <ControlOutlined />,
    component: ActuatorControlPage,
  },
]

function App() {
  const config = getAppConfig()
  const { isTouchCapable, isCoarsePointer } = useInputCapabilities()
  const { snapshot } = useRosConnection()
  const sessionStatus = useAppShellStore((state) => state.sessionStatus)
  const currentUser = useAppShellStore((state) => state.currentUser)
  const grantedCapabilities = useAppShellStore((state) => state.grantedCapabilities)
  const authError = useAppShellStore((state) => state.authError)
  const setSession = useAppShellStore((state) => state.setSession)
  const setSessionStatus = useAppShellStore((state) => state.setSessionStatus)
  const setAuthError = useAppShellStore((state) => state.setAuthError)
  const setAuditEvents = useAppShellStore((state) => state.setAuditEvents)
  const clearClientSession = useAppShellStore((state) => state.clearClientSession)
  const [activeKey, setActiveKey] = useState<AppModuleKey>('overview')

  const connectionHint = getConnectionRecoveryHint(snapshot)
  const isOperatorSession = currentUser?.role === 'operator'

  useEffect(() => {
    if (USE_MOCK_DATA) {
      return
    }

    let disposed = false

    const bootstrapSession = async () => {
      setSessionStatus('checking')

      try {
        const session = await fetchCurrentSession()

        if (disposed) {
          return
        }

        setSession(session)
        const auditEvents = await fetchAuditLog()

        if (!disposed) {
          setAuditEvents(auditEvents)
        }
      } catch {
        if (!disposed) {
          clearClientSession()
        }
      }
    }

    void bootstrapSession()

    return () => {
      disposed = true
    }
  }, [clearClientSession, setAuditEvents, setSession, setSessionStatus])

  const visibleTabs = useMemo(
    () => {
      const roleVisibleTabs = TAB_DEFINITIONS.filter(
        (tab) => isModuleEnabled(tab.key) && grantedCapabilities.includes(tab.capability),
      )

      return isOperatorSession
        ? roleVisibleTabs.filter((tab) => tab.key === 'overview')
        : roleVisibleTabs
    },
    [grantedCapabilities, isOperatorSession],
  )

  const resolvedActiveKey = isOperatorSession
    ? 'overview'
    : visibleTabs.some((tab) => tab.key === activeKey)
      ? activeKey
      : (visibleTabs[0]?.key ?? 'overview')
  const activeTabDefinition =
    visibleTabs.find((tab) => tab.key === resolvedActiveKey) ?? visibleTabs[0]
  const ActiveTabComponent = activeTabDefinition?.component
  const shouldShowTabNav = !isOperatorSession && visibleTabs.length > 1

  const shouldMountRuntimeBridge = RUNTIME_BRIDGE_TABS.includes(resolvedActiveKey)
  const runtimeBridgeOptions = RUNTIME_BRIDGE_OPTIONS[resolvedActiveKey] ?? {}

  const renderTabPage = (title: string, description: string, children: ReactNode) => (
    <AppSectionErrorBoundary title={title} description={description}>
      <Suspense fallback={<TabPageFallback />}>{children}</Suspense>
    </AppSectionErrorBoundary>
  )

  const handleLogin = async (username: string, password: string) => {
    setAuthError(null)

    try {
      const session = await loginToSiteGateway(username, password)
      setSession(session)
      setAuditEvents(await fetchAuditLog())
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '登录失败。')
      throw error
    }
  }

  const handleLogout = async () => {
    if (USE_MOCK_DATA) {
      return
    }

    try {
      await logoutFromSiteGateway()
    } finally {
      clearClientSession()
      setActiveKey('overview')
    }
  }

  if (sessionStatus === 'checking') {
    return <AppLoadingState className="app-tab-loading" message="正在校验站点会话..." />
  }

  if (sessionStatus !== 'authenticated' || !currentUser) {
    return (
      <LoginScreen
        siteName={config.siteName}
        robotId={config.robotId}
        loading={false}
        error={authError}
        onSubmit={handleLogin}
      />
    )
  }

  return (
    <div
      data-testid="app-shell"
      className={[
        'app-shell',
        `app-module-${resolvedActiveKey}`,
        `app-role-${currentUser.role}`,
        isTouchCapable ? 'touch-ui' : '',
        isCoarsePointer ? 'coarse-pointer-ui' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <AppSectionErrorBoundary
        title="运行桥接异常"
        description="运行时 topic 桥接已与壳层隔离，可单独重试。"
      >
        {shouldMountRuntimeBridge ? <RuntimeMonitorBridge {...runtimeBridgeOptions} /> : null}
      </AppSectionErrorBoundary>

      <header className="app-topbar">
        <div className="app-topbar-main">
          <div className="app-brand-row">
            <SunnyBearLogo compact />
          </div>
        </div>

        <div className="app-topbar-actions">
          <Space size="small" wrap>
            {!USE_MOCK_DATA ? (
              <Button icon={<LogoutOutlined />} onClick={() => void handleLogout()}>
                {'\u9000\u51fa\u767b\u5f55'}
              </Button>
            ) : null}
          </Space>
        </div>
      </header>

      {connectionHint ? (
        <AppFeedbackBanner
          tone={connectionHint.type}
          className="app-shell-banner"
          title={connectionHint.title}
          description={connectionHint.description}
        />
      ) : null}

      {shouldShowTabNav ? (
        <Tabs
          className="app-tabs"
          activeKey={resolvedActiveKey}
          onChange={(key) => setActiveKey(key as AppModuleKey)}
          items={visibleTabs.map((tab) => {
            const TabComponent = tab.component

            return {
              key: tab.key,
              label: (
                <span className="app-tab-label">
                  {tab.icon}
                  <span>{tab.label}</span>
                </span>
              ),
              children: renderTabPage(
                tab.title,
                tab.description,
                <TabComponent isActive={tab.key === resolvedActiveKey} />,
              ),
            }
          })}
        />
      ) : ActiveTabComponent && activeTabDefinition ? (
        <main className="app-single-module-content">
          {renderTabPage(
            activeTabDefinition.title,
            activeTabDefinition.description,
            <ActiveTabComponent isActive />,
          )}
        </main>
      ) : null}
    </div>
  )
}

export default App
