import { useState } from 'react'

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  AuditOutlined,
  DeploymentUnitOutlined,
  DownloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'

import { exportDiagnostics } from '../api/gateway/robotGateway'
import { getAppConfig } from '../config/appConfig'
import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { useGatewayCapabilities } from '../hooks/useGatewayCapabilities'
import { useRosConnection } from '../hooks/useRosConnection'
import { useAppShellStore } from '../stores/appShellStore'
import { useRuntimeMonitorStore } from '../stores/runtimeMonitorStore'
import type { CapabilityStatusItem } from '../types/appShell'
import './OperationsOverviewPage.css'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: '已连接' }
    case 'connecting':
      return { color: 'processing', label: '连接中' }
    case 'error':
      return { color: 'error', label: '异常' }
    case 'mock':
      return { color: 'purple', label: 'Mock 数据' }
    case 'closed':
      return { color: 'warning', label: '已断开' }
    default:
      return { color: 'default', label: '空闲' }
  }
}

function getRoleLabel(role: string) {
  switch (role) {
    case 'service':
      return '售后'
    case 'engineer':
      return '工程师'
    default:
      return '操作员'
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'charging':
      return '充电'
    case 'slam':
      return 'SLAM'
    case 'system':
      return '系统'
    case 'task':
      return '任务'
    default:
      return '执行机构'
  }
}

function getCapabilityTag(item: CapabilityStatusItem) {
  switch (item.status) {
    case 'available':
      return { color: 'success', label: '可用' }
    case 'degraded':
      return { color: 'warning', label: '降级' }
    case 'missing':
      return { color: 'error', label: '缺失' }
    case 'disabled':
      return { color: 'default', label: '已禁用' }
    default:
      return { color: 'processing', label: '检查中' }
  }
}

function getAuditStatusTag(status: string) {
  switch (status) {
    case 'success':
      return { color: 'success', label: '成功' }
    case 'blocked':
      return { color: 'warning', label: '阻断' }
    default:
      return { color: 'error', label: '失败' }
  }
}

function formatDateTime(value: number | null) {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatPercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }

  const normalized = value >= 0 && value <= 1 ? value * 100 : value
  return `${normalized.toFixed(0)}%`
}

function formatNumber(value: unknown, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(2)}${suffix}`
    : '--'
}

function getStringField(topic: unknown, key: string) {
  if (!isRecord(topic)) {
    return '--'
  }

  const value = topic[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '--'
}

function getBatteryTopicMetrics(rawMessage: unknown) {
  if (!isRecord(rawMessage)) {
    return {
      percentage: '--',
      voltage: '--',
      current: '--',
    }
  }

  return {
    percentage: formatPercent(rawMessage.percentage),
    voltage: formatNumber(rawMessage.voltage, ' V'),
    current: formatNumber(rawMessage.current, ' A'),
  }
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function OperationsOverviewPage() {
  const config = getAppConfig()
  const { snapshot, defaultUrl, quickUrls, connect } = useRosConnection()
  const { capabilityMap, error, isFetching } = useGatewayCapabilities()
  const currentRole = useAppShellStore((state) => state.currentRole)
  const engineerUnlocked = useAppShellStore((state) => state.engineerUnlocked)
  const auditEvents = useAppShellStore((state) => state.auditEvents)
  const clearAuditEvents = useAppShellStore((state) => state.clearAuditEvents)
  const topicMap = useRuntimeMonitorStore((state) => state.topicMap)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false)

  const batteryMetrics = getBatteryTopicMetrics(topicMap.batteryState.rawMessage)
  const capabilityItems = Object.values(capabilityMap).sort((left, right) =>
    left.title.localeCompare(right.title, 'zh-CN'),
  )
  const connectionTag = getConnectionTag(snapshot.status)

  const handleExportDiagnostics = async () => {
    setExportError(null)
    setExportingDiagnostics(true)

    try {
      const { filename, bundle } = await exportDiagnostics()
      downloadJson(filename, bundle)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出诊断包失败。')
    } finally {
      setExportingDiagnostics(false)
    }
  }

  return (
    <div className="overview-page">
      <header className="overview-page-header">
        <div>
          <Typography.Title level={2}>运行总览</Typography.Title>
          <Typography.Paragraph>
            这是 Windows 试点部署的默认落地页。可在此核对本地配置、rosbridge 连接、能力状态、审计记录，并导出便于现场支持的诊断包。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color="gold">{config.siteName}</Tag>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          <Tag color={engineerUnlocked ? 'purple' : 'default'}>
            角色：{getRoleLabel(currentRole)}
          </Tag>
          <RosbridgeEndpointControl
            snapshot={snapshot}
            defaultUrl={defaultUrl}
            quickUrls={quickUrls}
            onConnect={connect}
          />
          <Button
            data-testid="overview-export-diagnostics"
            type="primary"
            icon={<DownloadOutlined />}
            loading={exportingDiagnostics}
            onClick={() => void handleExportDiagnostics()}
          >
            导出诊断包
          </Button>
        </Space>
      </header>

      {!snapshot.isConnected && snapshot.status !== 'mock' ? (
        <Alert
          showIcon
          type="warning"
          title="ROS 未连接"
          description="壳层仍可打开，但在 rosbridge 连通前，能力探测和实时运行快照会受到限制。"
          className="overview-banner"
        />
      ) : null}

      {error ? (
        <Alert
          showIcon
          type="warning"
          title="能力探测失败"
          description={error.message}
          className="overview-banner"
        />
      ) : null}

      {exportError ? (
        <Alert
          showIcon
          type="error"
          title="诊断包导出失败"
          description={exportError}
          className="overview-banner"
        />
      ) : null}

      <div className="overview-grid">
        <section className="overview-column">
          <Card
            title="本地配置"
            className="overview-card"
            extra={<SettingOutlined />}
          >
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="站点名称">{config.siteName}</Descriptions.Item>
              <Descriptions.Item label="机器人标识">{config.robotId}</Descriptions.Item>
              <Descriptions.Item label="默认 rosbridge">{config.rosbridgeUrl}</Descriptions.Item>
              <Descriptions.Item label="当前连接地址">{snapshot.url || '--'}</Descriptions.Item>
              <Descriptions.Item label="工程师模式">{config.engineerUnlockMode}</Descriptions.Item>
              <Descriptions.Item label="日志保留天数">{config.logRetentionDays}</Descriptions.Item>
              <Descriptions.Item label="版本">{__APP_VERSION__}</Descriptions.Item>
              <Descriptions.Item label="构建时间">{__APP_BUILD_TIME__}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            title="运行快照"
            className="overview-card"
            extra={<DeploymentUnitOutlined />}
          >
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="电量">{batteryMetrics.percentage}</Descriptions.Item>
              <Descriptions.Item label="电压">{batteryMetrics.voltage}</Descriptions.Item>
              <Descriptions.Item label="电流">{batteryMetrics.current}</Descriptions.Item>
              <Descriptions.Item label="任务状态">
                {getStringField(topicMap.taskState.rawMessage, 'state')}
              </Descriptions.Item>
              <Descriptions.Item label="执行器状态">
                {getStringField(topicMap.executorState.rawMessage, 'state')}
              </Descriptions.Item>
              <Descriptions.Item label="补给站状态">
                {getStringField(topicMap.dockSupplyState.rawMessage, 'state')}
              </Descriptions.Item>
              <Descriptions.Item label="最近电池消息">
                {formatDateTime(topicMap.batteryState.lastMessageAt)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </section>

        <section className="overview-column">
          <Card
            title="能力状态"
            className="overview-card"
            extra={
              <Space size="small">
                {isFetching ? <Tag color="processing">刷新中</Tag> : null}
                <SafetyCertificateOutlined />
              </Space>
            }
          >
            <div className="overview-list">
              {capabilityItems.map((item) => {
                const presentation = getCapabilityTag(item)

                return (
                  <div key={item.key} className="overview-capability-item">
                    <div className="overview-capability-main">
                      <Space size="small" wrap>
                        <Typography.Text strong>{item.title}</Typography.Text>
                        <Tag color={presentation.color}>{presentation.label}</Tag>
                      </Space>
                      <Typography.Paragraph className="overview-muted">
                        {item.summary}
                      </Typography.Paragraph>
                      {item.dependencies.length > 0 ? (
                        <Typography.Text type="secondary">
                          依赖项：{item.dependencies.join(' | ')}
                        </Typography.Text>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </section>

        <section className="overview-column">
          <Card
            title="最近审计记录"
            className="overview-card"
            extra={
              <Button size="small" onClick={clearAuditEvents}>
                清空
              </Button>
            }
          >
            {auditEvents.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无近期高风险审计记录。" />
            ) : (
              <div className="overview-list">
                {auditEvents.slice(0, 12).map((item) => (
                  <div key={item.id} className="overview-audit-item">
                    <div className="overview-audit-main">
                      <Space size="small" wrap>
                        <Tag color={getAuditStatusTag(item.status).color}>
                          {getAuditStatusTag(item.status).label}
                        </Tag>
                        <Typography.Text strong>{item.action}</Typography.Text>
                      </Space>
                      <Typography.Text>{item.target}</Typography.Text>
                      <Typography.Paragraph className="overview-muted">
                        {item.message}
                      </Typography.Paragraph>
                      <Typography.Text type="secondary">
                        {formatDateTime(item.timestamp)} | {getRoleLabel(item.role)} |{' '}
                        {getCategoryLabel(item.category)}
                      </Typography.Text>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="运行提示" className="overview-card" extra={<AuditOutlined />}>
            <Space orientation="vertical" size="middle">
              <Alert
                showIcon
                type="info"
                title="默认视图面向安全值守"
                description="任务、调度、运行监控和地图流程默认可见。SLAM 与执行机构工具需进入工程师模式后使用。"
              />
              <Alert
                showIcon
                type="warning"
                title="高风险动作会写入本地审计日志"
                description="执行控制、执行机构调试、充电控制和 SLAM 动作均会保存在本地，便于现场追溯。"
              />
            </Space>
          </Card>
        </section>
      </div>
    </div>
  )
}
