import { Card, Descriptions, Space, Tag } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type {
  SlamWorkflowState,
  SlamWorkflowTopicSnapshot,
} from '../../types/slam-workflow'
import {
  formatAge,
  formatBoolText,
  formatDateTime,
  formatPercent,
  getTopicHealthPresentation,
} from '../../utils/slam'

type SlamStateCardProps = {
  state: SlamWorkflowState | null
  topicSnapshot: SlamWorkflowTopicSnapshot
  stateError: string | null
}

export function SlamStateCard({
  state,
  topicSnapshot,
  stateError,
}: SlamStateCardProps) {
  const topicTag = getTopicHealthPresentation(topicSnapshot.health)

  return (
    <Card
      title="SLAM 运行状态"
      className="slam-card"
      extra={<Tag color={topicTag.color}>状态 topic {topicTag.label}</Tag>}
    >
      {stateError ? (
        <AppFeedbackBanner
          tone="warning"
          title="SLAM 状态服务读取失败"
          description={stateError}
          className="slam-inline-alert"
        />
      ) : null}

      {topicSnapshot.metaError ? (
        <AppFeedbackBanner
          tone="info"
          title="状态 topic 元数据异常"
          description={topicSnapshot.metaError}
          className="slam-inline-alert"
        />
      ) : null}

      {topicSnapshot.subscribeError ? (
        <AppFeedbackBanner
          tone="warning"
          title="状态 topic 订阅异常"
          description={topicSnapshot.subscribeError}
          className="slam-inline-alert"
        />
      ) : null}

      {state ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {state.lastErrorCode || state.lastErrorMessage ? (
            <AppFeedbackBanner
              tone={state.canRestartLocalization ? 'warning' : 'error'}
              title={state.lastErrorCode || 'SLAM 状态提示'}
              description={state.lastErrorMessage || '后端没有附带额外错误说明。'}
            />
          ) : null}

          {state.localizationValid === false ? (
            <AppFeedbackBanner
              tone="warning"
              title="定位未就绪"
              description={
                state.localizationState
                  ? `当前定位状态为 ${state.localizationState}。`
                  : '当前定位状态无效，请先恢复定位后再继续高风险操作。'
              }
            />
          ) : null}

          {state.activeMapMatch === false ? (
            <AppFeedbackBanner
              tone="warning"
              title="运行时地图与活动地图不一致"
              description="当前 runtime map 与 active map 不匹配，任务启动和部分 SLAM 操作可能会被门禁阻断。"
            />
          ) : null}

          {state.runtimeMapReady === false ? (
            <AppFeedbackBanner
              tone="warning"
              title="运行时地图未就绪"
              description="当前运行时地图还没有准备好，请先等待地图状态恢复后再继续操作。"
            />
          ) : null}

          {state.blockingReasons.length > 0 ? (
            <AppFeedbackBanner
              tone="error"
              title="当前存在阻断原因"
              description={state.blockingReasons.join(' | ')}
            />
          ) : null}

          {state.warnings.length > 0 ? (
            <AppFeedbackBanner
              tone="warning"
              title="后端告警"
              description={state.warnings.join(' | ')}
            />
          ) : null}

          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="目标模式">{state.desiredMode || '--'}</Descriptions.Item>
            <Descriptions.Item label="当前模式">{state.currentMode || '--'}</Descriptions.Item>
            <Descriptions.Item label="活动地图">{state.activeMapName || '--'}</Descriptions.Item>
            <Descriptions.Item label="运行时地图">{state.runtimeMapName || '--'}</Descriptions.Item>
            <Descriptions.Item label="地图一致">{formatBoolText(state.activeMapMatch)}</Descriptions.Item>
            <Descriptions.Item label="运行时地图就绪">
              {formatBoolText(state.runtimeMapReady)}
            </Descriptions.Item>
            <Descriptions.Item label="定位状态">{state.localizationState || '--'}</Descriptions.Item>
            <Descriptions.Item label="定位有效">{formatBoolText(state.localizationValid)}</Descriptions.Item>
            <Descriptions.Item label="任务管理状态">{state.missionState || '--'}</Descriptions.Item>
            <Descriptions.Item label="执行器状态">{state.executorState || '--'}</Descriptions.Item>
            <Descriptions.Item label="任务运行中">{formatBoolText(state.taskRunning)}</Descriptions.Item>
            <Descriptions.Item label="生命周期状态">{state.lifecycleState || '--'}</Descriptions.Item>
            <Descriptions.Item label="当前作业状态">{state.activeJobStatus || '--'}</Descriptions.Item>
            <Descriptions.Item label="当前作业进度">
              {formatPercent(state.activeJobProgress01)}
            </Descriptions.Item>
            <Descriptions.Item label="地图 topic 新鲜">
              {formatBoolText(state.mapTopicFresh)}
            </Descriptions.Item>
            <Descriptions.Item label="地图延迟">
              {state.mapAgeS === null ? '--' : `${state.mapAgeS.toFixed(state.mapAgeS >= 10 ? 0 : 1)} s`}
            </Descriptions.Item>
            <Descriptions.Item label="位姿 topic 新鲜">
              {formatBoolText(state.trackedPoseFresh)}
            </Descriptions.Item>
            <Descriptions.Item label="位姿延迟">
              {state.trackedPoseAgeS === null
                ? '--'
                : `${state.trackedPoseAgeS.toFixed(state.trackedPoseAgeS >= 10 ? 0 : 1)} s`}
            </Descriptions.Item>
            <Descriptions.Item label="状态时间">{formatDateTime(state.stampMs)}</Descriptions.Item>
          </Descriptions>

          <Card size="small" className="readiness-inner-card" title="按钮门禁">
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="允许切换地图">
                {formatBoolText(state.canSwitchMap)}
              </Descriptions.Item>
              <Descriptions.Item label="允许重定位">
                {formatBoolText(state.canRestartLocalization)}
              </Descriptions.Item>
              <Descriptions.Item label="允许开始建图">
                {formatBoolText(state.canStartMapping)}
              </Descriptions.Item>
              <Descriptions.Item label="允许保存地图">
                {formatBoolText(state.canSaveMapping)}
              </Descriptions.Item>
              <Descriptions.Item label="允许停止建图">
                {formatBoolText(state.canStopMapping)}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="状态 topic 消息数">
              {topicSnapshot.messageCount}
            </Descriptions.Item>
            <Descriptions.Item label="状态 topic 最近更新时间">
              {formatDateTime(topicSnapshot.lastMessageAt)}
            </Descriptions.Item>
            <Descriptions.Item label="状态 topic 延迟">
              {formatAge(topicSnapshot.ageMs)}
            </Descriptions.Item>
            <Descriptions.Item label="状态 topic 类型">
              {topicSnapshot.messageType || '--'}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      ) : (
        <AppEmptyState
          title="当前还没有拿到 SLAM 状态快照"
          description="状态服务和 topic 返回后，这里会展示当前模式、地图、定位与按钮门禁。"
        />
      )}
    </Card>
  )
}
