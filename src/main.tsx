import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import 'antd/dist/reset.css'
import './index.css'
import { AppBootstrapErrorScreen } from './components/app/AppBootstrapErrorScreen'
import {
  AppConfigValidationError,
  loadAppConfig,
} from './config/appConfig'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retryOnMount: false,
    },
  },
})

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing root container.')
}

const root = createRoot(rootElement)

function renderApp(children: ReactNode) {
  root.render(
    <StrictMode>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1f7a68',
            colorInfo: '#1f7a68',
            colorSuccess: '#1f7a68',
            colorWarning: '#d17721',
            colorError: '#cf5a36',
            colorBgLayout: 'transparent',
            borderRadius: 18,
            fontFamily: '"Bahnschrift", "Aptos", "Segoe UI", sans-serif',
          },
        }}
      >
        {children}
      </ConfigProvider>
    </StrictMode>,
  )
}

async function bootstrap() {
  try {
    await loadAppConfig()
    const { default: App } = await import('./App.tsx')

    renderApp(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    )
  } catch (error) {
    const title =
      error instanceof AppConfigValidationError
        ? 'Startup configuration is invalid'
        : 'Frontend bootstrap failed'
    const description =
      error instanceof Error
        ? error.message
        : 'The application failed before the main shell was mounted.'
    const issues =
      error instanceof AppConfigValidationError ? error.issues : []

    renderApp(
      <AppBootstrapErrorScreen
        title={title}
        description={description}
        issues={issues}
      />,
    )
  }
}

void bootstrap()
