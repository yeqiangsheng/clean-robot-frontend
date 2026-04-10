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
          { field: 'rosbridgeUrl', message: 'must use ws:// or wss://' },
          { field: 'rolePolicy.engineer', message: 'must not be empty' },
        ]}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Invalid config')).toBeInTheDocument()
    expect(screen.getByText('rosbridgeUrl')).toBeInTheDocument()
    expect(screen.getByText('must use ws:// or wss://')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
