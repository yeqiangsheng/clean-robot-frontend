import { Card, Descriptions } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type { SlamWorkflowState } from '../../types/slam-workflow'
import {
  formatBoolText,
  formatDateTime,
  formatPercent,
} from '../../utils/slam'

type SlamStateCardProps = {
  state: SlamWorkflowState | null
  stateError: string | null
}

export function SlamStateCard({
  state,
  stateError,
}: SlamStateCardProps) {
  const stateWarnings = state
    ? [
        state.lastErrorMessage || state.lastErrorCode,
        state.localizationValid === false ? '定位未就绪' : '',
        state.activeMapMatch === false ? '运行地图与活动地图不一致' : '',
        state.runtimeMapReady === false ? '运行地图未就绪' : '',
        ...state.blockingReasons,
      ].filter((item) => item.trim().length > 0)
    : []

  return (
    <Card title="关键状态" className="slam-card">
      {stateError ? (
        <AppFeedbackBanner
          tone="warning"
          title="状态读取失败"
          description={stateError}
          className="slam-inline-alert"
        />
      ) : null}

      {state ? (
        <>
          {stateWarnings.length > 0 ? (
            <AppFeedbackBanner
              tone={state.blockingReasons.length > 0 ? 'error' : 'warning'}
              title="状态需确认"
              description={stateWarnings.slice(0, 3).join(' | ')}
              className="slam-inline-alert"
            />
          ) : null}

          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="当前模式">{state.currentMode || '--'}</Descriptions.Item>
            <Descriptions.Item label="定位状态">{state.localizationState || '--'}</Descriptions.Item>
            <Descriptions.Item label="活动地图">{state.activeMapName || '--'}</Descriptions.Item>
            <Descriptions.Item label="运行地图">{state.runtimeMapName || '--'}</Descriptions.Item>
            <Descriptions.Item label="地图一致">{formatBoolText(state.activeMapMatch)}</Descriptions.Item>
            <Descriptions.Item label="运行地图就绪">
              {formatBoolText(state.runtimeMapReady)}
            </Descriptions.Item>
            <Descriptions.Item label="定位有效">{formatBoolText(state.localizationValid)}</Descriptions.Item>
            <Descriptions.Item label="任务管理状态">{state.missionState || '--'}</Descriptions.Item>
            <Descriptions.Item label="执行器状态">{state.executorState || '--'}</Descriptions.Item>
            <Descriptions.Item label="任务运行中">{formatBoolText(state.taskRunning)}</Descriptions.Item>
            <Descriptions.Item label="当前作业状态">{state.activeJobStatus || '--'}</Descriptions.Item>
            <Descriptions.Item label="当前作业进度">
              {formatPercent(state.activeJobProgress01)}
            </Descriptions.Item>
            <Descriptions.Item label="状态时间">{formatDateTime(state.stampMs)}</Descriptions.Item>
          </Descriptions>

          <div className="slam-enabled-actions">
            {[
              state.canSwitchMap ? '切换地图' : '',
              state.canRestartLocalization ? '重新定位' : '',
              state.canStartMapping ? '开始建图' : '',
              state.canSaveMapping ? '保存地图' : '',
              state.canStopMapping ? '停止建图' : '',
            ]
              .filter(Boolean)
              .join(' / ') || '暂无可用操作'}
          </div>
        </>
      ) : (
        <AppEmptyState
          title="等待 SLAM 状态"
          description=""
        />
      )}
    </Card>
  )
}
