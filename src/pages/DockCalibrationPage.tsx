import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Divider,
  InputNumber,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'

import { getDockCalibrationStatus, sendDockCalibrationCommand } from '../api/gateway/dockCalibrationGateway'
import { executeTaskCommand } from '../api/gateway/executionGateway'
import { ManualDriveControl } from '../components/execution/ManualDriveControl'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { getAppConfig } from '../config/appConfig'
import { useRosConnection } from '../hooks/useRosConnection'
import { useRuntimeMonitorStore } from '../stores/runtimeMonitorStore'
import {
  DOCK_CALIBRATION_OPERATIONS,
  type DockCalibrationOperation,
  type DockCalibrationState,
} from '../types/dockCalibration'
import type { RuntimeTopicSnapshot } from '../types/runtime'
import './DockCalibrationPage.css'

const STATUS_REFETCH_INTERVAL_MS = 1_000
const FIELD_SCORE_REFERENCE_LIMIT = 0.00012
const FIELD_SCORE_REFERENCE_TEXT =
  'score 小于 0.00012 时可视为识别质量初步达标；score 越小，梯形桩识别越稳定，但请不要距离充电桩过近，保持一米以上的直线距离。'
const DOCKING_STAGE_TOKENS = [
  'MANUAL_DOCKING_STAGE1',
  'MANUAL_DOCKING_STAGE2',
  'MANUAL_DOCKING_PRECISE',
] as const

interface PointDraft {
  x: number | null
  y: number | null
  yaw: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toDraftNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return null
}

function formatNumber(value: number | null, digits = 3) {
  return isFiniteNumber(value) ? value.toFixed(digits) : '--'
}

function formatScore(value: number | null) {
  return isFiniteNumber(value) ? value.toFixed(6) : '--'
}

function formatAngle(value: number | null) {
  if (!isFiniteNumber(value)) {
    return '--'
  }

  const degree = (value * 180) / Math.PI
  return `${value.toFixed(3)} rad / ${degree.toFixed(1)}°`
}

function formatBool(value: boolean) {
  return value ? '是' : '否'
}

function getPoseReady(state: DockCalibrationState | null) {
  return Boolean(state?.trackedPoseFresh && state.trackedPoseFrame === 'map')
}

function getScorePass(state: DockCalibrationState | null) {
  return Boolean(
    state?.dockScoreFresh &&
      isFiniteNumber(state.dockScore) &&
      state.dockScore < FIELD_SCORE_REFERENCE_LIMIT,
  )
}

function getScoreWarning(state: DockCalibrationState | null) {
  if (!state) {
    return '等待状态'
  }
  if (!state.dockScoreFresh) {
    return 'score 未刷新'
  }
  if (!isFiniteNumber(state.dockScore)) {
    return 'score 缺失'
  }
  if (state.dockScore >= FIELD_SCORE_REFERENCE_LIMIT) {
    return '未达现场指标'
  }
  return '初步达标'
}

function getTopicHealthLabel(topic: RuntimeTopicSnapshot) {
  switch (topic.health) {
    case 'live':
      return { color: 'green', text: '实时' }
    case 'stale':
      return { color: 'orange', text: '延迟' }
    case 'waiting':
      return { color: 'blue', text: '等待' }
    case 'unavailable':
      return { color: 'default', text: '未发布' }
    default:
      return { color: 'red', text: '离线' }
  }
}

function extractRuntimeText(topic: RuntimeTopicSnapshot) {
  const raw = topic.rawMessage

  if (!isRecord(raw)) {
    return '--'
  }

  const values = [
    raw.state,
    raw.mission_state,
    raw.phase,
    raw.public_state,
    raw.executor_state,
    raw.status,
    raw.data,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  if (values.length > 0) {
    return Array.from(new Set(values.map((value) => value.trim()))).join(' / ')
  }

  return JSON.stringify(raw).slice(0, 96)
}

function collectDockingStages(topics: RuntimeTopicSnapshot[]) {
  const text = topics
    .map((topic) => (topic.rawMessage ? JSON.stringify(topic.rawMessage).toUpperCase() : ''))
    .join(' ')

  return DOCKING_STAGE_TOKENS.filter((token) => text.includes(token))
}

function PointReadout({
  x,
  y,
  yaw,
}: {
  x: number | null
  y: number | null
  yaw: number | null
}) {
  return (
    <div className="dock-calibration-pose-grid">
      <div>
        <span>x</span>
        <strong>{formatNumber(x)} m</strong>
      </div>
      <div>
        <span>y</span>
        <strong>{formatNumber(y)} m</strong>
      </div>
      <div>
        <span>yaw</span>
        <strong>{formatAngle(yaw)}</strong>
      </div>
    </div>
  )
}

function PointDraftEditor({
  title,
  draft,
  disabled,
  loading,
  onChange,
  onSubmit,
}: {
  title: string
  draft: PointDraft
  disabled: boolean
  loading: boolean
  onChange: (draft: PointDraft) => void
  onSubmit: () => void
}) {
  const canSubmit =
    isFiniteNumber(draft.x) && isFiniteNumber(draft.y) && isFiniteNumber(draft.yaw)

  return (
    <div className="dock-calibration-manual-point">
      <Typography.Text strong>{title}</Typography.Text>
      <div className="dock-calibration-manual-grid">
        <InputNumber
          aria-label={`${title} x`}
          placeholder="x"
          precision={3}
          step={0.01}
          value={draft.x}
          onChange={(value) => onChange({ ...draft, x: toDraftNumber(value) })}
        />
        <InputNumber
          aria-label={`${title} y`}
          placeholder="y"
          precision={3}
          step={0.01}
          value={draft.y}
          onChange={(value) => onChange({ ...draft, y: toDraftNumber(value) })}
        />
        <InputNumber
          aria-label={`${title} yaw`}
          placeholder="yaw rad"
          precision={4}
          step={0.01}
          value={draft.yaw}
          onChange={(value) => onChange({ ...draft, yaw: toDraftNumber(value) })}
        />
        <Button
          type="primary"
          disabled={disabled || !canSubmit}
          loading={loading}
          onClick={onSubmit}
        >
          写入
        </Button>
      </div>
    </div>
  )
}

function StageCard({
  title,
  set,
  x,
  y,
  yaw,
  saveDisabled,
  saveLoading,
  onSave,
  children,
}: {
  title: string
  set: boolean
  x: number | null
  y: number | null
  yaw: number | null
  saveDisabled: boolean
  saveLoading: boolean
  onSave: () => void
  children?: ReactNode
}) {
  return (
    <Card
      className="dock-calibration-card"
      title={
        <span className="dock-calibration-card-title">
          {title}
          <Tag color={set ? 'green' : 'default'}>{set ? '已保存' : '未保存'}</Tag>
        </span>
      }
      extra={
        <Button
          type="primary"
          icon={<SaveOutlined />}
          disabled={saveDisabled}
          loading={saveLoading}
          onClick={onSave}
        >
          保存当前位姿
        </Button>
      }
    >
      <PointReadout x={x} y={y} yaw={yaw} />
      {children}
    </Card>
  )
}

function RuntimeStatusPanel() {
  const topicMap = useRuntimeMonitorStore((state) => state.topicMap)
  const topics = [topicMap.taskState, topicMap.executorState, topicMap.runProgress]
  const activeStages = collectDockingStages(topics)

  return (
    <Card className="dock-calibration-card" title="回桩验证状态">
      <div className="dock-calibration-stage-tags">
        {DOCKING_STAGE_TOKENS.map((stage) => (
          <Tag key={stage} color={activeStages.includes(stage) ? 'green' : 'default'}>
            {stage}
          </Tag>
        ))}
      </div>
      <Descriptions column={1} size="small" colon={false}>
        {topics.map((topic) => {
          const health = getTopicHealthLabel(topic)
          return (
            <Descriptions.Item key={topic.key} label={topic.label}>
              <Space size="small" wrap>
                <Tag color={health.color}>{health.text}</Tag>
                <Typography.Text>{extractRuntimeText(topic)}</Typography.Text>
              </Space>
            </Descriptions.Item>
          )
        })}
      </Descriptions>
    </Card>
  )
}

interface DockCalibrationPageProps {
  isActive?: boolean
}

export function DockCalibrationPage({ isActive = true }: DockCalibrationPageProps) {
  const { snapshot } = useRosConnection()
  const robotId = getAppConfig().robotId
  const [activeOperation, setActiveOperation] = useState<DockCalibrationOperation | null>(null)
  const [dockVerifyRunning, setDockVerifyRunning] = useState(false)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [requireStage2Quality, setRequireStage2Quality] = useState(false)
  const [stage1Draft, setStage1Draft] = useState<PointDraft>({ x: null, y: null, yaw: null })
  const [stage2Draft, setStage2Draft] = useState<PointDraft>({ x: null, y: null, yaw: null })

  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'
  const statusQuery = useQuery({
    queryKey: ['dock-calibration', 'status', snapshot.sessionId, robotId],
    queryFn: () => getDockCalibrationStatus(robotId),
    enabled: isActive && servicesReady,
    retry: 1,
    refetchInterval: isActive && servicesReady ? STATUS_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
  })

  const state = statusQuery.data?.state ?? null
  const poseReady = getPoseReady(state)
  const saveDisabled = !servicesReady || !poseReady || activeOperation !== null
  const scorePass = getScorePass(state)
  const scoreWarning = getScoreWarning(state)
  const poseStatusTone = poseReady ? 'success' : 'warning'
  const poseStatusLabel = poseReady ? '可保存' : '禁止保存'
  const scoreStatusClassName = scorePass
    ? 'dock-calibration-score-card is-pass'
    : 'dock-calibration-score-card is-warning'

  const saveDisabledReason = useMemo(() => {
    if (!servicesReady) {
      return 'ROS 未连接'
    }
    if (!state) {
      return '等待状态'
    }
    if (!state.trackedPoseFresh) {
      return '当前地图位姿未刷新'
    }
    if (state.trackedPoseFrame !== 'map') {
      return `当前 frame=${state.trackedPoseFrame || '--'}`
    }
    return ''
  }, [servicesReady, state])

  const runCommand = async (
    operation: DockCalibrationOperation,
    payload: Partial<PointDraft> = {},
  ) => {
    setActiveOperation(operation)
    setCommandError(null)

    try {
      const result = await sendDockCalibrationCommand({
        operation,
        robotId,
        requireStage2Quality:
          operation === DOCK_CALIBRATION_OPERATIONS.SAVE_STAGE2
            ? requireStage2Quality
            : false,
        x: payload.x ?? undefined,
        y: payload.y ?? undefined,
        yaw: payload.yaw ?? undefined,
      })

      if (!result.success) {
        const warning = result.message || '后端返回 success=false'
        setCommandError(warning)
        message.warning(warning)
      } else {
        message.success(result.message || '标定命令已完成')
      }

      await statusQuery.refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '标定命令下发失败'
      setCommandError(errorMessage)
      message.error(errorMessage)
    } finally {
      setActiveOperation(null)
    }
  }

  const runDockVerification = async () => {
    setDockVerifyRunning(true)
    setCommandError(null)

    try {
      const result = await executeTaskCommand('RETURN', 0)
      if (!result.success) {
        const warning = result.message || '回桩验证命令未被接受'
        setCommandError(warning)
        message.warning(warning)
      } else {
        message.success(result.message || '回桩验证已开始')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '回桩验证命令下发失败'
      setCommandError(errorMessage)
      message.error(errorMessage)
    } finally {
      setDockVerifyRunning(false)
    }
  }

  return (
    <div className="dock-calibration-page">
      <header className="dock-calibration-header">
        <div>
          <Typography.Title level={2}>充电桩标定</Typography.Title>
        </div>
        <Space wrap>
          <ManualDriveControl />
          <Button
            icon={<ReloadOutlined />}
            loading={activeOperation === DOCK_CALIBRATION_OPERATIONS.RELOAD}
            disabled={!servicesReady || activeOperation !== null}
            onClick={() => void runCommand(DOCK_CALIBRATION_OPERATIONS.RELOAD)}
          >
            重新加载
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={dockVerifyRunning}
            disabled={!servicesReady || dockVerifyRunning}
            onClick={() => void runDockVerification()}
          >
            开始回桩验证
          </Button>
        </Space>
      </header>

      {statusQuery.error instanceof Error ? (
        <AppFeedbackBanner
          tone="warning"
          title="标定状态加载失败"
          description={statusQuery.error.message}
          actionLabel="重试"
          onAction={() => void statusQuery.refetch()}
          className="dock-calibration-banner"
        />
      ) : null}

      {commandError ? (
        <AppFeedbackBanner
          tone="error"
          title="标定命令异常"
          description={commandError}
          className="dock-calibration-banner"
        />
      ) : null}

      <Card className="dock-calibration-card dock-calibration-pose-card">
        <div className="dock-calibration-pose-header">
          <Space size="small" wrap>
            <Tag color={poseStatusTone}>{poseStatusLabel}</Tag>
            <Tag color={state?.trackedPoseFresh ? 'green' : 'orange'}>
              tracked_pose_fresh={formatBool(Boolean(state?.trackedPoseFresh))}
            </Tag>
            <Tag color={state?.trackedPoseFrame === 'map' ? 'green' : 'orange'}>
              frame={state?.trackedPoseFrame || '--'}
            </Tag>
          </Space>
          {saveDisabledReason ? (
            <Typography.Text type="warning">{saveDisabledReason}</Typography.Text>
          ) : null}
        </div>
        <PointReadout
          x={state?.currentX ?? null}
          y={state?.currentY ?? null}
          yaw={state?.currentYaw ?? null}
        />
        <div className="dock-calibration-storage-path">
          <span>storage_path</span>
          <strong>{state?.storagePath || '--'}</strong>
        </div>
      </Card>

      <div className="dock-calibration-stage-grid">
        <StageCard
          title="第一预对接点"
          set={Boolean(state?.stage1Set)}
          x={state?.stage1X ?? null}
          y={state?.stage1Y ?? null}
          yaw={state?.stage1Yaw ?? null}
          saveDisabled={saveDisabled}
          saveLoading={activeOperation === DOCK_CALIBRATION_OPERATIONS.SAVE_STAGE1}
          onSave={() => void runCommand(DOCK_CALIBRATION_OPERATIONS.SAVE_STAGE1)}
        />

        <StageCard
          title="第二预对接点"
          set={Boolean(state?.stage2Set)}
          x={state?.stage2X ?? null}
          y={state?.stage2Y ?? null}
          yaw={state?.stage2Yaw ?? null}
          saveDisabled={saveDisabled}
          saveLoading={activeOperation === DOCK_CALIBRATION_OPERATIONS.SAVE_STAGE2}
          onSave={() => void runCommand(DOCK_CALIBRATION_OPERATIONS.SAVE_STAGE2)}
        >
          <Divider />
          <div className={scoreStatusClassName}>
            <div>
              <Typography.Text strong>梯形桩识别 score</Typography.Text>
              <Typography.Title level={3}>
                {formatScore(state?.dockScore ?? null)}
              </Typography.Title>
            </div>
            <Tag color={scorePass ? 'green' : 'orange'} icon={scorePass ? <CheckCircleOutlined /> : <WarningOutlined />}>
              {scoreWarning}
            </Tag>
          </div>
          <div className="dock-calibration-score-reference">
            <Typography.Text>{FIELD_SCORE_REFERENCE_TEXT}</Typography.Text>
          </div>
          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="现场参考上限">
              {formatScore(FIELD_SCORE_REFERENCE_LIMIT)}
            </Descriptions.Item>
            <Descriptions.Item label="后端阈值">
              {formatScore(state?.dockScoreThreshold ?? null)}
            </Descriptions.Item>
            <Descriptions.Item label="越小越好">
              {formatBool(state?.dockScoreLowerIsBetter ?? true)}
            </Descriptions.Item>
            <Descriptions.Item label="/dock_pose fresh">
              {formatBool(Boolean(state?.dockPoseFresh))}
            </Descriptions.Item>
            <Descriptions.Item label="推荐保存第二点">
              <Tag color={state?.stage2SaveRecommended ? 'green' : 'orange'}>
                {formatBool(Boolean(state?.stage2SaveRecommended))}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="位姿质量">
              <Tag color={state?.dockPoseQualityOk ? 'green' : 'orange'}>
                {formatBool(Boolean(state?.dockPoseQualityOk))}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="后端强制校验">
              <Switch
                checked={requireStage2Quality}
                checkedChildren="开"
                unCheckedChildren="关"
                onChange={setRequireStage2Quality}
              />
            </Descriptions.Item>
          </Descriptions>
          <PointReadout
            x={state?.dockPoseX ?? null}
            y={state?.dockPoseY ?? null}
            yaw={state?.dockPoseYaw ?? null}
          />
          <div className="dock-calibration-warning-list">
            {(state?.warnings.length ?? 0) > 0 ? (
              state?.warnings.map((warning, index) => (
                <Alert key={`${warning}-${index}`} type="warning" showIcon title={warning} />
              ))
            ) : (
              <Alert type="success" showIcon title="暂无 warnings" />
            )}
          </div>
        </StageCard>
      </div>

      <Collapse
        className="dock-calibration-advanced"
        items={[
          {
            key: 'manual',
            label: '高级手动写入',
            children: (
              <div className="dock-calibration-manual-panel">
                <PointDraftEditor
                  title="第一预对接点"
                  draft={stage1Draft}
                  disabled={!servicesReady || activeOperation !== null}
                  loading={activeOperation === DOCK_CALIBRATION_OPERATIONS.SET_STAGE1}
                  onChange={setStage1Draft}
                  onSubmit={() =>
                    void runCommand(DOCK_CALIBRATION_OPERATIONS.SET_STAGE1, stage1Draft)
                  }
                />
                <PointDraftEditor
                  title="第二预对接点"
                  draft={stage2Draft}
                  disabled={!servicesReady || activeOperation !== null}
                  loading={activeOperation === DOCK_CALIBRATION_OPERATIONS.SET_STAGE2}
                  onChange={setStage2Draft}
                  onSubmit={() =>
                    void runCommand(DOCK_CALIBRATION_OPERATIONS.SET_STAGE2, stage2Draft)
                  }
                />
              </div>
            ),
          },
        ]}
      />

      <RuntimeStatusPanel />
    </div>
  )
}
