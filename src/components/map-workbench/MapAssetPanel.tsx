import {
  DeleteOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
  type FormInstance,
} from 'antd'

import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type { MapCatalogEntry } from '../../types/mapCatalog'
import {
  getMapRevisionId,
  isProtectedMapAsset,
  type MapAssetFeedbackState,
  type MapAssetImportFormValues,
  type MapImportFeedbackState,
} from '../../utils/mapWorkbenchPage'

interface MapAssetPanelProps {
  enabledMapAssets: MapCatalogEntry[]
  disabledMapAssets: MapCatalogEntry[]
  mapCatalogError?: Error | null
  mapAssetFeedback: MapAssetFeedbackState | null
  mapImportFeedback: MapImportFeedbackState | null
  mapImportForm: FormInstance<MapAssetImportFormValues>
  servicesReady: boolean
  isAnyEditorActive: boolean
  isCleanupDryRunning: boolean
  isCleanupExecuting: boolean
  isCheckingMapImport: boolean
  isImportingMapAsset: boolean
  softDeletingRevisionId: string
  hardDeletingRevisionId: string
  onClearAssetFeedback: () => void
  onClearImportFeedback: () => void
  onImportCurrentMapAsset: () => void
  onSoftDeleteMapAsset: (entry: MapCatalogEntry) => void
  onHardDeleteMapAsset: (entry: MapCatalogEntry) => void
  onCleanupDisabledMapAssets: () => void
}

export function MapAssetPanel({
  enabledMapAssets,
  disabledMapAssets,
  mapCatalogError,
  mapAssetFeedback,
  mapImportFeedback,
  mapImportForm,
  servicesReady,
  isAnyEditorActive,
  isCleanupDryRunning,
  isCleanupExecuting,
  isCheckingMapImport,
  isImportingMapAsset,
  softDeletingRevisionId,
  hardDeletingRevisionId,
  onClearAssetFeedback,
  onClearImportFeedback,
  onImportCurrentMapAsset,
  onSoftDeleteMapAsset,
  onHardDeleteMapAsset,
  onCleanupDisabledMapAssets,
}: MapAssetPanelProps) {
  return (
    <>
      <Card title="地图资产" className="workbench-card" extra={<InboxOutlined />}>
        {mapAssetFeedback ? (
          <AppFeedbackBanner
            closable
            tone={mapAssetFeedback.type}
            title={mapAssetFeedback.title}
            description={mapAssetFeedback.message}
            className="workbench-inline-alert"
            onClose={onClearAssetFeedback}
          />
        ) : null}

        {mapCatalogError ? (
          <AppFeedbackBanner
            tone="error"
            title="地图资产加载失败"
            description={mapCatalogError.message}
            className="workbench-inline-alert"
          />
        ) : null}

        <div className="map-asset-section">
          <div className="map-asset-section-header">
            <Typography.Text strong>可用地图</Typography.Text>
            <Tag>{enabledMapAssets.length}</Tag>
          </div>
          <div className="map-asset-list">
            {enabledMapAssets.length > 0 ? (
              enabledMapAssets.map((entry) => {
                const revisionId = getMapRevisionId(entry)
                const loadingKey = revisionId || entry.mapName
                const disableSoftDelete =
                  !servicesReady || isAnyEditorActive || entry.isActive || entry.isRuntime

                return (
                  <div key={`enabled-${entry.mapName}-${revisionId}`} className="map-asset-row">
                    <div className="map-asset-main">
                      <Typography.Text strong ellipsis>
                        {entry.displayName}
                      </Typography.Text>
                      <div className="map-asset-tags">
                        {entry.isActive ? <Tag color="green">当前</Tag> : null}
                        {entry.isRuntime ? <Tag color="blue">运行中</Tag> : null}
                        {revisionId ? <Tag>revision</Tag> : null}
                      </div>
                    </div>
                    <Popconfirm
                      title="禁用地图"
                      description="禁用地图，不释放磁盘空间。"
                      okText="确认"
                      cancelText="取消"
                      disabled={disableSoftDelete}
                      onConfirm={() => onSoftDeleteMapAsset(entry)}
                    >
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={disableSoftDelete}
                        loading={softDeletingRevisionId === loadingKey}
                      >
                        禁用
                      </Button>
                    </Popconfirm>
                  </div>
                )
              })
            ) : (
              <Typography.Text type="secondary">暂无可用地图。</Typography.Text>
            )}
          </div>
        </div>

        <div className="map-asset-section">
          <div className="map-asset-section-header">
            <Typography.Text strong>回收站 / 磁盘清理</Typography.Text>
            <Tag>{disabledMapAssets.length}</Tag>
          </div>
          <div className="map-cleanup-controls">
            <Button
              danger
              loading={isCleanupDryRunning || isCleanupExecuting}
              disabled={
                !servicesReady ||
                isAnyEditorActive ||
                disabledMapAssets.length === 0 ||
                isCleanupDryRunning ||
                isCleanupExecuting
              }
              onClick={onCleanupDisabledMapAssets}
            >
              清理已禁用地图资产
            </Button>
          </div>
          <div className="map-asset-list">
            {disabledMapAssets.length > 0 ? (
              disabledMapAssets.map((entry) => {
                const revisionId = getMapRevisionId(entry)
                const protectedAsset = isProtectedMapAsset(entry)
                const releaseDisabled =
                  !servicesReady || isAnyEditorActive || protectedAsset || !revisionId

                return (
                  <div key={`disabled-${entry.mapName}-${revisionId}`} className="map-asset-row">
                    <div className="map-asset-main">
                      <Typography.Text strong ellipsis>
                        {entry.displayName}
                      </Typography.Text>
                      <div className="map-asset-tags">
                        <Tag color="orange">已禁用</Tag>
                        {entry.isActive ? <Tag color="green">当前</Tag> : null}
                        {entry.isRuntime ? <Tag color="blue">运行中</Tag> : null}
                        {entry.isPendingSwitch ? <Tag color="purple">切换中</Tag> : null}
                      </div>
                    </div>
                    <Button
                      danger
                      size="small"
                      disabled={releaseDisabled}
                      loading={hardDeletingRevisionId === revisionId}
                      onClick={() => onHardDeleteMapAsset(entry)}
                    >
                      删除
                    </Button>
                  </div>
                )
              })
            ) : (
              <Typography.Text type="secondary">回收站为空。</Typography.Text>
            )}
          </div>
        </div>
      </Card>

      <Card title="导入当前地图资产" className="workbench-card">
        {mapImportFeedback ? (
          <AppFeedbackBanner
            closable
            tone={mapImportFeedback.type}
            title={
              mapImportFeedback.type === 'success'
                ? '地图资产导入完成'
                : mapImportFeedback.type === 'warning'
                  ? '地图资产导入前置检查未通过'
                  : '地图资产导入失败'
            }
            description={mapImportFeedback.message}
            className="workbench-inline-alert"
            onClose={onClearImportFeedback}
          />
        ) : null}

        <Form<MapAssetImportFormValues>
          form={mapImportForm}
          layout="vertical"
          initialValues={{
            mapName: '',
            description: '',
            setActive: true,
          }}
          className="map-import-form"
        >
          <Form.Item
            name="mapName"
            label="地图名称"
            rules={[{ required: true, message: '请输入已保存的 pbstream 地图名称' }]}
          >
            <Input
              placeholder="请输入保存 pbstream 时使用的同名 map_name"
              disabled={!servicesReady || isAnyEditorActive}
            />
          </Form.Item>

          <Form.Item name="description" label="备注">
            <Input
              placeholder="可选，填写现场说明"
              disabled={!servicesReady || isAnyEditorActive}
            />
          </Form.Item>

          <Form.Item
            name="setActive"
            label="导入后设为当前地图"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="设为当前"
              unCheckedChildren="保持现状"
              disabled={!servicesReady || isAnyEditorActive}
            />
          </Form.Item>

          <Space wrap>
            <Button
              type="primary"
              loading={isCheckingMapImport || isImportingMapAsset}
              disabled={!servicesReady || isAnyEditorActive}
              onClick={onImportCurrentMapAsset}
            >
              {isCheckingMapImport ? '正在检查导入前置条件' : '导入当前地图资产'}
            </Button>
            <Button
              disabled={isImportingMapAsset}
              onClick={() => {
                mapImportForm.resetFields()
                onClearImportFeedback()
              }}
            >
              重置
            </Button>
          </Space>
        </Form>
      </Card>
    </>
  )
}
