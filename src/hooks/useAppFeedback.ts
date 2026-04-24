import { App as AntdApp } from 'antd'

type FeedbackTone = 'success' | 'info' | 'warning' | 'error' | 'blocking'

function mapTone(tone: FeedbackTone) {
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

export function useAppFeedback() {
  const { notification } = AntdApp.useApp()

  const open = (tone: FeedbackTone, title: string, description?: string) => {
    notification[mapTone(tone)]({
      message: title,
      description,
      placement: 'topRight',
    })
  }

  return {
    success: (title: string, description?: string) => open('success', title, description),
    info: (title: string, description?: string) => open('info', title, description),
    warning: (title: string, description?: string) => open('warning', title, description),
    error: (title: string, description?: string) => open('error', title, description),
    blocked: (title: string, description?: string) => open('blocking', title, description),
  }
}
