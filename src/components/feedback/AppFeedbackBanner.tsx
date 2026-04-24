import type { ReactNode } from 'react'

import { Alert, Button } from 'antd'

import './FeedbackBlocks.css'

type AppFeedbackTone = 'success' | 'info' | 'warning' | 'error' | 'blocking'

type AppFeedbackBannerProps = {
  tone?: AppFeedbackTone
  title: ReactNode
  description?: ReactNode
  actionLabel?: string
  onAction?: () => void
  action?: ReactNode
  className?: string
  closable?: boolean
  onClose?: () => void
}

function getAlertType(tone: AppFeedbackTone) {
  switch (tone) {
    case 'success':
      return 'success' as const
    case 'warning':
      return 'warning' as const
    case 'error':
    case 'blocking':
      return 'error' as const
    default:
      return 'info' as const
  }
}

export function AppFeedbackBanner({
  tone = 'info',
  title,
  description,
  actionLabel,
  onAction,
  action,
  className,
  closable,
  onClose,
}: AppFeedbackBannerProps) {
  const actionNode =
    action ??
    (actionLabel && onAction ? (
      <Button type="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null)

  return (
    <Alert
      showIcon
      type={getAlertType(tone)}
      className={className}
      closable={closable}
      onClose={onClose}
      title={title}
      description={
        description || actionNode ? (
          <div className="app-feedback-banner-body">
            {description ? <div>{description}</div> : null}
            {actionNode ? <div className="app-feedback-banner-action">{actionNode}</div> : null}
          </div>
        ) : undefined
      }
    />
  )
}
