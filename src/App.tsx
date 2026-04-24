import { Component, Suspense, lazy, useEffect, useMemo, useState } from 'react'
import type {
  ComponentType,
  ErrorInfo,
  LazyExoticComponent,
  ReactNode,
} from 'react'

import { Button, Space, Tabs, Tag, Typography } from 'antd'
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
} from '@ant-design/icons'

import {
  fetchAuditLog,
  fetchCurrentSession,
  loginToSiteGateway,
  logoutFromSiteGateway,
} from './api/gateway/siteGatewayClient'
import { LoginScreen } from './components/app/LoginScreen'
import { AppFeedbackBanner } from './components/feedback/AppFeedbackBanner'
import { AppLoadingState } from './components/feedback/AppLoadingState'
import { RuntimeMonitorBridge } from './components/runtime/RuntimeMonitorBridge'
import { getAppConfig, isModuleEnabled } from './config/appConfig'
import { useInputCapabilities } from './hooks/useInputCapabilities'
import { useRosConnection } from './hooks/useRosConnection'
import { useAppShellStore } from './stores/appShellStore'
import type { AppModuleKey, CapabilityFlag, UserRole } from './types/appShell'
import type { RuntimeMonitorOptions, RuntimeTopicKey } from './types/runtime'
import {
  getConnectionRecoveryHint,
  getGatewayConnectionPresentation,
  getRosConnectionPresentation,
} from './utils/connectionStatus'
import './App.css'

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

const RUNTIME_BRIDGE_TABS: AppModuleKey[] = [
  'overview',
  'execution',
  'runtime',
  'actuator-control',
]

const OVERVIEW_RUNTIME_TOPIC_KEYS: RuntimeTopicKey[] = [
  'taskState',
  'executorState',
  'dockSupplyState',
  'batteryState',
  'stationStatus',
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
  overview: {
    topicKeys: OVERVIEW_RUNTIME_TOPIC_KEYS,
    includeEndpointInfo: false,
  },
  execution: {
    topicKeys: EXECUTION_RUNTIME_TOPIC_KEYS,
    includeEndpointInfo: false,
  },
  runtime: {
    includeEndpointInfo: true,
  },
  'actuator-control': {
    topicKeys: ACTUATOR_RUNTIME_TOPIC_KEYS,
    includeEndpointInfo: false,
  },
}

type PageModule = Record<string, unknown>
type TabPageComponent = ComponentType | LazyExoticComponent<ComponentType>

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

    return (module as Record<string, ComponentType>)[exportName]
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
      default: component as ComponentType,
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

const ActuatorControlPage = createTabPage(
  './pages/ActuatorControlPage.tsx',
  'ActuatorControlPage',
)

const RuntimeMonitoringPage = createTabPage(
  './pages/RuntimeMonitoringPage.tsx',
  'RuntimeMonitoringPage',
)

function getRoleLabel(role: UserRole) {
  switch (role) {
    case 'service':
      return '服务'
    case 'engineer':
      return '工程师'
    case 'admin':
      return '管理员'
    default:
      return '操作员'
  }
}

function getRoleColor(role: UserRole) {
  switch (role) {
    case 'engineer':
      return 'purple'
    case 'admin':
      return 'red'
    case 'service':
      return 'blue'
    default:
      return 'default'
  }
}

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
  const currentRole = useAppShellStore((state) => state.currentRole)
  const grantedCapabilities = useAppShellStore((state) => state.grantedCapabilities)
  const authError = useAppShellStore((state) => state.authError)
  const setSession = useAppShellStore((state) => state.setSession)
  const setSessionStatus = useAppShellStore((state) => state.setSessionStatus)
  const setAuthError = useAppShellStore((state) => state.setAuthError)
  const setAuditEvents = useAppShellStore((state) => state.setAuditEvents)
  const clearClientSession = useAppShellStore((state) => state.clearClientSession)
  const [activeKey, setActiveKey] = useState<AppModuleKey>('overview')

  const gatewayTag = getGatewayConnectionPresentation(snapshot.gatewayStatus)
  const rosTag = getRosConnectionPresentation(snapshot.status)
  const connectionHint = getConnectionRecoveryHint(snapshot)

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
    () =>
      TAB_DEFINITIONS.filter(
        (tab) => isModuleEnabled(tab.key) && grantedCapabilities.includes(tab.capability),
      ),
    [grantedCapabilities],
  )

  const resolvedActiveKey = visibleTabs.some((tab) => tab.key === activeKey)
    ? activeKey
    : (visibleTabs[0]?.key ?? 'overview')

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
          <Space size="small" wrap>
            <Tag color="gold">{config.siteName}</Tag>
            <Tag>{config.robotId}</Tag>
            <Tag color={gatewayTag.color}>{gatewayTag.label}</Tag>
            <Tag color={rosTag.color}>{rosTag.label}</Tag>
            <Tag color={getRoleColor(currentRole)}>{getRoleLabel(currentRole)}</Tag>
            <Tag color="geekblue">{currentUser.displayName}</Tag>
          </Space>

          <Typography.Title data-testid="app-topbar-title" level={3}>
            清洁机器人商用前端
          </Typography.Title>

          <Typography.Paragraph>
            浏览器现在通过本地站点 Gateway 访问现场能力。高风险动作、审计和权限判断已经从
            浏览器本地状态迁移到服务端会话边界。
          </Typography.Paragraph>
        </div>

        <div className="app-topbar-actions">
          <Space size="small" wrap>
            {!USE_MOCK_DATA ? (
              <Button icon={<LogoutOutlined />} onClick={() => void handleLogout()}>
                退出登录
              </Button>
            ) : null}
          </Space>

          <Typography.Text type="secondary">
            版本 {__APP_VERSION__} | 构建 {__APP_BUILD_TIME__}
          </Typography.Text>
        </div>
      </header>

      {connectionHint ? (
        <AppFeedbackBanner
          tone={connectionHint.type}
          className="app-shell-banner"
          title={connectionHint.title}
          description={connectionHint.description}
        />
      ) : (
        <AppFeedbackBanner
          tone="info"
          className="app-shell-banner"
          title="站点 Gateway 已接管正式权限边界"
          description="工程师能力、高风险命令和审计记录现在统一经过本地站点 Gateway。浏览器界面只负责展示和交互，不再承担真实认证或明文口令校验。"
        />
      )}

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
            children: renderTabPage(tab.title, tab.description, <TabComponent />),
          }
        })}
      />
    </div>
  )
}

export default App
