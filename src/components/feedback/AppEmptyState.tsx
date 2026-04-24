import type { ReactNode } from 'react'

import { Button, Empty, Typography } from 'antd'

import './FeedbackBlocks.css'

type AppEmptyStateProps = {
  title?: ReactNode
  description: ReactNode
  actionLabel?: string
  onAction?: () => void
}

export function AppEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: AppEmptyStateProps) {
  return (
    <div className="app-feedback-empty">
      {title ? (
        <Typography.Text strong className="app-feedback-empty-title">
          {title}
        </Typography.Text>
      ) : null}

      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} />

      <Typography.Paragraph className="app-feedback-empty-description">
        {description}
      </Typography.Paragraph>

      {actionLabel && onAction ? (
        <div className="app-feedback-empty-action">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      ) : null}
    </div>
  )
}
