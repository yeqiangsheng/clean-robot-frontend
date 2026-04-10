import { Alert, Card, Descriptions, Empty, Space, Tag, Typography } from 'antd'

import type {
  SlamWorkflowState,
  SlamWorkflowTopicSnapshot,
} from '../../types/slam-workflow'
import {
  formatAge,
  formatBoolText,
  formatDateTime,
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
      title="Current State"
      className="slam-card"
      extra={<Tag color={topicTag.color}>Topic {topicTag.label}</Tag>}
    >
      {stateError ? (
        <Alert
          showIcon
          type="warning"
          title="State service fallback failed"
          description={stateError}
          className="slam-inline-alert"
        />
      ) : null}

      {topicSnapshot.metaError ? (
        <Typography.Paragraph className="slam-footnote">
          Topic metadata: {topicSnapshot.metaError}
        </Typography.Paragraph>
      ) : null}

      {topicSnapshot.subscribeError ? (
        <Typography.Paragraph className="slam-footnote">
          Topic subscription: {topicSnapshot.subscribeError}
        </Typography.Paragraph>
      ) : null}

      {state ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="workflow_state">
              {state.workflowState}
            </Descriptions.Item>
            <Descriptions.Item label="workflow_phase">
              {state.workflowPhase || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="runtime_mode">
              {state.runtimeMode || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="runtime_map">
              {state.runtimeMapName || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="asset_active_map">
              {state.assetActiveMapName || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="map_match">
              {formatBoolText(state.runtimeMapMatch)}
            </Descriptions.Item>
            <Descriptions.Item label="localization_state">
              {state.localizationState || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="localization_valid">
              {formatBoolText(state.localizationValid)}
            </Descriptions.Item>
            <Descriptions.Item label="mapping_session_active">
              {formatBoolText(state.mappingSessionActive)}
            </Descriptions.Item>
            <Descriptions.Item label="task_ready">
              {formatBoolText(state.taskReady)}
            </Descriptions.Item>
            <Descriptions.Item label="manual_assist_required">
              {formatBoolText(state.manualAssistRequired)}
            </Descriptions.Item>
            <Descriptions.Item label="progress_text">
              {state.progressText || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="blocking_reason">
              {state.blockingReason || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="last_error_code">
              {state.lastErrorCode || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="last_error_message">
              {state.lastErrorMessage || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="updated_at">
              {formatDateTime(state.updatedTs)}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="topic_message_count">
              {topicSnapshot.messageCount}
            </Descriptions.Item>
            <Descriptions.Item label="topic_last_update">
              {formatDateTime(topicSnapshot.lastMessageAt)}
            </Descriptions.Item>
            <Descriptions.Item label="topic_age">
              {formatAge(topicSnapshot.ageMs)}
            </Descriptions.Item>
            <Descriptions.Item label="topic_type">
              {topicSnapshot.messageType || '--'}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="The SLAM state will appear here after rosbridge and the state service become available."
        />
      )}
    </Card>
  )
}
