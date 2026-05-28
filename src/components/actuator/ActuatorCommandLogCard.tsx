import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Space, Tag, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import {
  formatJson,
  formatTimestamp,
  type CommandLogItem,
} from '../../utils/actuatorControlPage'

type CopyLogAction = (logItem: CommandLogItem) => void | Promise<void>

export function ActuatorCommandLogCard({
  logs,
  limit,
  onClear,
  onCopy,
}: {
  logs: CommandLogItem[]
  limit: number
  onClear: () => void
  onCopy: CopyLogAction
}) {
  return (
    <Card
      title="发送请求日志"
      className="actuator-card actuator-log-card"
      extra={
        <Space wrap>
          <Tag>{`${logs.length} / ${limit}`}</Tag>
          <Button
            size="small"
            icon={<DeleteOutlined />}
            disabled={logs.length === 0}
            onClick={onClear}
          >
            清空
          </Button>
        </Space>
      }
    >
      {logs.length > 0 ? (
        <div className="actuator-log-list">
          {logs.map((logItem) => (
            <div key={logItem.id} className="actuator-log-item">
              <div className="actuator-log-item-head">
                <div className="actuator-log-item-title">
                  <Typography.Text strong>{logItem.label}</Typography.Text>
                  <Tag color="blue">{formatTimestamp(logItem.sentAt)}</Tag>
                </div>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void onCopy(logItem)
                  }}
                >
                  复制
                </Button>
              </div>

              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="HTTP body">
                  <Typography.Text className="actuator-payload-text">
                    {formatJson({ command: logItem.command })}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>

              <div className="actuator-log-step-list">
                {logItem.steps.map((step, index) => (
                  <div key={`${logItem.id}-${index}`} className="actuator-log-step">
                    <div className="actuator-log-step-head">
                      <Space wrap>
                        <Tag color="processing">{`步骤 ${index + 1}`}</Tag>
                        <Typography.Text strong>{step.label}</Typography.Text>
                      </Space>
                    </div>
                    <Descriptions column={1} size="small" colon={false}>
                      <Descriptions.Item label="Topic">
                        <Typography.Text code>{step.topicName}</Typography.Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="Type">
                        <Typography.Text code>{step.messageType}</Typography.Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="Payload">
                        <Typography.Text className="actuator-payload-text">
                          {formatJson(step.payload)}
                        </Typography.Text>
                      </Descriptions.Item>
                    </Descriptions>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <AppEmptyState description="命令下发成功后，这里会显示 HTTP command body 和 ROS topic payload。" />
      )}
    </Card>
  )
}
