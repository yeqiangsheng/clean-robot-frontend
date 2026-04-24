import { Button, Card, Form, Input, Space, Typography } from 'antd'

import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'

type RelocalizeFormValues = {
  description: string
}

type RelocalizeFormProps = {
  disabled: boolean
  loading: boolean
  lastErrorCode?: string
  lastErrorMessage?: string
  onSubmit: (values: RelocalizeFormValues) => void
}

export function RelocalizeForm({
  disabled,
  loading,
  lastErrorCode,
  lastErrorMessage,
  onSubmit,
}: RelocalizeFormProps) {
  const [form] = Form.useForm<RelocalizeFormValues>()

  return (
    <Card title="重新定位" className="slam-card">
      <Typography.Paragraph className="slam-card-copy">
        通过 `/clean_robot_server/app/submit_slam_command` 提交 `relocalize`
        动作。只有在 `can_relocalize` 或 `can_restart_localization` 允许时，页面才会放行。
      </Typography.Paragraph>

      {lastErrorCode || lastErrorMessage ? (
        <AppFeedbackBanner
          tone="warning"
          title={lastErrorCode || '最近一次重新定位失败'}
          description={
            lastErrorMessage ||
            '请先检查当前定位状态和按钮门禁，再重新提交本次重新定位。'
          }
          className="slam-inline-alert"
        />
      ) : null}

      <Form<RelocalizeFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          description: '',
        }}
        onFinish={onSubmit}
      >
        <Form.Item name="description" label="说明">
          <Input disabled={disabled} placeholder="可选，用于记录本次重新定位原因" />
        </Form.Item>

        <Space wrap>
          <Button type="primary" htmlType="submit" loading={loading} disabled={disabled}>
            提交重新定位
          </Button>
          <Button disabled={disabled || loading} onClick={() => form.resetFields()}>
            重置
          </Button>
        </Space>
      </Form>
    </Card>
  )
}
