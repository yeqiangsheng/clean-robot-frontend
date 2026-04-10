import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'

import type {
  Point2D,
  ZoneDraftPreview,
  ZoneEditorMode,
  ZoneRectDraft,
} from '../../types/map-editor'
import { formatNumber } from '../../utils/geometry'

interface ZonePreviewPanelProps {
  mode: ZoneEditorMode
  hasAlignment: boolean
  rectPoints: Point2D[]
  draftRect: ZoneRectDraft | null
  draftPreview: ZoneDraftPreview | null
  editingZoneId?: string | null
  editingZoneVersion?: number | null
  displayName: string
  profileName: string
  profileOptions: Array<{ label: string; value: string; title?: string }>
  profileCatalogError: string | null
  isLoadingProfiles: boolean
  isPreviewingRect: boolean
  isPreviewingPlan: boolean
  isCommitting: boolean
  lastError: string | null
  onDisplayNameChange: (value: string) => void
  onProfileNameChange: (value: string) => void
  onPreviewPlan: () => void
  onCommitZone: () => void
  onCancel: () => void
}

export function ZonePreviewPanel({
  mode,
  hasAlignment,
  rectPoints,
  draftRect,
  draftPreview,
  editingZoneId = null,
  editingZoneVersion = null,
  displayName,
  profileName,
  profileOptions,
  profileCatalogError,
  isLoadingProfiles,
  isPreviewingRect,
  isPreviewingPlan,
  isCommitting,
  lastError,
  onDisplayNameChange,
  onProfileNameChange,
  onPreviewPlan,
  onCommitZone,
  onCancel,
}: ZonePreviewPanelProps) {
  const isCreatingZone = mode === 'creating-zone'
  const isEditingZone = mode === 'editing-zone'
  const canCommit = Boolean(
    draftRect &&
      draftPreview?.valid === true &&
      displayName.trim() &&
      profileName.trim() &&
      !isCommitting,
  )
  const commitLabel = isEditingZone ? '保存修改' : '提交覆盖区'

  return (
    <Card
      title="覆盖区草稿"
      className="workbench-card"
      extra={
        draftPreview ? (
          <Tag color={draftPreview.valid ? 'success' : 'warning'}>
            {draftPreview.valid ? '预览有效' : '预览无效'}
          </Tag>
        ) : draftRect ? (
          <Tag color="processing">草稿已生成</Tag>
        ) : (
          <Tag>等待中</Tag>
        )
      }
    >
      {!hasAlignment ? (
        <Alert
          showIcon
          type="info"
          title="当前使用原始地图坐标"
          description="业务方向对齐不是覆盖区编辑的前置条件；在启用高级对齐前，草稿、预览和提交都会继续使用地图坐标。"
          className="zone-editor-alert"
        />
      ) : null}

      {!isCreatingZone && !isEditingZone && !draftRect ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            isEditingZone
              ? '正在加载所选覆盖区草稿...'
              : '点击“新建覆盖区”开始两点矩形草稿。'
          }
        />
      ) : null}

      {isCreatingZone && isPreviewingRect ? (
        <div className="workbench-card-placeholder zone-preview-loading">
          <Spin />
          <Typography.Text>正在等待后端返回矩形草稿...</Typography.Text>
        </div>
      ) : null}

      {isCreatingZone && !isPreviewingRect && !draftRect ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            rectPoints.length === 0
              ? '请先在画布上点击第一个矩形角点。'
              : '请再点击对角点，向后端请求矩形草稿。'
          }
        />
      ) : null}

      {isEditingZone && !draftRect ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="请先选择一个矩形覆盖区，再点击“编辑覆盖区”开始修改。"
        />
      ) : null}

      {isCreatingZone && lastError ? (
        <Alert
          showIcon
          type="error"
          title={
            draftRect ? '覆盖区草稿操作失败' : '矩形草稿生成失败'
          }
          description={lastError}
          className="zone-editor-alert"
        />
      ) : null}

      {isEditingZone && lastError ? (
        <Alert
          showIcon
          type="error"
          title="覆盖区更新失败"
          description={lastError}
          className="zone-editor-alert"
        />
      ) : null}

      {profileCatalogError ? (
        <Alert
          showIcon
          type="warning"
          title="规划档位目录加载失败"
          description={`当前无法加载可选规划档位，相关功能已降级。${profileCatalogError}`}
          className="zone-editor-alert"
        />
      ) : null}

      {draftRect ? (
        <>
          <Descriptions column={1} size="small" colon={false}>
            {isEditingZone ? (
              <>
                <Descriptions.Item label="覆盖区 ID">
                  {editingZoneId ?? '--'}
                </Descriptions.Item>
                <Descriptions.Item label="基线版本">
                  {editingZoneVersion ?? '--'}
                </Descriptions.Item>
              </>
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

          {draftRect.warnings.length > 0 ? (
            <div className="constraint-warning-block">
              <Typography.Text strong>草稿注意事项</Typography.Text>
              <ul className="constraint-warning-list">
                {draftRect.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : (
            <Typography.Paragraph className="workbench-footnote zone-preview-footnote">
              {isEditingZone
                ? '请先在画布上拖动四个角点，再执行“预览路径”，确认后保存修改。'
                : '当前草稿没有额外告警，画布上展示的是后端返回的 `display_region`。'}
            </Typography.Paragraph>
          )}

          <div className="zone-preview-form">
            <div className="zone-preview-form-row">
              <Typography.Text strong>显示名称</Typography.Text>
              <Input
                value={displayName}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                placeholder="请输入覆盖区名称"
              />
            </div>
            <div className="zone-preview-form-row">
              <Typography.Text strong>规划档位</Typography.Text>
              <Select
                showSearch
                value={profileName || undefined}
                loading={isLoadingProfiles}
                options={profileOptions}
                optionFilterProp="label"
                placeholder="请选择规划档位"
                notFoundContent={
                  isLoadingProfiles ? <Spin size="small" /> : '暂无可选规划档位'
                }
                onChange={(value) => onProfileNameChange(value)}
              />
            </div>
            {!profileCatalogError && profileOptions.length === 0 && !isLoadingProfiles ? (
              <Typography.Paragraph className="workbench-footnote zone-preview-footnote">
                后端暂时还没有返回可选的规划档位，当前模块已保持可打开但不可完整提交。
              </Typography.Paragraph>
            ) : null}
          </div>

          <Space wrap className="zone-preview-actions">
            <Button onClick={onPreviewPlan} loading={isPreviewingPlan}>
              预览路径
            </Button>
            <Button
              type="primary"
              onClick={onCommitZone}
              loading={isCommitting}
              disabled={!canCommit}
            >
              {commitLabel}
            </Button>
            <Button onClick={onCancel} disabled={isPreviewingPlan || isCommitting}>
              取消
            </Button>
          </Space>
        </>
      ) : null}

      {draftPreview ? (
        <>
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="预览是否有效">
              <Tag color={draftPreview.valid ? 'success' : 'warning'}>
                {draftPreview.valid ? '是' : '否'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="预计路径长度">
              {formatNumber(draftPreview.estimatedLengthM, 3)}
            </Descriptions.Item>
            <Descriptions.Item label="预计时长">
              {formatNumber(draftPreview.estimatedDurationS, 1)}
            </Descriptions.Item>
            <Descriptions.Item label="入口位姿">
              {draftPreview.displayEntryPose
                ? `${formatNumber(draftPreview.displayEntryPose.x, 2)}, ${formatNumber(
                    draftPreview.displayEntryPose.y,
                    2,
                  )}, ${formatNumber(draftPreview.displayEntryPose.theta, 3)}`
                : '--'}
            </Descriptions.Item>
          </Descriptions>

          {draftPreview.warnings.length > 0 ? (
            <div className="constraint-warning-block">
              <Typography.Text strong>预览注意事项</Typography.Text>
              <ul className="constraint-warning-list">
                {draftPreview.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : (
            <Typography.Paragraph className="workbench-footnote zone-preview-footnote">
              当前画布上的预览路径和入口位姿，已经来自真实后端返回数据。
            </Typography.Paragraph>
          )}
        </>
      ) : null}
    </Card>
  )
}
