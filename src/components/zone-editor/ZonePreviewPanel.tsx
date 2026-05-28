import {
  Button,
  Card,
  Descriptions,
  Input,
  Select,
  Space,
  Typography,
} from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import { AppLoadingState } from '../feedback/AppLoadingState'
import type {
  Point2D,
  ZoneDraftPreview,
  ZoneEditorMode,
  ZoneRectDraft,
} from '../../types/map-editor'
import { formatNumber } from '../../utils/geometry'

type ZonePreviewPanelProps = {
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
  hasUnsavedChanges: boolean
  lastCommitSummary: {
    mode: 'create' | 'edit'
    zoneId: string
    zoneVersion: number | null
    planId: string | null
    warnings: string[]
  } | null
  onDisplayNameChange: (value: string) => void
  onProfileNameChange: (value: string) => void
  onPreviewPlan: () => void
  onCommitZone: () => void
  onCancel: () => void
}

function renderSelectLoading(message: string) {
  return <AppLoadingState compact message={message} />
}

export function ZonePreviewPanel({
  mode,
  rectPoints,
  draftRect,
  draftPreview,
  editingZoneId = null,
  editingZoneVersion = null,
  displayName,
  profileName,
  profileOptions,
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
  const isActive = isCreatingZone || isEditingZone
  const canCommit = Boolean(
    draftRect &&
      draftPreview?.valid === true &&
      displayName.trim() &&
      profileName.trim() &&
      !isCommitting,
  )

  const commitLabel = isEditingZone ? '保存修改' : '提交覆盖区'

  return (
    <Card title="覆盖区草稿" className="workbench-card">

      {isCreatingZone && isPreviewingRect ? (
        <AppLoadingState
          className="workbench-card-placeholder zone-preview-loading"
          message="正在等待后端返回矩形草稿..."
        />
      ) : null}

      {isCreatingZone && !isPreviewingRect && !draftRect ? (
        <AppEmptyState
          description={
            rectPoints.length === 0
              ? '请先在画布上点击第一个矩形角点。'
              : '请再点击一个对角点，生成本次矩形草稿。'
          }
        />
      ) : null}

      {isEditingZone && !draftRect ? (
        <AppEmptyState description="请先选择一个矩形覆盖区，再点击“编辑覆盖区”开始修改。" />
      ) : null}

      {lastError ? (
        <AppFeedbackBanner
          tone="error"
          title={
            isEditingZone ? '覆盖区保存失败' : draftRect ? '覆盖区草稿处理失败' : '矩形草稿生成失败'
          }
          description={lastError}
          className="zone-editor-alert"
        />
      ) : null}

      {draftRect ? (
        <>
          <Descriptions column={1} size="small" colon={false}>
            {isEditingZone ? (
              <>
                <Descriptions.Item label="覆盖区 ID">{editingZoneId ?? '--'}</Descriptions.Item>
                <Descriptions.Item label="基线版本">
                  {editingZoneVersion ?? '--'}
                </Descriptions.Item>
              </>
            ) : null}
            <Descriptions.Item label="宽度">{formatNumber(draftRect.widthM, 3)}</Descriptions.Item>
            <Descriptions.Item label="高度">{formatNumber(draftRect.heightM, 3)}</Descriptions.Item>
            <Descriptions.Item label="影响范围">
              {formatNumber(draftRect.areaM2, 3)} m^2
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
                  isLoadingProfiles
                    ? renderSelectLoading('加载规划档位中...')
                    : '暂无可选规划档位'
                }
                onChange={(value) => onProfileNameChange(value)}
              />
            </div>
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
              {isActive ? '退出编辑' : '取消'}
            </Button>
          </Space>
        </>
      ) : null}

      {draftPreview ? (
        <>
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="预览是否有效">
              {draftPreview.valid ? '是' : '否'}
            </Descriptions.Item>
            <Descriptions.Item label="预计路径长度">
              {draftPreview.estimatedLengthM !== null
                ? `${formatNumber(draftPreview.estimatedLengthM, 3)} m`
                : '--'}
            </Descriptions.Item>
            <Descriptions.Item label="预计时长">
              {draftPreview.estimatedDurationS !== null
                ? `${formatNumber(draftPreview.estimatedDurationS, 1)} s`
                : '--'}
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

        </>
      ) : null}
    </Card>
  )
}
