import { Card, Descriptions, Tag, Typography } from 'antd'

import { useExecutionSessionStore } from '../../stores/executionSessionStore'
import { useRuntimeMonitorStore } from '../../stores/runtimeMonitorStore'
import type { TaskEntity } from '../../types/task'
import './LiveCommandContextCard.css'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStringTopicValue(value: unknown) {
  return isRecord(value) && typeof value.data === 'string' ? value.data : '--'
}

function formatNumber(value: unknown, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '--'
}

function getResultTagColor(success: boolean | null) {
  if (success === null) {
    return 'default'
  }

  return success ? 'green' : 'orange'
}

interface LiveCommandContextCardProps {
  title?: string
  selectedTask?: TaskEntity | null
}

export function LiveCommandContextCard({
  title = '实时执行上下文',
  selectedTask = null,
}: LiveCommandContextCardProps) {
  const focusedTaskId = useExecutionSessionStore((state) => state.focusedTaskId)
  const focusedTaskName = useExecutionSessionStore((state) => state.focusedTaskName)
  const lastResult = useExecutionSessionStore((state) => state.lastResult)
  const transportError = useExecutionSessionStore((state) => state.transportError)
  const topicMap = useRuntimeMonitorStore((state) => state.topicMap)

  const runProgress = isRecord(topicMap.runProgress.rawMessage)
    ? topicMap.runProgress.rawMessage
    : null
  const currentTaskLabel = selectedTask
    ? `${selectedTask.id} · ${selectedTask.name}`
    : focusedTaskId !== null && focusedTaskName
      ? `${focusedTaskId} · ${focusedTaskName}`
      : focusedTaskId !== null
        ? String(focusedTaskId)
        : '--'

  return (
    <Card title={title} className="live-command-context-card">
      <Descriptions column={1} size="small" colon={false}>
        <Descriptions.Item label="聚焦任务 ID">
          <Typography.Text data-testid="shared-focused-task-id">
            {focusedTaskId ?? '--'}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="当前页任务">
          <Typography.Text data-testid="shared-current-page-task">
            {currentTaskLabel}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="最近命令">
          <Typography.Text data-testid="shared-latest-command">
            {lastResult?.command ?? '--'}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="最近结果">
          <Tag
            color={getResultTagColor(lastResult ? lastResult.success : null)}
            data-testid="shared-latest-result"
          >
            {lastResult ? (lastResult.success ? '成功' : '失败') : '空闲'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="后端回执">
          <Typography.Text data-testid="shared-latest-command-message">
            {transportError || lastResult?.message || '--'}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="任务管理器状态">
          <Typography.Text data-testid="shared-task-manager-state">
            {getStringTopicValue(topicMap.taskState.rawMessage)}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="执行器状态">
          <Typography.Text data-testid="shared-executor-state">
            {getStringTopicValue(topicMap.executorState.rawMessage)}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="运行进度状态">
          <Typography.Text data-testid="shared-run-progress-state">
            {runProgress && typeof runProgress.state === 'string'
              ? runProgress.state
              : '--'}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="运行进度百分比">
          {runProgress ? formatNumber(runProgress.progress_pct, 1) : '--'}
        </Descriptions.Item>
        <Descriptions.Item label="运行进度消息数">
          <Typography.Text data-testid="shared-run-progress-count">
            {topicMap.runProgress.messageCount}
          </Typography.Text>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
