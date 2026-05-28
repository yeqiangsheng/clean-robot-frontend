import { useEffect, useState } from 'react'

import { Button, Card, Checkbox, Form, Input } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'

import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import { SunnyBearLogo } from './SunnyBearLogo'

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
  rememberUsername?: boolean
}

const REMEMBERED_USERNAME_KEY = 'cleanRobot.rememberedUsername'
const LEGACY_REMEMBERED_LOGIN_KEY = 'cleanRobot.rememberedLogin'

function readRememberedUsername(): Pick<LoginFormValues, 'username' | 'rememberUsername'> | null {
  try {
    window.localStorage.removeItem(LEGACY_REMEMBERED_LOGIN_KEY)
    const username = window.localStorage.getItem(REMEMBERED_USERNAME_KEY)
    if (!username) {
      return null
    }

    const trimmed = username.trim()
    if (!trimmed) {
      return null
    }

    return {
      username: trimmed,
      rememberUsername: true,
    }
  } catch {
    return null
  }
}

function saveRememberedUsername(username: string) {
  window.localStorage.setItem(REMEMBERED_USERNAME_KEY, username)
}

function clearRememberedUsername() {
  window.localStorage.removeItem(REMEMBERED_USERNAME_KEY)
  window.localStorage.removeItem(LEGACY_REMEMBERED_LOGIN_KEY)
}

export function LoginScreen({
  loading,
  error,
  onSubmit,
}: LoginScreenProps) {
  const [form] = Form.useForm<LoginFormValues>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const rememberedUsername = readRememberedUsername()
    if (rememberedUsername) {
      form.setFieldsValue(rememberedUsername)
    }
  }, [form])

  const handleFinish = async (values: LoginFormValues) => {
    setSubmitting(true)

    try {
      await onSubmit(values.username, values.password)
      if (values.rememberUsername) {
        saveRememberedUsername(values.username)
      } else {
        clearRememberedUsername()
        form.resetFields(['password'])
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-login-shell">
      <Card className="app-login-card">
        <div className="app-login-content">
          <div className="app-login-brand">
            <SunnyBearLogo compact />
          </div>

          {error ? <AppFeedbackBanner tone="error" title="登录失败" description={error} /> : null}

          <Form<LoginFormValues>
            form={form}
            className="app-login-form"
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
                size="large"
                prefix={<UserOutlined />}
                placeholder="请输入账号"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码。' }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item name="rememberUsername" valuePropName="checked" className="app-login-remember">
              <Checkbox>记住账号</Checkbox>
            </Form.Item>

            <Button
              className="app-login-submit"
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading || submitting}
            >
              登录
            </Button>
          </Form>
        </div>
      </Card>
    </div>
  )
}
