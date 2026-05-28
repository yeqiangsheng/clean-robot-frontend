import { Button, Card, Descriptions, Space, Tag, Typography } from 'antd'
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import { useSystemReadiness } from '../../hooks/useSystemReadiness'
import type { RosConnectionSnapshot } from '../../types/ros'
import type { SystemReadinessCheck } from '../../types/systemReadiness'
import type { TaskEntity } from '../../types/task'
import './SystemReadinessCard.css'

const CHECK_KEY_LABELS: Record<string, string> = {
  active_map: '激活地图',
  runtime_map: '运行时地图',
  odometry: '里程计',
  localization: '定位状态',
  move_base_flex: '导航执行器',
  mcore_bridge: '底盘桥接',
  task_manager: '任务管理器',
  executor: '执行器',
  battery: '电池',
  station_status: '站状态',
  task_config: '任务配置',
  health: '系统健康',
  combined_status: '综合状态',
  dock_supply: '补给/回桩链路',
}

function formatDiagnosticMessage(message: string) {
  const normalized = message.trim()
  const lower = normalized.toLowerCase()

  if (!normalized) {
    return ''
  }

  if (lower === 'station_status stale or missing') {
    return '站状态延迟或缺失'
  }

  if (lower === 'odometry not ready') {
    return '里程计未就绪'
  }

  if (lower === 'localization not ready') {
    return '定位未就绪'
  }

  if (lower === 'task manager busy') {
    return '任务管理器繁忙'
  }

  if (lower === 'executor not idle') {
    return '执行器不处于空闲状态'
  }

  if (lower === 'task disabled') {
    return '任务已禁用'
  }

  if (lower.includes('runtime map') && lower.includes('mismatch')) {
    return '运行时地图不匹配'
  }

  if (lower.includes('active map') && lower.includes('mismatch')) {
    return '激活地图不匹配'
  }

  if (lower.includes('task map') && lower.includes('mismatch')) {
    return '任务地图不匹配'
  }

  return normalized
}

function formatDiagnosticMessages(messages: string[]) {
  return messages
    .map((message) => formatDiagnosticMessage(message))
    .filter((message) => message.length > 0)
}

function getTopicHealthPresentation(health: string) {
  switch (health) {
    case 'live':
      return { color: 'green', label: '实时' }
    case 'stale':
      return { color: 'orange', label: '延迟' }
    case 'waiting':
      return { color: 'blue', label: '等待首帧' }
    case 'unavailable':
      return { color: 'default', label: '暂无发布' }
    default:
      return { color: 'red', label: '已断开' }
  }
}

function getBooleanTag(value: boolean, trueLabel: string, falseLabel: string) {
  return <Tag color={value ? 'green' : 'red'}>{value ? trueLabel : falseLabel}</Tag>
}

function getLevelTag(level: string) {
  const normalized = level.trim().toLowerCase()

  if (['ok', 'pass', 'ready', 'healthy'].includes(normalized)) {
    return <Tag color="green">通过</Tag>
  }

  if (['warn', 'warning', 'degraded'].includes(normalized)) {
    return <Tag color="orange">告警</Tag>
  }

  if (['error', 'fatal', 'blocking', 'blocker'].includes(normalized)) {
    return <Tag color="red">阻断</Tag>
  }

  if (['info', 'notice'].includes(normalized)) {
    return <Tag color="blue">提示</Tag>
  }

  return <Tag>{level || '--'}</Tag>
}

function isNonBlockingWarningCheck(check: SystemReadinessCheck) {
  const level = check.level.trim().toLowerCase()

  return (
    check.key === 'station_status' ||
    ['warn', 'warning', 'degraded', 'info', 'notice'].includes(level)
  )
}

function isBlockingReadinessCheck(check: SystemReadinessCheck) {
  return !check.ok && !isNonBlockingWarningCheck(check)
}

function formatAgeS(value: number | null) {
  if (value === null || value < 0) {
    return '--'
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}s`
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return '--'
  }

  const normalized = value >= 0 && value <= 1 ? value * 100 : value
  return `${normalized.toFixed(0)}%`
}

function formatTimestamp(value: number | null) {
  if (value === null) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatCheckValue(value: string) {
  switch (value.trim().toLowerCase()) {
    case 'true':
      return '是'
    case 'false':
      return '否'
    case 'connected':
      return '已连接'
    case 'disconnected':
      return '已断开'
    case 'online':
      return '在线'
    case 'offline':
      return '离线'
    case 'fresh':
      return '新鲜'
    case 'stale':
      return '延迟'
    case 'missing':
      return '缺失'
    case 'stale/missing':
      return '延迟或缺失'
    case 'ok':
      return '正常'
    default:
      return value
  }
}

function parseKeyValueSummary(summary: string) {
  const pairs = new Map<string, string>()

  for (const token of summary.split(/\s+/)) {
    const separatorIndex = token.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = token.slice(0, separatorIndex).trim()
    const value = token.slice(separatorIndex + 1).trim()
    if (key && value) {
      pairs.set(key, value)
    }
  }

  return pairs
}

function formatCheckSummary(check: SystemReadinessCheck) {
  const summary = check.summary.trim()

  if (!summary) {
    return '后端未返回额外说明。'
  }

  const pairs = parseKeyValueSummary(summary)

  switch (check.key) {
    case 'active_map': {
      const mapName = pairs.get('map') || summary.replace(/^selected map=/i, '').trim()
      return `当前激活地图：${mapName || '--'}`
    }
    case 'runtime_map': {
      const mapName = pairs.get('map') || summary.replace(/^runtime map=/i, '').trim()
      return `运行时地图：${mapName || '--'}`
    }
    case 'odometry': {
      const source = pairs.get('source')
      const valid = pairs.get('valid')
      const code = pairs.get('code')
      const message = pairs.get('msg')
      const parts = []
      if (source) {
        parts.push(`来源 ${source}`)
      }
      if (valid) {
        parts.push(`里程计${valid === 'true' ? '有效' : '无效'}`)
      }
      if (code) {
        parts.push(`错误码 ${code}`)
      }
      if (message) {
        parts.push(`说明 ${formatCheckValue(message)}`)
      }
      return parts.join('，') || summary
    }
    case 'localization': {
      const state = pairs.get('state')
      const valid = pairs.get('valid')
      const parts = []
      if (state) {
        parts.push(`定位状态：${state}`)
      }
      if (valid) {
        parts.push(`定位${valid === 'true' ? '有效' : '无效'}`)
      }
      return parts.join('，') || summary
    }
    case 'move_base_flex':
      return `导航执行器 ${formatCheckValue(summary)}`
    case 'mcore_bridge':
      return `底盘桥接 ${formatCheckValue(summary)}`
    case 'task_manager': {
      const mission = pairs.get('mission')
      const phase = pairs.get('phase')
      const publicState = pairs.get('public')
      const parts = []
      if (mission) {
        parts.push(`任务管理状态：${mission}`)
      }
      if (phase) {
        parts.push(`阶段 ${phase}`)
      }
      if (publicState) {
        parts.push(`对外状态 ${publicState}`)
      }
      return parts.join('，') || summary
    }
    case 'executor': {
      const executorState = pairs.get('executor_state') || pairs.get('state')
      return executorState ? `执行器状态：${executorState}` : summary
    }
    case 'health':
      return summary.trim().toUpperCase() === 'OK' ? '系统健康正常' : summary
    case 'battery': {
      const soc = pairs.get('soc')
      if (!soc) {
        return summary
      }
      const value = Number(soc)
      if (!Number.isFinite(value)) {
        return summary
      }
      const normalized = value >= 0 && value <= 1 ? value * 100 : value
      return `电量 ${normalized.toFixed(0)}%`
    }
    case 'combined_status':
      return `综合状态链路 ${formatCheckValue(summary)}`
    case 'dock_supply': {
      const state = pairs.get('state')
      return state ? `补给/回桩状态：${state}` : summary
    }
    case 'station_status':
      return `站状态 ${formatCheckValue(summary)}`
    case 'task_config':
      return `任务配置：${summary}`
    default:
      return summary
  }
}

function shouldShowRawKey(key: string) {
  return !(key in CHECK_KEY_LABELS)
}

function getServiceStatusLabel(params: {
  isLoading: boolean
  dataSuccess: boolean | null
  hasError: boolean
}) {
  if (params.isLoading) {
    return '查询中'
  }

  if (params.hasError) {
    return '异常'
  }

  if (params.dataSuccess === true) {
    return '成功'
  }

  if (params.dataSuccess === false) {
    return '失败'
  }

  return '--'
}

function getCheckTitle(key: string) {
  return CHECK_KEY_LABELS[key] || key || '--'
}

function CheckBadges({ check }: { check: SystemReadinessCheck }) {
  const ageLabel = formatAgeS(check.ageS)

  return (
    <Space size={6} wrap>
      {getLevelTag(check.level)}
      <Tag color={check.ok ? 'green' : 'red'}>{check.ok ? '通过' : '未通过'}</Tag>
      {check.fresh ? <Tag color="green">新鲜</Tag> : null}
      {check.stale ? <Tag color="orange">延迟</Tag> : null}
      {check.missing ? <Tag color="red">缺失</Tag> : null}
      {ageLabel !== '--' ? <Tag>{ageLabel}</Tag> : null}
    </Space>
  )
}

interface SystemReadinessCardProps {
  snapshot: RosConnectionSnapshot
  taskId: number
  selectedTask?: TaskEntity | null
  title?: string
  compact?: boolean
}

type SystemReadinessCardState = Pick<
  ReturnType<typeof useSystemReadiness>,
  'serviceQuery' | 'topicSnapshot' | 'effectiveReadiness' | 'topicMatchesTask'
>

interface ResolvedSystemReadinessCardProps
  extends Omit<SystemReadinessCardProps, 'snapshot'> {
  readinessState: SystemReadinessCardState
}

export function SystemReadinessCard({
  snapshot,
  taskId,
  selectedTask = null,
  title = '任务启动前 readiness',
  compact = false,
}: SystemReadinessCardProps) {
  const readinessState = useSystemReadiness(taskId, snapshot)

  return (
    <SystemReadinessCardBody
      taskId={taskId}
      selectedTask={selectedTask}
      title={title}
      compact={compact}
      readinessState={readinessState}
    />
  )
}

export function ResolvedSystemReadinessCard({
  taskId,
  selectedTask = null,
  title = '任务启动前 readiness',
  compact = false,
  readinessState,
}: ResolvedSystemReadinessCardProps) {
  return (
    <SystemReadinessCardBody
      taskId={taskId}
      selectedTask={selectedTask}
      title={title}
      compact={compact}
      readinessState={readinessState}
    />
  )
}

function SystemReadinessCardBody({
  taskId,
  selectedTask = null,
  title = '任务启动前 readiness',
  compact = false,
  readinessState,
}: Omit<SystemReadinessCardProps, 'snapshot'> & {
  readinessState: SystemReadinessCardState
}) {
  const { serviceQuery, topicSnapshot, effectiveReadiness, topicMatchesTask } =
    readinessState

  const topicPresentation = getTopicHealthPresentation(topicSnapshot.health)
  const isSystemOnlyScope = taskId <= 0 && !selectedTask
  const selectedTaskLabel = selectedTask
    ? `${selectedTask.name} / #${selectedTask.id}`
    : taskId > 0
      ? `task_id=${taskId}`
      : '系统基线 (task_id=0)'
  const topicScopeLabel = topicSnapshot.readiness
    ? topicSnapshot.readiness.taskId > 0
      ? `task_id=${topicSnapshot.readiness.taskId}`
      : '系统基线 (task_id=0)'
    : '--'
  const lastUpdatedValue =
    topicMatchesTask && topicSnapshot.readiness
      ? topicSnapshot.readiness.stampMs
      : effectiveReadiness?.stampMs ?? topicSnapshot.lastMessageAt
  const blockingReasonText = effectiveReadiness
    ? formatDiagnosticMessages(effectiveReadiness.blockingReasons)
    : []
  const warningText = effectiveReadiness
    ? formatDiagnosticMessages(effectiveReadiness.warnings)
    : []
  const blockingChecks = effectiveReadiness?.checks.filter(isBlockingReadinessCheck) ?? []
  const nonBlockingWarningChecks =
    effectiveReadiness?.checks.filter(isNonBlockingWarningCheck) ?? []

  return (
    <Card
      title={title}
      className="readiness-card"
      extra={
        <Space size="small" wrap>
          <Tag color={topicPresentation.color}>{topicPresentation.label}</Tag>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={serviceQuery.isFetching}
            onClick={() => void serviceQuery.refetch()}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {!compact ? (
          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="检查对象">{selectedTaskLabel}</Descriptions.Item>
            <Descriptions.Item label="主题消息数">{topicSnapshot.messageCount}</Descriptions.Item>
            <Descriptions.Item label="服务调用">
              {getServiceStatusLabel({
                isLoading: serviceQuery.isLoading,
                dataSuccess: serviceQuery.data ? serviceQuery.data.success : null,
                hasError: serviceQuery.error instanceof Error,
              })}
            </Descriptions.Item>
            <Descriptions.Item label="主题状态">{topicPresentation.label}</Descriptions.Item>
            <Descriptions.Item label="运行态范围">{topicScopeLabel}</Descriptions.Item>
            <Descriptions.Item label="最后更新时间">
              {formatTimestamp(lastUpdatedValue)}
            </Descriptions.Item>
          </Descriptions>
        ) : null}

        {serviceQuery.error instanceof Error ? (
          <AppFeedbackBanner
            tone="warning"
            title="readiness 服务调用失败"
            description={serviceQuery.error.message}
          />
        ) : null}

        {serviceQuery.data && !serviceQuery.data.success ? (
          <AppFeedbackBanner
            tone="warning"
            title="readiness 服务返回失败"
            description={serviceQuery.data.message || '后端没有返回额外说明。'}
          />
        ) : null}

        {!compact && topicSnapshot.health === 'disconnected' ? (
          <AppFeedbackBanner
            tone="error"
            title="ROS 已断开"
            description="请先恢复站点网关 ROS 会话，再查看实时 readiness 和执行前检查。"
          />
        ) : null}

        {!compact && topicSnapshot.health === 'waiting' ? (
          <AppFeedbackBanner
            tone="info"
            title="等待实时 readiness 首帧"
            description="站点网关正在等待 /coverage_task_manager/system_readiness 的第一条消息。"
          />
        ) : null}

        {!compact && topicSnapshot.health === 'unavailable' ? (
          <AppFeedbackBanner
            tone="info"
            title="实时 readiness 主题暂未发布"
            description={
              topicSnapshot.metaError ||
              '当前没有发现 system_readiness 的活跃发布者，页面会先回退显示服务查询结果。'
            }
          />
        ) : null}

        {!compact && topicSnapshot.health === 'stale' ? (
          <AppFeedbackBanner
            tone="warning"
            title="实时 readiness 已延迟"
            description="最近一帧 readiness 超出了预期刷新周期，请结合 checks、里程计和定位状态一起判断。"
          />
        ) : null}

        {!compact && topicSnapshot.readiness && !topicMatchesTask && taskId > 0 ? (
          <AppFeedbackBanner
            tone="info"
            title="实时 readiness 属于其他任务"
            description={`当前 topic 正在发布 task_id=${topicSnapshot.readiness.taskId}，所以本卡片继续保留 task_id=${taskId} 的服务结果。`}
          />
        ) : null}

        {effectiveReadiness ? (
          <>
            <Descriptions column={compact ? 1 : 2} size="small" colon={false}>
              {compact ? (
                <>
                  <Descriptions.Item label="检查对象">{selectedTaskLabel}</Descriptions.Item>
                  <Descriptions.Item label="允许启动">
                    {isSystemOnlyScope ? (
                      <Tag color="blue">N/A</Tag>
                    ) : (
                      getBooleanTag(effectiveReadiness.canStartTask, '允许', '阻断')
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="阻断项">
                    <Tag color={blockingChecks.length > 0 ? 'red' : 'green'}>
                      {blockingChecks.length}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="任务管理状态">
                    {effectiveReadiness.missionState || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="执行器状态">
                    {effectiveReadiness.executorState || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="电量">
                    {formatPercent(effectiveReadiness.batterySoc)}
                  </Descriptions.Item>
                  <Descriptions.Item label="检查时间">
                    {formatTimestamp(lastUpdatedValue)}
                  </Descriptions.Item>
                </>
              ) : (
                <>
                  <Descriptions.Item label="总体就绪">
                    {getBooleanTag(effectiveReadiness.overallReady, '就绪', '未就绪')}
                  </Descriptions.Item>
                  <Descriptions.Item label="允许启动">
                    {isSystemOnlyScope ? (
                      <Tag color="blue">N/A</Tag>
                    ) : (
                      getBooleanTag(effectiveReadiness.canStartTask, '允许', '阻断')
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="阻断项">
                    <Tag color={blockingChecks.length > 0 ? 'red' : 'green'}>
                      {blockingChecks.length}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="非阻塞 warning">
                    <Tag
                      color={
                        nonBlockingWarningChecks.length > 0 || warningText.length > 0
                          ? 'orange'
                          : 'green'
                      }
                    >
                      {nonBlockingWarningChecks.length + warningText.length}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="任务名称">
                    {effectiveReadiness.taskName || selectedTask?.name || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="任务地图">
                    {effectiveReadiness.taskMapName || selectedTask?.mapName || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="任务区域">
                    {effectiveReadiness.taskZoneId || selectedTask?.zoneId || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="规划模板">
                    {effectiveReadiness.taskPlanProfile || selectedTask?.planProfileName || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="当前激活地图">
                    {effectiveReadiness.activeMapName || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="运行时地图">
                    {effectiveReadiness.runtimeMapName || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="任务管理状态">
                    {effectiveReadiness.missionState || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="执行器状态">
                    {effectiveReadiness.executorState || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="阶段">{effectiveReadiness.phase || '--'}</Descriptions.Item>
                  <Descriptions.Item label="对外状态">
                    {effectiveReadiness.publicState || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="补给/回桩状态">
                    {effectiveReadiness.dockSupplyState || '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="电量">
                    {formatPercent(effectiveReadiness.batterySoc)}
                  </Descriptions.Item>
                  <Descriptions.Item label="电池数据有效">
                    {effectiveReadiness.batteryValid === null
                      ? '--'
                      : effectiveReadiness.batteryValid
                        ? '有效'
                        : '无效'}
                  </Descriptions.Item>
                  <Descriptions.Item label="检查时间">
                    {formatTimestamp(effectiveReadiness.stampMs)}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>

            {!compact && isSystemOnlyScope ? (
              <AppFeedbackBanner
                tone="info"
                title="当前只是在看系统基线"
                description="这份结果只反映地图、定位、执行器等站点级基线状态，还不能代表某个具体任务一定允许 START。请选择任务后再做正式启动检查。"
              />
            ) : !compact && !effectiveReadiness.canStartTask ? (
              <AppFeedbackBanner
                tone="error"
                title="存在阻断启动的问题"
                description={
                  blockingReasonText.length > 0
                    ? blockingReasonText.join(' | ')
                    : '后端返回 can_start_task=false，但没有附带更详细的阻断原因。'
                }
              />
            ) : !compact ? (
              <AppFeedbackBanner
                tone="success"
                title="当前任务已通过启动前检查"
                description="当前 can_start_task=true。真正点击 START 时，前端仍会再主动刷新一次 readiness，并显示执行服务的原始返回。"
              />
            ) : null}

            {!compact && warningText.length > 0 ? (
              <AppFeedbackBanner
                tone="warning"
                title="非阻塞 warning"
                description={`这些 warning 不会单独阻断 START，但会影响现场态感知：${warningText.join(' | ')}`}
              />
            ) : null}

            <Card
              size="small"
              className="readiness-inner-card"
              title={
                <Space>
                  <SafetyCertificateOutlined />
                  <span>检查项详情</span>
                </Space>
              }
            >
              {effectiveReadiness.checks.length > 0 ? (
                <div className="readiness-check-list">
                  {effectiveReadiness.checks.map((check, index) => (
                    <div
                      key={`${check.key || 'check'}-${index}`}
                      className="readiness-check-row"
                    >
                      <div className="readiness-check-main">
                        <Typography.Text strong>{getCheckTitle(check.key)}</Typography.Text>
                        {shouldShowRawKey(check.key) ? (
                          <Typography.Text type="secondary">原始键：{check.key}</Typography.Text>
                        ) : null}
                        <Typography.Text type="secondary">
                          {formatCheckSummary(check)}
                        </Typography.Text>
                      </div>
                      <div className="readiness-check-side">
                        <CheckBadges check={check} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <AppEmptyState description="后端本次没有返回 checks[] 详情。" />
              )}
            </Card>
          </>
        ) : (
          <AppEmptyState description="当前还没有拿到 readiness 快照。" />
        )}

        {!compact && serviceQuery.data?.message ? (
          <Typography.Paragraph className="readiness-footnote">
            服务原始消息：{serviceQuery.data.message}
          </Typography.Paragraph>
        ) : null}
      </Space>
    </Card>
  )
}
