import { Button, Card, Form } from 'antd'

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
        <div className="slam-form-actions">
          <Button
            block
            size="large"
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={disabled}
          >
            重新定位
          </Button>
        </div>
      </Form>
    </Card>
  )
}
