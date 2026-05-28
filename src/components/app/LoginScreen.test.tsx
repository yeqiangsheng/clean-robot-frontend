import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoginScreen } from './LoginScreen'

describe('LoginScreen', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('remembers only the username and removes legacy saved passwords', async () => {
    window.localStorage.setItem(
      'cleanRobot.rememberedLogin',
      JSON.stringify({ username: 'old-user', password: 'old-secret' }),
    )

    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <LoginScreen
        siteName="清洁机器人商用站点"
        robotId="local_robot"
        loading={false}
        error={null}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('账号'), {
      target: { value: 'operator' },
    })
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'field-secret' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: '记住账号' }))
    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('operator', 'field-secret')
    })

    expect(window.localStorage.getItem('cleanRobot.rememberedUsername')).toBe('operator')
    expect(window.localStorage.getItem('cleanRobot.rememberedLogin')).toBeNull()
    expect(JSON.stringify(window.localStorage)).not.toContain('field-secret')
  })
})
