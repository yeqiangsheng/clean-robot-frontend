import { useEffect } from 'react'

import { Alert, Button, Card, Form, InputNumber, Space, Switch, Tag, Typography } from 'antd'

type RelocalizeFormValues = {
  hasInitialPose: boolean
  initialPoseX: number
  initialPoseY: number
  initialPoseYaw: number
}

type RelocalizeFormProps = {
  disabled: boolean
  expanded: boolean
  loading: boolean
  manualAssistRequired: boolean
  manualAssistReason?: string
  onExpandedChange: (expanded: boolean) => void
  onSubmit: (values: RelocalizeFormValues) => void
  runtimeMapName?: string
}

export function RelocalizeForm({
  disabled,
  expanded,
  loading,
  manualAssistRequired,
  manualAssistReason,
  onExpandedChange,
  onSubmit,
  runtimeMapName,
}: RelocalizeFormProps) {
  const [form] = Form.useForm<RelocalizeFormValues>()
  const hasInitialPose = Form.useWatch('hasInitialPose', form) ?? false
  const assistDescription = [
    runtimeMapName ? `当前地图：${runtimeMapName}` : null,
    manualAssistReason
      ? `后端提示：${manualAssistReason}`
      : manualAssistRequired
        ? '后端要求人工辅助，请先提供可靠的初始位姿后再重试。'
        : null,
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (manualAssistRequired) {
      form.setFieldsValue({
        hasInitialPose: true,
      })
    }
  }, [form, manualAssistRequired])

  return (
    <Card
      title="重新定位"
      className="slam-card"
      extra={
        <Space wrap>
          {manualAssistRequired ? <Tag color="orange">需要人工辅助</Tag> : null}
          <Button size="small" type="text" onClick={() => onExpandedChange(!expanded)}>
            {expanded ? '收起' : '展开'}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph className="slam-card-copy">
        可以直接提交自动重定位；如果现场需要人工辅助，也可以一并填写初始位姿。
      </Typography.Paragraph>

      {expanded ? (
        <>
          {manualAssistRequired ? (
            <Alert
              showIcon
              type="warning"
              title="重试前请先提供初始位姿"
              description={assistDescription}
              className="slam-inline-alert"
            />
          ) : null}

          <Form<RelocalizeFormValues>
            form={form}
            layout="vertical"
            initialValues={{
              hasInitialPose: manualAssistRequired,
              initialPoseX: 0,
              initialPoseY: 0,
              initialPoseYaw: 0,
            }}
            onFinish={onSubmit}
          >
            <Form.Item
              name="hasInitialPose"
              label="附带初始位姿"
              valuePropName="checked"
            >
              <Switch disabled={disabled} />
            </Form.Item>

            {hasInitialPose ? (
              <div className="slam-inline-grid">
                <Form.Item name="initialPoseX" label="x">
                  <InputNumber style={{ width: '100%' }} disabled={disabled} />
                </Form.Item>
                <Form.Item name="initialPoseY" label="y">
                  <InputNumber style={{ width: '100%' }} disabled={disabled} />
                </Form.Item>
                <Form.Item name="initialPoseYaw" label="yaw">
                  <InputNumber style={{ width: '100%' }} disabled={disabled} />
                </Form.Item>
              </div>
            ) : null}

            <Space wrap>
              <Button type="primary" htmlType="submit" loading={loading} disabled={disabled}>
                提交重定位
              </Button>
              <Button disabled={disabled || loading} onClick={() => form.resetFields()}>
                重置
              </Button>
            </Space>
          </Form>
        </>
      ) : (
        <Typography.Paragraph className="slam-footnote">
          展开后可以直接提交自动重定位，也可以在需要人工辅助时填入 `x / y / yaw` 再重试。
        </Typography.Paragraph>
      )}
    </Card>
  )
}
