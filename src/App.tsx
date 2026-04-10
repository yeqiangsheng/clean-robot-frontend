import { Component, Suspense, lazy, useEffect, useMemo, useState } from 'react'
import type {
  ComponentType,
  ErrorInfo,
  LazyExoticComponent,
  ReactNode,
} from 'react'

import {
  Alert,
  Button,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  AppstoreOutlined,
  CalendarOutlined,
  CompassOutlined,
  ControlOutlined,
  DashboardOutlined,
  HomeOutlined,
  LockOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'

import { isCapabilityAllowedForRole } from './api/gateway/accessControl'
import { getAppConfig, isModuleEnabled } from './config/appConfig'
import { RuntimeMonitorBridge } from './components/runtime/RuntimeMonitorBridge'
import { useInputCapabilities } from './hooks/useInputCapabilities'
import { useRosConnection } from './hooks/useRosConnection'
import { useAppShellStore } from './stores/appShellStore'
import type { AppModuleKey, CapabilityFlag, UserRole } from './types/appShell'
import './App.css'

type PageModule = Record<string, unknown>
type TabPageComponent =
  | ComponentType
  | LazyExoticComponent<ComponentType>

interface TabDefinition {
  key: AppModuleKey
  label: string
  title: string
  description: string
  capability: CapabilityFlag
  icon: ReactNode
  component: TabPageComponent
}

const pageLoaders = import.meta.glob('./pages/*.tsx')
const eagerPageModules = import.meta.env.DEV
  ? import.meta.glob('./pages/*.tsx', { eager: true })
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

function getConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: 'ROS 已连接' }
    case 'connecting':
      return { color: 'processing', label: 'ROS 连接中' }
    case 'error':
      return { color: 'error', label: 'ROS 异常' }
    case 'mock':
      return { color: 'purple', label: 'Mock 数据' }
    case 'closed':
      return { color: 'warning', label: 'ROS 已断开' }
    default:
      return { color: 'default', label: 'ROS 空闲' }
  }
}

function getRoleLabel(role: UserRole) {
  switch (role) {
    case 'service':
      return '售后'
    case 'engineer':
      return '工程师'
    default:
      return '操作员'
  }
}

function TabPageFallback() {
  return (
    <div className="app-tab-loading">
      <Spin size="large" />
      <Typography.Text>页面加载中...</Typography.Text>
    </div>
  )
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
      <Alert
        showIcon
        type="error"
        title={title}
        description={
          <div className="app-error-content">
            <Typography.Paragraph>{description}</Typography.Paragraph>
            <Button type="primary" onClick={onRetry}>
              重试
            </Button>
          </div>
        }
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
    description: '地图工作台发生异常，可单独重试当前标签页，无需重载整个壳层。',
    capability: 'mapWorkbench',
    icon: <AppstoreOutlined />,
    component: MapWorkbenchPage,
  },
  {
    key: 'tasks',
    label: '任务',
    title: '任务管理页加载失败',
    description: '任务管理页发生异常，可单独重试当前标签页，无需重载整个壳层。',
    capability: 'taskManagement',
    icon: <OrderedListOutlined />,
    component: TaskManagementPage,
  },
  {
    key: 'schedules',
    label: '调度',
    title: '调度管理页加载失败',
    description: '调度管理页发生异常，可单独重试当前标签页，无需重载整个壳层。',
    capability: 'scheduleManagement',
    icon: <CalendarOutlined />,
    component: ScheduleManagementPage,
  },
  {
    key: 'execution',
    label: '执行控制',
    title: '执行控制页加载失败',
    description: '执行控制页发生异常，可单独重试当前标签页，无需重载整个壳层。',
    capability: 'executionControl',
    icon: <PlayCircleOutlined />,
    component: ExecutionControlPage,
  },
  {
    key: 'runtime',
    label: '运行监控',
    title: '运行监控页加载失败',
    description: '运行监控页发生异常，可单独重试当前标签页，无需重载整个壳层。',
    capability: 'runtimeMonitoring',
    icon: <DashboardOutlined />,
    component: RuntimeMonitoringPage,
  },
  {
    key: 'slam',
    label: 'SLAM',
    title: 'SLAM 工程台加载失败',
    description: 'SLAM 页面发生异常，可单独重试当前标签页，无需重载整个壳层。',
    capability: 'slamWorkbench',
    icon: <CompassOutlined />,
    component: SlamWorkbenchPage,
  },
  {
    key: 'actuator-control',
    label: '执行机构调试',
    title: '执行机构调试页加载失败',
    description: '执行机构调试页发生异常，可单独重试当前标签页，无需重载整个壳层。',
    capability: 'actuatorControl',
    icon: <ControlOutlined />,
    component: ActuatorControlPage,
  },
]

function App() {
  const config = getAppConfig()
  const { isTouchCapable, isCoarsePointer } = useInputCapabilities()
  const { snapshot } = useRosConnection()
  const currentRole = useAppShellStore((state) => state.currentRole)
  const setCurrentRole = useAppShellStore((state) => state.setCurrentRole)
  const engineerUnlocked = useAppShellStore((state) => state.engineerUnlocked)
  const setEngineerUnlocked = useAppShellStore((state) => state.setEngineerUnlocked)
  const [activeKey, setActiveKey] = useState<AppModuleKey>('overview')

  const connectionTag = getConnectionTag(snapshot.status)
  const displayRole =
    currentRole === 'engineer' && !engineerUnlocked ? 'service' : currentRole

  const visibleTabs = useMemo(
    () =>
      TAB_DEFINITIONS.filter(
        (tab) =>
          isModuleEnabled(tab.key) &&
          isCapabilityAllowedForRole(tab.capability, displayRole),
      ),
    [displayRole],
  )

  useEffect(() => {
    if (currentRole === 'engineer' && !engineerUnlocked) {
      setCurrentRole('service')
    }
  }, [currentRole, engineerUnlocked, setCurrentRole])

  const resolvedActiveKey = visibleTabs.some((tab) => tab.key === activeKey)
    ? activeKey
    : 'overview'

  const renderTabPage = (title: string, description: string, children: ReactNode) => (
    <AppSectionErrorBoundary title={title} description={description}>
      <Suspense fallback={<TabPageFallback />}>{children}</Suspense>
    </AppSectionErrorBoundary>
  )

  const handleRoleChange = (nextRole: UserRole) => {
    if (nextRole === 'engineer' && !engineerUnlocked) {
      setEngineerUnlocked(true)
      setCurrentRole('engineer')
      return
    }

    setCurrentRole(nextRole)
  }

  const handleExitEngineerMode = () => {
    setEngineerUnlocked(false)
    setCurrentRole('service')
    setActiveKey('overview')
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
        <RuntimeMonitorBridge />
      </AppSectionErrorBoundary>

      <header className="app-topbar">
        <div className="app-topbar-main">
          <Space size="small" wrap>
            <Tag color="gold">{config.siteName}</Tag>
            <Tag>{config.robotId}</Tag>
            <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
            <Tag color={displayRole === 'engineer' ? 'purple' : 'blue'}>
              角色：{getRoleLabel(displayRole)}
            </Tag>
          </Space>
          <Typography.Title data-testid="app-topbar-title" level={3}>
            清洁机器人试点前端
          </Typography.Title>
          <Typography.Paragraph>
            任务、运行监控和地图工作流默认保持可见。高风险 SLAM 与执行机构工具需显式进入工程师模式后才开放。
          </Typography.Paragraph>
        </div>

        <div className="app-topbar-actions">
          <Space size="small" wrap>
            <Select<UserRole>
              value={currentRole}
              style={{ width: 150 }}
              onChange={handleRoleChange}
              options={[
                { label: '操作员', value: 'operator' },
                { label: '售后', value: 'service' },
                { label: '工程师', value: 'engineer' },
              ]}
            />
            {engineerUnlocked ? (
              <Button icon={<SafetyCertificateOutlined />} onClick={handleExitEngineerMode}>
                退出工程师模式
              </Button>
            ) : (
              <Button icon={<LockOutlined />} onClick={() => handleRoleChange('engineer')}>
                进入工程师模式
              </Button>
            )}
          </Space>
          <Typography.Text type="secondary">
            版本 {__APP_VERSION__} | 构建 {__APP_BUILD_TIME__}
          </Typography.Text>
        </div>
      </header>

      <Alert
        showIcon
        type="warning"
        className="app-shell-banner"
        title="高风险工具已隔离"
        description="SLAM 提交、执行机构调试和低层命令工具仅在工程师模式下开放，并会写入本地审计日志。"
      />

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
