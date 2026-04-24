import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ScheduleManagementDetail } from './ScheduleManagementDetail'

const baseProps = {
  detail: null,
  isLoading: false,
  isRefreshing: false,
  error: null,
  notFound: false,
  isSubmitting: false,
  metadataEntries: [],
  planProfileLabel: '--',
  sysProfileLabel: '--',
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

describe('ScheduleManagementDetail', () => {
  it('renders a product empty state when the selected schedule no longer exists', () => {
    render(
      <ScheduleManagementDetail
        {...baseProps}
        notFound
      />,
    )

    expect(screen.getByText('这条调度已不存在')).toBeInTheDocument()
    expect(
      screen.getByText('它可能已经被删除。请选择列表中的其他调度，或直接新建一条调度。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('调度详情加载失败')).not.toBeInTheDocument()
  })
})
