import { useState } from 'react'

import { Button, Card, Form, Input, Space, Typography } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'

import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'

interface LoginScreenProps {
  siteName: string
  robotId: string
  loading: boolean
  error: string | null
  onSubmit: (username: string, password: string) => Promise<void>
}

interface LoginFormValues {
  username: string
  password: string
}

export function LoginScreen({
  siteName,
  robotId,
  loading,
  error,
  onSubmit,
}: LoginScreenProps) {
  const [form] = Form.useForm<LoginFormValues>()
  const [submitting, setSubmitting] = useState(false)

  const handleFinish = async (values: LoginFormValues) => {
    setSubmitting(true)

    try {
      await onSubmit(values.username, values.password)
      form.resetFields(['password'])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-login-shell">
      <Card className="app-login-card">
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={2}>{siteName}</Typography.Title>
            <Typography.Paragraph>机器人编号：{robotId}</Typography.Paragraph>
            <Typography.Paragraph type="secondary">
              当前商用前端通过本地站点 Gateway 接入 ROS 能力。请使用现场账号登录后再进入业务页面。
            </Typography.Paragraph>
          </div>

          {error ? <AppFeedbackBanner tone="error" title="登录失败" description={error} /> : null}

          <Form<LoginFormValues>
            form={form}
            layout="vertical"
            onFinish={(values) => void handleFinish(values)}
          >
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: '请输入账号。' }]}
            >
              <Input
                autoFocus
                prefix={<UserOutlined />}
                placeholder="operator / service / engineer / admin"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码。' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请输入站点 Gateway 账号密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" block loading={loading || submitting}>
              登录
            </Button>
          </Form>

          <AppFeedbackBanner
            tone="info"
            title="首次部署提示"
            description="默认引导账号会在首次启动时写入本地站点 Gateway 数据库。交付时建议立即修改默认密码。"
          />
        </Space>
      </Card>
    </div>
  )
}
