import type { ReactNode } from 'react'

import { Spin, Typography } from 'antd'

import './FeedbackBlocks.css'

type AppLoadingStateProps = {
  message: ReactNode
  compact?: boolean
  className?: string
}

export function AppLoadingState({
  message,
  compact = false,
  className,
}: AppLoadingStateProps) {
  return (
    <div
      className={['app-feedback-loading', compact ? 'is-compact' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Spin size={compact ? 'small' : 'large'} />
      <Typography.Text>{message}</Typography.Text>
    </div>
  )
}
