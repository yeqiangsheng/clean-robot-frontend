import { useState } from 'react'

import { Button, Card, Descriptions, Drawer, Space, Tag, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type { OdometryState, OdometryTopicSnapshot } from '../../types/odometry'
import './OdometryHealthCard.css'

function formatAge(value: number | null) {
  if (value === null) {
    return '--'
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} s`
}

function formatTimestamp(value: number | null) {
  if (value === null) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function renderBoolTag(
  value: boolean | null,
  trueLabel: string,
  falseLabel: string,
  nullLabel = '--',
) {
  if (value === null) {
    return <Tag>{nullLabel}</Tag>
  }

  return <Tag color={value ? 'green' : 'red'}>{value ? trueLabel : falseLabel}</Tag>
}

function getHealthTag(state: OdometryState | null) {
  if (!state) {
    return <Tag>待获取</Tag>
  }

  if (state.odomValid && state.connected && state.odomFresh) {
    return <Tag color="green">健康</Tag>
  }

  if (state.connected === false || state.odomFresh === false || state.odomValid === false) {
    return <Tag color="red">异常</Tag>
  }

  return <Tag color="orange">降级</Tag>
}

function getTopicTag(health: OdometryTopicSnapshot['health']) {
  switch (health) {
    case 'live':
      return <Tag color="green">Topic 实时</Tag>
    case 'stale':
      return <Tag color="orange">Topic 延迟</Tag>
    case 'waiting':
      return <Tag color="blue">等待首帧</Tag>
    case 'unavailable':
      return <Tag>Topic 暂无发布</Tag>
    default:
      return <Tag color="red">ROS 已断开</Tag>
  }
}

function getTopicStateAlert(topicSnapshot: OdometryTopicSnapshot) {
  if (topicSnapshot.health === 'disconnected') {
    return {
      tone: 'error' as const,
      title: 'ROS 已断开',
      description:
        '站点网关当前无法继续接收里程计实时状态，请先恢复 ROS 会话。',
    }
  }

  if (topicSnapshot.health === 'waiting') {
    return {
      tone: 'info' as const,
      title: '等待里程计首帧',
      description:
        '站点网关正在等待 /clean_robot_server/odometry_state 的第一条状态。',
    }
  }

  if (topicSnapshot.health === 'unavailable') {
    return {
      tone: 'warning' as const,
      title: '里程计 topic 暂无发布',
      description:
        topicSnapshot.metaError ||
        '当前没有发现 odometry_state 的活跃发布者，页面会先回退显示服务查询结果。',
    }
  }

  if (topicSnapshot.health === 'stale') {
    return {
      tone: 'warning' as const,
      title: '里程计 topic 已延迟',
      description:
        '最近一帧里程计状态超出了预期刷新周期，请结合错误码和节点就绪情况继续排查。',
    }
  }

  return null
}

interface OdometryHealthCardProps {
  state: OdometryState | null
  topicSnapshot: OdometryTopicSnapshot
  serviceError: string | null
}

export function OdometryHealthCard({
  state,
  topicSnapshot,
  serviceError,
}: OdometryHealthCardProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const topicStateAlert = getTopicStateAlert(topicSnapshot)
  const latestTimestamp = topicSnapshot.lastMessageAt ?? state?.stampMs ?? null

  return (
    <>
      <Card
        title="里程计健康"
        className="slam-card"
        extra={
          <Space size="small" wrap>
            {getHealthTag(state)}
            {getTopicTag(topicSnapshot.health)}
            <Button size="small" onClick={() => setIsDrawerOpen(true)}>
              查看诊断
            </Button>
          </Space>
        }
      >
        {serviceError ? (
          <AppFeedbackBanner
            tone="warning"
            title="里程计服务查询失败"
            description={serviceError}
            className="slam-inline-alert"
          />
        ) : null}

        {topicSnapshot.subscribeError ? (
          <AppFeedbackBanner
            tone="warning"
            title="里程计 topic 订阅异常"
            description={topicSnapshot.subscribeError}
            className="slam-inline-alert"
          />
        ) : null}

        {topicStateAlert ? (
          <AppFeedbackBanner
            tone={topicStateAlert.tone}
            title={topicStateAlert.title}
            description={topicStateAlert.description}
            className="slam-inline-alert"
          />
        ) : null}

        {state ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            {state.errorCode || state.message ? (
              <AppFeedbackBanner
                tone={state.odomValid === false ? 'error' : 'warning'}
                title={state.errorCode || '里程计状态提示'}
                description={state.message || '后端没有附带额外说明。'}
              />
            ) : null}

            {state.warnings.length > 0 ? (
              <AppFeedbackBanner
                tone="warning"
                title="里程计告警"
                description={state.warnings.join(' | ')}
              />
            ) : null}

            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="里程计来源">
                {state.odomSource || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="错误码">{state.errorCode || '--'}</Descriptions.Item>
              <Descriptions.Item label="ROS 链路">
                {renderBoolTag(state.connected, '已连接', '未连接')}
              </Descriptions.Item>
              <Descriptions.Item label="里程计有效">
                {renderBoolTag(state.odomValid, '有效', '无效')}
              </Descriptions.Item>
              <Descriptions.Item label="轮速节点">
                {renderBoolTag(state.wheelSpeedNodeReady, '已就绪', '未就绪')}
              </Descriptions.Item>
              <Descriptions.Item label="IMU 预处理">
                {renderBoolTag(state.imuPreprocessNodeReady, '已就绪', '未就绪')}
              </Descriptions.Item>
              <Descriptions.Item label="EKF 节点">
                {renderBoolTag(state.ekfNodeReady, '已就绪', '未就绪')}
              </Descriptions.Item>
              <Descriptions.Item label="里程计 topic">
                {renderBoolTag(state.odomFresh, '新鲜', '超时')}
              </Descriptions.Item>
              <Descriptions.Item label="轮速延迟">
                {formatAge(state.wheelSpeedAgeS)}
              </Descriptions.Item>
              <Descriptions.Item label="IMU 延迟">
                {formatAge(state.imuAgeS)}
              </Descriptions.Item>
              <Descriptions.Item label="里程计延迟">
                {formatAge(state.odomAgeS)}
              </Descriptions.Item>
              <Descriptions.Item label="状态时间">
                {formatTimestamp(latestTimestamp)}
              </Descriptions.Item>
            </Descriptions>

            <Typography.Paragraph className="odometry-card-note">
              里程计健康同时参考
              <Typography.Text code>
                /clean_robot_server/app/get_odometry_status
              </Typography.Text>
              和
              <Typography.Text code>/clean_robot_server/odometry_state</Typography.Text>
              topic；当 topic 延迟时，页面会保留服务查询结果作为补充。
            </Typography.Paragraph>
          </Space>
        ) : (
          <AppEmptyState description="当前还没有拿到里程计健康快照。" />
        )}
      </Card>

      <Drawer
        open={isDrawerOpen}
        title="里程计诊断详情"
        size={520}
        onClose={() => setIsDrawerOpen(false)}
      >
        <Card className="odometry-diagnostic-card">
          <Typography.Title level={5}>节点与数据链路</Typography.Title>
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="topic 名称">
              {topicSnapshot.topicName}
            </Descriptions.Item>
            <Descriptions.Item label="原始里程计 topic">
              {state?.rawOdomTopic || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="融合里程计 topic">
              {state?.odomTopic || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="IMU topic">
              {state?.imuTopic || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="topic 类型">
              {topicSnapshot.messageType || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="发布者">
              {topicSnapshot.publishers.join(', ') || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="订阅者">
              {topicSnapshot.subscribers.join(', ') || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="消息数">
              {String(topicSnapshot.messageCount)}
            </Descriptions.Item>
            <Descriptions.Item label="最近更新时间">
              {formatTimestamp(topicSnapshot.lastMessageAt)}
            </Descriptions.Item>
            <Descriptions.Item label="topic 延迟">
              {topicSnapshot.ageMs === null ? '--' : `${topicSnapshot.ageMs} ms`}
            </Descriptions.Item>
            <Descriptions.Item label="metaError">
              {topicSnapshot.metaError || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="subscribeError">
              {topicSnapshot.subscribeError || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="原始状态 JSON">
              <pre>{JSON.stringify(state?.raw ?? {}, null, 2)}</pre>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Drawer>
    </>
  )
}
