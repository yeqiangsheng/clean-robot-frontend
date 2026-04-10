import { Alert, Button, Card, Descriptions, Empty, Input, Space, Typography } from 'antd'

import type { ConstraintEditorMode, ZoneRectDraft } from '../../types/map-editor'
import { formatNumber } from '../../utils/geometry'

interface NoGoEditorPanelProps {
  mode: ConstraintEditorMode
  draftRect: ZoneRectDraft | null
  editingAreaId?: string | null
  displayName: string
  isSaving: boolean
  lastError: string | null
  onDisplayNameChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export function NoGoEditorPanel({
  mode,
  draftRect,
  editingAreaId = null,
  displayName,
  isSaving,
  lastError,
  onDisplayNameChange,
  onSave,
  onCancel,
}: NoGoEditorPanelProps) {
  const isCreating = mode === 'creating-no-go'
  const isEditing = mode === 'editing-no-go'
  const isActive = isCreating || isEditing

  if (!isActive) {
    return null
  }

  return (
    <Card
      title="禁入区草稿"
      className="workbench-card"
      extra={<Typography.Text type="secondary">{isEditing ? '修改' : '新增'}</Typography.Text>}
    >
      {lastError ? (
        <Alert
          showIcon
          type="error"
          title={isEditing ? '禁入区保存失败' : '禁入区新增失败'}
          description={lastError}
          className="zone-editor-alert"
        />
      ) : null}

      {!draftRect ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            isEditing
              ? '正在加载所选禁入区的几何信息。'
              : '请在画布上选择两个角点，生成矩形禁入区草稿。'
          }
        />
      ) : (
        <>
          <Descriptions column={1} size="small" colon={false}>
            {isEditing ? (
              <Descriptions.Item label="禁入区 ID">{editingAreaId ?? '--'}</Descriptions.Item>
            ) : null}
            <Descriptions.Item label="宽度">
              {formatNumber(draftRect.widthM, 3)}
            </Descriptions.Item>
            <Descriptions.Item label="高度">
              {formatNumber(draftRect.heightM, 3)}
            </Descriptions.Item>
            <Descriptions.Item label="面积">
              {formatNumber(draftRect.areaM2, 3)}
            </Descriptions.Item>
            <Descriptions.Item label="显示坐标系">
              {draftRect.displayFrame?.frameId ?? '--'}
            </Descriptions.Item>
          </Descriptions>

          <div className="zone-preview-form">
            <div className="zone-preview-form-row">
              <Typography.Text strong>显示名称</Typography.Text>
              <Input
                value={displayName}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                placeholder="请输入禁入区名称"
              />
            </div>
          </div>

          <Space wrap className="zone-preview-actions">
            <Button
              type="primary"
              onClick={onSave}
              loading={isSaving}
              disabled={!displayName.trim()}
            >
              {isEditing ? '保存修改' : '保存禁入区'}
            </Button>
            <Button onClick={onCancel} disabled={isSaving}>
              取消
            </Button>
          </Space>

          <Typography.Paragraph className="workbench-footnote zone-preview-footnote">
            前端当前只编辑 `display_region`，最终写入后的几何数据仍以后端保存结果为准。
          </Typography.Paragraph>
        </>
      )}
    </Card>
  )
}
