import { Button, Space, Typography } from 'antd'

import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type { AppConfigValidationIssue } from '../../types/appShell'

interface AppBootstrapErrorScreenProps {
  title: string
  description: string
  issues?: AppConfigValidationIssue[]
  onRetry?: () => void
}

export function AppBootstrapErrorScreen({
  title,
  description,
  issues = [],
  onRetry,
}: AppBootstrapErrorScreenProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background:
          'radial-gradient(circle at top, rgba(31,122,104,0.12), transparent 45%), linear-gradient(180deg, #f5f7f4 0%, #edf2ec 100%)',
      }}
    >
      <div style={{ width: 'min(720px, 100%)' }}>
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={2} style={{ marginBottom: 8 }}>
              清洁机器人商用前端
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              启动校验在业务页面挂载前就拦下了应用，请先处理配置问题再继续。
            </Typography.Paragraph>
          </div>

          <AppFeedbackBanner
            tone="error"
            title={title}
            description={
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  {description}
                </Typography.Paragraph>

                {issues.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gap: 8,
                      border: '1px solid rgba(19, 34, 40, 0.12)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'rgba(255, 255, 255, 0.72)',
                    }}
                  >
                    {issues.map((issue) => (
                      <div
                        key={`${issue.field}-${issue.message}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(120px, 180px) 1fr',
                          gap: 12,
                          alignItems: 'start',
                        }}
                      >
                        <Typography.Text code>{issue.field}</Typography.Text>
                        <Typography.Text>{issue.message}</Typography.Text>
                      </div>
                    ))}
                  </div>
                ) : null}

                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  请检查 `public/app-config.json`，必要时重新构建，然后刷新页面。
                </Typography.Paragraph>
              </Space>
            }
          />

          <Space>
            {onRetry ? (
              <Button type="primary" onClick={onRetry}>
                重试
              </Button>
            ) : null}
            <Button onClick={() => window.location.reload()}>刷新页面</Button>
          </Space>
        </Space>
      </div>
    </div>
  )
}
