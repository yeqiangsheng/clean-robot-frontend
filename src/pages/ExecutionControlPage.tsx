import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  InputNumber,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import {
  CaretRightOutlined,
  ClockCircleOutlined,
  PauseOutlined,
  PlaySquareOutlined,
  RollbackOutlined,
  StopOutlined,
} from '@ant-design/icons'

import {
  executeTaskCommand,
  manageTask,
} from '../api/gateway/robotGateway'
import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { SystemReadinessCard } from '../components/readiness/SystemReadinessCard'
import { LiveCommandContextCard } from '../components/runtime/LiveCommandContextCard'
import { useRosConnection } from '../hooks/useRosConnection'
import { useExecutionSessionStore } from '../stores/executionSessionStore'
import type { ExecutionCommandName } from '../types/execution'
import './ExecutionControlPage.css'

function getConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: 'Connected' }
    case 'connecting':
      return { color: 'processing', label: 'Connecting' }
    case 'error':
      return { color: 'error', label: 'Error' }
    case 'mock':
      return { color: 'purple', label: 'Mock Data' }
    case 'closed':
      return { color: 'warning', label: 'Closed' }
    default:
      return { color: 'default', label: 'Idle' }
  }
}

const commandConfig: Array<{
  command: ExecutionCommandName
  title: string
  icon: ReactNode
  styleType?: 'primary' | 'default'
  danger?: boolean
}> = [
  {
    command: 'START',
    title: 'START',
    icon: <CaretRightOutlined />,
    styleType: 'primary',
  },
  {
    command: 'PAUSE',
    title: 'PAUSE',
    icon: <PauseOutlined />,
  },
  {
    command: 'CONTINUE',
    title: 'CONTINUE',
    icon: <PlaySquareOutlined />,
  },
  {
    command: 'STOP',
    title: 'STOP',
    icon: <StopOutlined />,
    danger: true,
  },
  {
    command: 'RETURN',
    title: 'RETURN',
    icon: <RollbackOutlined />,
  },
]

export function ExecutionControlPage() {
  const { snapshot, defaultUrl, quickUrls, connect } = useRosConnection()
  const [activeCommand, setActiveCommand] = useState<ExecutionCommandName | null>(null)
  const focusedTaskId = useExecutionSessionStore((state) => state.focusedTaskId)
  const manualTaskId = useExecutionSessionStore((state) => state.manualTaskId)
  const lastResult = useExecutionSessionStore((state) => state.lastResult)
  const transportError = useExecutionSessionStore((state) => state.transportError)
  const setFocusedTaskId = useExecutionSessionStore((state) => state.setFocusedTaskId)
  const setFocusedTaskName = useExecutionSessionStore((state) => state.setFocusedTaskName)
  const setManualTaskId = useExecutionSessionStore((state) => state.setManualTaskId)
  const setLastResult = useExecutionSessionStore((state) => state.setLastResult)
  const setTransportError = useExecutionSessionStore((state) => state.setTransportError)

  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'
  const connectionTag = getConnectionTag(snapshot.status)

  const tasksQuery = useQuery({
    queryKey: ['execution-control', 'tasks', snapshot.url, snapshot.sessionId],
    queryFn: () => manageTask({ action: 'list' }),
    enabled: servicesReady,
    retry: false,
    staleTime: 15_000,
  })

  const selectedTask = useMemo(
    () => tasksQuery.data?.find((task) => task.id === focusedTaskId) ?? null,
    [focusedTaskId, tasksQuery.data],
  )

  const effectiveTaskId = focusedTaskId ?? manualTaskId

  useEffect(() => {
    if (selectedTask) {
      setFocusedTaskName(selectedTask.name)
      return
    }

    if (focusedTaskId === null) {
      setFocusedTaskName(null)
    }
  }, [focusedTaskId, selectedTask, setFocusedTaskName])

  const handleReconnect = async (url?: string) => {
    await connect((url ?? snapshot.url) || defaultUrl)
    await tasksQuery.refetch()
  }

  const handleCommand = async (command: ExecutionCommandName) => {
    setTransportError(null)
    setActiveCommand(command)

    try {
      const result = await executeTaskCommand(command, effectiveTaskId)
      setLastResult(result)
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : 'Execution service call failed.')
    } finally {
      setActiveCommand(null)
    }
  }

  return (
    <div className="execution-page">
      <header className="execution-page-header">
        <div>
          <Typography.Title level={2}>任务执行控制</Typography.Title>
          <Typography.Paragraph>
            这是现场运维的任务执行页，默认走统一网关包装 `/exe_task_server`。高风险执行命令会记录本地审计日志；是否真正运动仍以机器人现场反馈为准。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color="gold">Execution M3</Tag>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          <RosbridgeEndpointControl
            snapshot={snapshot}
            defaultUrl={defaultUrl}
            quickUrls={quickUrls}
            onConnect={handleReconnect}
          />
        </Space>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <Alert
          showIcon
          type="error"
          title="rosbridge 连接失败"
          description={snapshot.lastError}
          className="execution-banner"
        />
      ) : null}

      {snapshot.status === 'mock' ? (
        <Alert
          showIcon
          type="info"
          title="The page is using local mock data"
          description="Set VITE_USE_MOCK_DATA=false in .env.development to connect to the live backend."
          className="execution-banner"
        />
      ) : null}

      {tasksQuery.error instanceof Error ? (
        <Alert
          showIcon
          type="error"
          title="任务列表加载失败"
          description={tasksQuery.error.message}
          className="execution-banner"
        />
      ) : null}

      {transportError ? (
        <Alert
          showIcon
          type="error"
          title="任务执行命令失败"
          description={transportError}
          className="execution-banner"
        />
      ) : null}

      {lastResult ? (
        <Alert
          showIcon
          type={lastResult.success ? 'success' : 'warning'}
          title={`${lastResult.command} result`}
          description={lastResult.message || '(empty backend message)'}
          className="execution-banner"
        />
      ) : null}

      <div className="execution-grid">
        <aside className="execution-column">
          <Card title="Task Selection" className="execution-card">
            {tasksQuery.isLoading ? (
              <div className="execution-loading">
                <Spin />
                <Typography.Text>Loading task list...</Typography.Text>
              </div>
            ) : (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Typography.Text strong>Select task</Typography.Text>
                  <Select
                    style={{ width: '100%', marginTop: 8 }}
                    allowClear
                    showSearch
                    placeholder="Choose a task"
                    optionFilterProp="label"
                    value={focusedTaskId}
                    onChange={(value) => {
                      const nextValue = value ?? null
                      setFocusedTaskId(nextValue)
                      if (typeof value === 'number') {
                        setManualTaskId(value)
                      }
                    }}
                    options={(tasksQuery.data ?? []).map((task) => ({
                      label: `${task.id} · ${task.name}`,
                      value: task.id,
                    }))}
                  />
                </div>

                <div>
                  <Typography.Text strong>task_id input</Typography.Text>
                  <InputNumber
                    min={0}
                    precision={0}
                    style={{ width: '100%', marginTop: 8 }}
                    value={manualTaskId}
                    onChange={(value) => {
                      const nextValue = value ?? 0
                      setManualTaskId(nextValue)
                      if (nextValue > 0) {
                        setFocusedTaskId(nextValue)
                      } else {
                        setFocusedTaskId(null)
                        setFocusedTaskName(null)
                      }
                    }}
                  />
                </div>

                {selectedTask ? (
                  <Card size="small" className="execution-inner-card">
                    <Descriptions column={1} size="small" colon={false}>
                      <Descriptions.Item label="name">{selectedTask.name}</Descriptions.Item>
                      <Descriptions.Item label="map_name">
                        {selectedTask.mapName || '--'}
                      </Descriptions.Item>
                      <Descriptions.Item label="zone_id">
                        {selectedTask.zoneId || '--'}
                      </Descriptions.Item>
                      <Descriptions.Item label="clean_mode">
                        {selectedTask.cleanMode || '--'}
                      </Descriptions.Item>
                      <Descriptions.Item label="plan_profile_name">
                        {selectedTask.planProfileName || '--'}
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                ) : (
                  <Typography.Paragraph className="execution-footnote">
                    You can either select a task from the list or type a raw
                    `task_id` manually.
                  </Typography.Paragraph>
                )}
              </Space>
            )}
          </Card>

          <Card
            title="Milestone 3 Scope"
            className="execution-card"
            extra={<ClockCircleOutlined />}
          >
            <ul className="execution-scope-list">
              {[
                'START / PAUSE / CONTINUE / STOP / RETURN',
                'Raw backend message on success/failure',
                'Loading and disabled button states',
                'Task selection and task_id input',
                'No robot motion verification in this milestone',
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>

          <LiveCommandContextCard title="Shared Runtime Snapshot" selectedTask={selectedTask} />
        </aside>

        <main className="execution-column">
          <SystemReadinessCard
            snapshot={snapshot}
            taskId={effectiveTaskId}
            selectedTask={selectedTask}
          />

          <Card title="Execution Commands" className="execution-card">
            <div className="execution-command-grid">
              {commandConfig.map((item) => {
                const isLoading = activeCommand === item.command
                const disableForMissingTask = effectiveTaskId <= 0
                return (
                  <Button
                    key={item.command}
                    size="large"
                    className="execution-command-button"
                    type={item.styleType ?? 'default'}
                    danger={item.danger}
                    icon={item.icon}
                    loading={isLoading}
                    disabled={Boolean(activeCommand) || disableForMissingTask}
                    onClick={() => void handleCommand(item.command)}
                  >
                    {item.title}
                  </Button>
                )
              })}
            </div>

            <Typography.Paragraph className="execution-footnote">
              Buttons are disabled while a command is in flight. This page only
              verifies service-call behavior and UI state handling, not actual
              motion execution.
            </Typography.Paragraph>
          </Card>
        </main>

        <aside className="execution-column">
          <Card
            title="Latest Result"
            className="execution-card"
            extra={lastResult ? <Tag color={lastResult.success ? 'green' : 'orange'}>{lastResult.success ? 'success' : 'failure'}</Tag> : null}
          >
            {lastResult ? (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="command">{lastResult.command}</Descriptions.Item>
                  <Descriptions.Item label="task_id">{lastResult.taskId}</Descriptions.Item>
                  <Descriptions.Item label="success">
                    {lastResult.success ? 'true' : 'false'}
                  </Descriptions.Item>
                  <Descriptions.Item label="message">
                    {lastResult.message || '(empty backend message)'}
                  </Descriptions.Item>
                </Descriptions>

                <Card size="small" className="execution-inner-card">
                  <Descriptions column={1} size="small" colon={false}>
                    {Object.entries(lastResult.raw).map(([key, value]) => (
                      <Descriptions.Item key={key} label={key}>
                        <Typography.Text ellipsis>
                          {typeof value === 'string' ? value : JSON.stringify(value)}
                        </Typography.Text>
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </Card>
              </Space>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Command results will appear here after the first service call."
              />
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}

