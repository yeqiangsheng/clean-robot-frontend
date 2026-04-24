import {
  Button,
  Card,
  Descriptions,
  Input,
  Select,
  Space,
  Tag,
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

function formatPreviewSummary(preview: ZoneDraftPreview, draftRect: ZoneRectDraft | null) {
  const parts: string[] = []

  if (preview.estimatedLengthM !== null) {
    parts.push(`预计长度 ${formatNumber(preview.estimatedLengthM, 1)} m`)
  }

  if (preview.estimatedDurationS !== null) {
    parts.push(`预计时长 ${formatNumber(preview.estimatedDurationS, 0)} s`)
  }

  if (draftRect?.areaM2 !== null && draftRect?.areaM2 !== undefined) {
    parts.push(`影响范围 ${formatNumber(draftRect.areaM2, 1)} m^2`)
  }

  return parts.join(' | ') || '后端已返回新的覆盖路径预览。'
}

function formatCommitSummary(summary: NonNullable<ZonePreviewPanelProps['lastCommitSummary']>) {
  const parts = [
    `zone_id: ${summary.zoneId}`,
    `version: ${summary.zoneVersion ?? '--'}`,
    `plan_id: ${summary.planId ?? '--'}`,
  ]

  if (summary.warnings.length > 0) {
    parts.push(`提示: ${summary.warnings[0]}`)
  }

  return parts.join(' | ')
}

function renderSelectLoading(message: string) {
  return <AppLoadingState compact message={message} />
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
  hasUnsavedChanges,
  lastCommitSummary,
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
  const idleDescription = isEditingZone
    ? '正在加载所选覆盖区草稿。'
    : '点击“新建覆盖区”后，在画布上选择两个角点，就能生成矩形草稿。'

  return (
    <Card
      title="覆盖区草稿"
      className="workbench-card"
      extra={
        <Space size="small" wrap>
          {isEditingZone ? <Tag color="processing">编辑中</Tag> : null}
          {isCreatingZone ? <Tag color="processing">新建中</Tag> : null}
          {!isActive ? <Tag>待命</Tag> : null}
          {isActive && hasUnsavedChanges ? <Tag color="warning">未保存</Tag> : null}
          {lastCommitSummary ? <Tag color="success">最近已保存</Tag> : null}
        </Space>
      }
    >
      {lastCommitSummary ? (
        <AppFeedbackBanner
          tone="success"
          title={lastCommitSummary.mode === 'edit' ? '覆盖区已保存' : '覆盖区已创建'}
          description={formatCommitSummary(lastCommitSummary)}
          className="zone-editor-alert"
        />
      ) : null}

      {isActive && hasUnsavedChanges ? (
        <AppFeedbackBanner
          tone="warning"
          title={isEditingZone ? '当前修改尚未保存' : '当前草稿尚未提交'}
          description={
            isEditingZone
              ? '你正在调整覆盖区几何或参数。退出编辑会丢失本次修改。'
              : '你正在创建新的覆盖区。退出编辑会放弃当前草稿和预览结果。'
          }
          className="zone-editor-alert"
        />
      ) : null}

      {!hasAlignment ? (
        <AppFeedbackBanner
          tone="info"
          title="当前直接使用地图坐标"
          description="草稿、预览和提交会继续基于地图坐标工作，不会阻塞当前工作台操作。"
          className="zone-editor-alert"
        />
      ) : null}

      {draftPreview ? (
        <AppFeedbackBanner
          tone={draftPreview.valid === false ? 'warning' : 'success'}
          title={draftPreview.valid === false ? '路径预览需要调整' : '路径预览已更新'}
          description={formatPreviewSummary(draftPreview, draftRect)}
          className="zone-editor-alert"
        />
      ) : null}

      {!isActive && !draftRect ? <AppEmptyState description={idleDescription} /> : null}

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

      {profileCatalogError ? (
        <AppFeedbackBanner
          tone="warning"
          title="规划档位目录加载失败"
          description={`当前无法加载可选规划档位，相关能力已降级。${profileCatalogError}`}
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
                ? '可以继续拖拽画布角点微调几何，再执行“预览路径”，确认后保存修改。'
                : '当前草稿已经可用，建议先做路径预览，再决定是否提交覆盖区。'}
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
                  isLoadingProfiles
                    ? renderSelectLoading('加载规划档位中...')
                    : '暂无可选规划档位'
                }
                onChange={(value) => onProfileNameChange(value)}
              />
            </div>

            {!profileCatalogError && profileOptions.length === 0 && !isLoadingProfiles ? (
              <Typography.Paragraph className="workbench-footnote zone-preview-footnote">
                后端暂未返回可选规划档位，当前页面会保持可打开，但不会允许完整提交。
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
              {isActive ? '退出编辑' : '取消'}
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
              当前画布里的预览路径和入口位姿，已经来自后端返回的正式预览结果。
            </Typography.Paragraph>
          )}
        </>
      ) : null}
    </Card>
  )
}
