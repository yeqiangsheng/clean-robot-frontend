import { Button, Card, Descriptions, Input, InputNumber, Space, Switch, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type { ConstraintEditorMode, VirtualWallDraft } from '../../types/map-editor'
import { formatNumber } from '../../utils/geometry'

interface VirtualWallEditorPanelProps {
  mode: ConstraintEditorMode
  draftWall: VirtualWallDraft | null
  editingWallId?: string | null
  displayName: string
  enabled: boolean
  bufferM: number | null
  isSaving: boolean
  lastError: string | null
  onDisplayNameChange: (value: string) => void
  onEnabledChange: (value: boolean) => void
  onBufferChange: (value: number | null) => void
  onSave: () => void
  onCancel: () => void
}

export function VirtualWallEditorPanel({
  mode,
  draftWall,
  editingWallId = null,
  displayName,
  enabled,
  bufferM,
  isSaving,
  lastError,
  onDisplayNameChange,
  onEnabledChange,
  onBufferChange,
  onSave,
  onCancel,
}: VirtualWallEditorPanelProps) {
  const isCreating = mode === 'creating-wall'
  const isEditing = mode === 'editing-wall'
  const isActive = isCreating || isEditing

  if (!isActive) {
    return null
  }

  return (
    <Card
      title="虚拟墙草稿"
      className="workbench-card"
      extra={<Typography.Text type="secondary">{isEditing ? '修改' : '新增'}</Typography.Text>}
    >
      {lastError ? (
        <AppFeedbackBanner
          tone="error"
          title={isEditing ? '虚拟墙保存失败' : '虚拟墙新增失败'}
          description={lastError}
          className="zone-editor-alert"
        />
      ) : null}

      {!draftWall ? (
        <AppEmptyState
          description={
            isEditing
              ? '正在加载所选虚拟墙的几何信息。'
              : '请在画布上选择两个端点，生成虚拟墙草稿。'
          }
        />
      ) : (
        <>
          <Descriptions column={1} size="small" colon={false}>
            {isEditing ? <Descriptions.Item label="虚拟墙 ID">{editingWallId ?? '--'}</Descriptions.Item> : null}
            <Descriptions.Item label="线段数">{draftWall.displayPath.length}</Descriptions.Item>
            <Descriptions.Item label="显示坐标系">
              {draftWall.displayFrame?.frameId ?? '--'}
            </Descriptions.Item>
            <Descriptions.Item label="是否启用">{enabled ? '是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="缓冲距离">
              {formatNumber(bufferM ?? draftWall.bufferM, 3)}
            </Descriptions.Item>
          </Descriptions>

          <div className="zone-preview-form">
            <div className="zone-preview-form-row">
              <Typography.Text strong>显示名称</Typography.Text>
              <Input
                value={displayName}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                placeholder="请输入虚拟墙名称"
              />
            </div>
            <div className="zone-preview-form-row">
              <Typography.Text strong>缓冲距离</Typography.Text>
              <InputNumber
                value={bufferM}
                min={0}
                step={0.05}
                precision={3}
                style={{ width: '100%' }}
                onChange={(value) => onBufferChange(typeof value === 'number' ? value : null)}
              />
            </div>
            <div className="zone-preview-form-row">
              <Typography.Text strong>是否启用</Typography.Text>
              <Switch checked={enabled} onChange={onEnabledChange} />
            </div>
          </div>

          <Space wrap className="zone-preview-actions">
            <Button
              type="primary"
              onClick={onSave}
              loading={isSaving}
              disabled={!displayName.trim() || bufferM === null || bufferM < 0}
            >
              {isEditing ? '保存修改' : '保存虚拟墙'}
            </Button>
            <Button onClick={onCancel} disabled={isSaving}>
              取消
            </Button>
          </Space>

          <Typography.Paragraph className="workbench-footnote zone-preview-footnote">
            前端当前只编辑 `display_path` 和 `buffer_m`，最终以后端保存后的墙体几何为准。
          </Typography.Paragraph>
        </>
      )}
    </Card>
  )
}
