import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppBootstrapErrorScreen } from './AppBootstrapErrorScreen'

describe('AppBootstrapErrorScreen', () => {
  it('renders the startup error and issues', () => {
    render(
      <AppBootstrapErrorScreen
        title="Invalid config"
        description="The startup config failed validation."
        issues={[
          { field: 'apiBaseUrl', message: 'must be a relative path or http(s) URL' },
          { field: 'enabledModules.overview', message: 'must be a boolean when provided' },
        ]}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Invalid config')).toBeInTheDocument()
    expect(screen.getByText('apiBaseUrl')).toBeInTheDocument()
    expect(screen.getByText('must be a relative path or http(s) URL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeInTheDocument()
  })
})
