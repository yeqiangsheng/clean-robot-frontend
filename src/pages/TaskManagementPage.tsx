import { useEffect, useMemo, useState } from 'react'

import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { PlusOutlined, ReloadOutlined, UnorderedListOutlined } from '@ant-design/icons'

import { manageTask } from '../api/gateway/robotGateway'
import { LiveCommandContextCard } from '../components/runtime/LiveCommandContextCard'
import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { TaskManagementDetail } from '../features/task-management/TaskManagementDetail'
import { TaskManagementEditor } from '../features/task-management/TaskManagementEditor'
import {
  buildCreateTaskDefaults,
  buildEditTaskDefaults,
  getMapReferenceLabel,
  getRepeatAfterFullChargeTag,
  getReturnToDockTag,
  getTaskMetadataEntries,
  getTaskStatusTagColor,
  getZoneAvailabilityLabel,
  getZoneReferenceLabel,
} from '../features/task-management/taskManagementDefaults'
import { useTaskManagementData } from '../features/task-management/useTaskManagementData'
import { useCoverageZoneCatalog } from '../hooks/useCoverageZoneCatalog'
import { useMapCatalog } from '../hooks/useMapCatalog'
import { useProfileCatalog } from '../hooks/useProfileCatalog'
import { useRosConnection } from '../hooks/useRosConnection'
import { useExecutionSessionStore } from '../stores/executionSessionStore'
import type { TaskDraftInput } from '../types/task'
import { formatProfileDisplayName } from '../utils/profileCatalog'
import { formatNumber } from '../utils/geometry'
import './TaskManagementPage.css'

type EditorMode = 'idle' | 'create' | 'edit'

function getConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: '已连接' }
    case 'connecting':
      return { color: 'processing', label: '连接中' }
    case 'error':
      return { color: 'error', label: '异常' }
    case 'mock':
      return { color: 'purple', label: 'Mock 数据' }
    case 'closed':
      return { color: 'warning', label: '已断开' }
    default:
      return { color: 'default', label: '空闲' }
  }
}

export function TaskManagementPage() {
  const { snapshot, defaultUrl, quickUrls, connect } = useRosConnection()
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [form] = Form.useForm<TaskDraftInput>()
  const focusedTaskId = useExecutionSessionStore((state) => state.focusedTaskId)
  const setFocusedTaskId = useExecutionSessionStore((state) => state.setFocusedTaskId)
  const setFocusedTaskName = useExecutionSessionStore((state) => state.setFocusedTaskName)

  const connectionTag = getConnectionTag(snapshot.status)
  const {
    tasksQuery,
    detailQuery,
    selectedTask,
    selectedTaskDetail,
    refetchTaskData,
  } = useTaskManagementData(snapshot, selectedTaskId)

  const selectedTaskMapInForm = Form.useWatch('mapName', form)?.trim() ?? ''
  const selectedZoneIdInForm = Form.useWatch('zoneId', form)?.trim() ?? ''
  const selectedPlanProfileNameInForm = Form.useWatch('planProfileName', form)?.trim() ?? ''
  const selectedSysProfileNameInForm = Form.useWatch('sysProfileName', form)?.trim() ?? ''
  const returnToDockOnFinishInForm = Form.useWatch('returnToDockOnFinish', form)
  const repeatAfterFullChargeInForm = Form.useWatch('repeatAfterFullCharge', form)
  const repeatAfterFullChargeEnabledInForm = Boolean(repeatAfterFullChargeInForm)
  const detailMapName = selectedTaskDetail?.mapName?.trim() ?? ''
  const editorMapName = selectedTaskMapInForm

  const mapCatalog = useMapCatalog()
  const detailZoneCatalog = useCoverageZoneCatalog({
    mapName: detailMapName,
    selectedZoneIds: [selectedTaskDetail?.zoneId],
  })
  const editorZoneCatalog = useCoverageZoneCatalog({
    mapName: editorMapName,
    selectedZoneIds: [selectedZoneIdInForm],
  })
  const profileCatalogMapName = editorMapName || detailMapName
  const planProfileCatalog = useProfileCatalog({
    profileKind: 'plan',
    mapName: profileCatalogMapName,
    selectedProfileNames: [
      selectedTaskDetail?.planProfileName,
      selectedPlanProfileNameInForm,
    ],
  })
  const sysProfileCatalog = useProfileCatalog({
    profileKind: 'sys',
    mapName: profileCatalogMapName,
    selectedProfileNames: [
      selectedTaskDetail?.sysProfileName,
      selectedSysProfileNameInForm,
    ],
  })

  const selectedZoneInForm = selectedZoneIdInForm
    ? editorZoneCatalog.entryById.get(selectedZoneIdInForm) ?? null
    : null

  const mapOptions = useMemo(() => {
    const visibleEntries = [...mapCatalog.selectableEntries]
    const selectedDisabledEntry =
      mapCatalog.entryByName.get(editorMapName || detailMapName) ?? null

    if (
      selectedDisabledEntry &&
      !selectedDisabledEntry.enabled &&
      !visibleEntries.some((entry) => entry.mapName === selectedDisabledEntry.mapName)
    ) {
      visibleEntries.push(selectedDisabledEntry)
    }

    return visibleEntries.map((entry) => ({
      label: [
        getMapReferenceLabel(entry),
        entry.isActive ? '当前地图' : '',
        !entry.enabled ? '已禁用' : '',
      ]
        .filter(Boolean)
        .join(' / '),
      value: entry.mapName,
      disabled: !entry.enabled,
    }))
  }, [detailMapName, editorMapName, mapCatalog.entryByName, mapCatalog.selectableEntries])

  const selectedZoneSummary = useMemo(() => {
    if (!selectedZoneInForm) {
      return null
    }

    const parts = [getZoneReferenceLabel(selectedZoneInForm)]

    if (selectedZoneInForm.planProfileName) {
      parts.push(`规划=${selectedZoneInForm.planProfileName}`)
    }

    if (selectedZoneInForm.estimatedLengthM !== null) {
      parts.push(`长度=${formatNumber(selectedZoneInForm.estimatedLengthM, 1)}m`)
    }

    if (selectedZoneInForm.estimatedDurationS !== null) {
      parts.push(`时长=${formatNumber(selectedZoneInForm.estimatedDurationS, 0)}s`)
    }

    const availability = getZoneAvailabilityLabel(selectedZoneInForm.availability)

    if (availability) {
      parts.push(availability)
    }

    return parts.join(' / ')
  }, [selectedZoneInForm])

  const metadataEntries = getTaskMetadataEntries(selectedTaskDetail)

  const renderProfileValue = (profileName: string, kind: 'plan' | 'sys') => {
    if (!profileName.trim()) {
      return '--'
    }

    const catalog = kind === 'plan' ? planProfileCatalog : sysProfileCatalog
    return formatProfileDisplayName(catalog.entryByName.get(profileName) ?? null, profileName)
  }

  const zoneLabel = useMemo(() => {
    if (!selectedTaskDetail?.zoneId.trim()) {
      return '--'
    }

    const entry = detailZoneCatalog.entryById.get(selectedTaskDetail.zoneId)

    if (!entry) {
      return selectedTaskDetail.zoneId
    }

    const availability = getZoneAvailabilityLabel(entry.availability)
    return availability
      ? `${getZoneReferenceLabel(entry)} [${availability}]`
      : getZoneReferenceLabel(entry)
  }, [detailZoneCatalog.entryById, selectedTaskDetail])

  useEffect(() => {
    const firstTask = tasksQuery.data?.[0] ?? null

    if (
      focusedTaskId !== null &&
      tasksQuery.data?.some((task) => task.id === focusedTaskId) &&
      selectedTaskId !== focusedTaskId
    ) {
      setSelectedTaskId(focusedTaskId)
      return
    }

    if (selectedTaskId === null && firstTask) {
      setSelectedTaskId(firstTask.id)
      setFocusedTaskId(firstTask.id)
      return
    }

    if (
      selectedTaskId !== null &&
      tasksQuery.data &&
      !tasksQuery.data.some((task) => task.id === selectedTaskId)
    ) {
      setSelectedTaskId(firstTask?.id ?? null)
      setFocusedTaskId(firstTask?.id ?? null)
    }
  }, [focusedTaskId, selectedTaskId, setFocusedTaskId, tasksQuery.data])

  useEffect(() => {
    if (selectedTaskDetail) {
      setFocusedTaskName(selectedTaskDetail.name)
    }
  }, [selectedTaskDetail, setFocusedTaskName])

  useEffect(() => {
    if (editorMode === 'idle') {
      return
    }

    if (repeatAfterFullChargeEnabledInForm && !returnToDockOnFinishInForm) {
      form.setFieldsValue({ returnToDockOnFinish: true })
    }
  }, [
    editorMode,
    form,
    repeatAfterFullChargeEnabledInForm,
    returnToDockOnFinishInForm,
  ])

  const handleReconnect = async (url?: string) => {
    await connect((url ?? snapshot.url) || defaultUrl)
    await refetchTaskData()
  }

  const handleStartCreate = () => {
    setActionError(null)
    form.setFieldsValue(buildCreateTaskDefaults(selectedTaskDetail))
    setEditorMode('create')
  }

  const handleStartEdit = () => {
    if (!selectedTaskDetail) {
      setActionError('请先选择任务再编辑。')
      return
    }

    setActionError(null)
    form.setFieldsValue(buildEditTaskDefaults(selectedTaskDetail))
    setEditorMode('edit')
  }

  const handleCancelEdit = () => {
    setEditorMode('idle')
    setActionError(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setActionError(null)
      setIsSubmitting(true)

      if (editorMode === 'edit') {
        if (!selectedTaskDetail) {
          throw new Error('当前没有可编辑的任务详情。')
        }

        const result = await manageTask({
          action: 'update',
          task: selectedTaskDetail,
          input: values,
        })
        await refetchTaskData()
        setSelectedTaskId(result.task.id)
      } else {
        const result = await manageTask({
          action: 'create',
          input: values,
        })
        const refreshedTasks = (await tasksQuery.refetch()).data ?? []
        const createdTask =
          refreshedTasks.find((task) => task.id === result.task.id) ??
          refreshedTasks.find((task) => task.name === result.task.name) ??
          null

        setSelectedTaskId(createdTask?.id ?? result.task.id)
        setFocusedTaskId(createdTask?.id ?? result.task.id)
      }

      setEditorMode('idle')
      form.resetFields()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return
      }

      setActionError(error instanceof Error ? error.message : '任务保存失败。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedTaskDetail) {
      return
    }

    try {
      setActionError(null)
      setIsSubmitting(true)
      await manageTask({
        action: 'delete',
        taskId: selectedTaskDetail.id,
      })
      await refetchTaskData()
      setEditorMode('idle')
      form.resetFields()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '任务删除失败。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const profileCatalogError =
    planProfileCatalog.error?.message ?? sysProfileCatalog.error?.message ?? null

  return (
    <div className="task-page">
      <header className="task-page-header">
        <div>
          <Typography.Title level={2}>任务管理</Typography.Title>
          <Typography.Paragraph>
            这是试点现场的任务 CRUD 页面，底层接入 `/database_server/clean_task_service`。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color="gold">任务配置</Tag>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          <RosbridgeEndpointControl
            snapshot={snapshot}
            defaultUrl={defaultUrl}
            quickUrls={quickUrls}
            onConnect={handleReconnect}
          />
        </Space>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <Alert
          showIcon
          type="error"
          title="rosbridge 连接失败"
          description={snapshot.lastError}
          className="task-banner"
        />
      ) : null}

      {snapshot.status === 'mock' ? (
        <Alert
          showIcon
          type="info"
          title="当前为 Mock 模式"
          description="如需连接真实后端，请在 `.env.development` 中设置 `VITE_USE_MOCK_DATA=false`。"
          className="task-banner"
        />
      ) : null}

      {tasksQuery.error instanceof Error ? (
        <Alert
          showIcon
          type="error"
          title="任务列表加载失败"
          description={tasksQuery.error.message}
          className="task-banner"
        />
      ) : null}

      {actionError ? (
        <Alert
          showIcon
          type="warning"
          title="任务操作反馈"
          description={actionError}
          className="task-banner"
        />
      ) : null}

      {editorMode !== 'idle' && profileCatalogError ? (
        <Alert
          showIcon
          type="warning"
          title="档位目录部分不可用"
          description={profileCatalogError}
          className="task-banner"
        />
      ) : null}

      {editorMode !== 'idle' && editorZoneCatalog.error ? (
        <Alert
          showIcon
          type="warning"
          title="区域目录不可用"
          description={editorZoneCatalog.error.message}
          className="task-banner"
        />
      ) : null}

      {editorMode !== 'idle' && mapCatalog.error ? (
        <Alert
          showIcon
          type="warning"
          title="地图目录不可用"
          description={mapCatalog.error.message}
          className="task-banner"
        />
      ) : null}

      <div className="task-grid">
        <aside className="task-column">
          <Card
            title="任务列表"
            className="task-card"
            extra={
              <Space size="small" wrap>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => void refetchTaskData()}>
                  刷新
                </Button>
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleStartCreate}>
                  新建任务
                </Button>
              </Space>
            }
          >
            {tasksQuery.isLoading ? (
              <div className="task-loading">
                <Spin />
                <Typography.Text>正在加载任务列表...</Typography.Text>
              </div>
            ) : tasksQuery.data && tasksQuery.data.length > 0 ? (
              <div className="task-list">
                {tasksQuery.data.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className={`task-list-item ${selectedTaskId === task.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedTaskId(task.id)
                      setFocusedTaskId(task.id)
                      setActionError(null)
                    }}
                  >
                    <span className="task-list-main">
                      <span className="task-list-title">{task.name}</span>
                      <span className="task-list-id">{task.id}</span>
                    </span>
                    <span className="task-list-tags">
                      <Tag color={task.enabled ? 'green' : 'default'}>
                        {task.enabled ? '启用' : '禁用'}
                      </Tag>
                      <Tag color={getTaskStatusTagColor(task.status)}>{task.status ?? '--'}</Tag>
                      <Tag color={getReturnToDockTag(task.returnToDockOnFinish).color}>
                        {getReturnToDockTag(task.returnToDockOnFinish).label}
                      </Tag>
                      <Tag color={getRepeatAfterFullChargeTag(task.repeatAfterFullCharge).color}>
                        {getRepeatAfterFullChargeTag(task.repeatAfterFullCharge).label}
                      </Tag>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未返回任何任务。" />
            )}
          </Card>
        </aside>

        <main className="task-column">
          <TaskManagementDetail
            detail={selectedTaskDetail}
            isLoading={detailQuery.isLoading}
            isRefreshing={detailQuery.isFetching && Boolean(selectedTask)}
            error={detailQuery.error instanceof Error ? detailQuery.error.message : null}
            isSubmitting={isSubmitting}
            metadataEntries={metadataEntries}
            zoneLabel={zoneLabel}
            planProfileLabel={renderProfileValue(selectedTaskDetail?.planProfileName ?? '', 'plan')}
            sysProfileLabel={renderProfileValue(selectedTaskDetail?.sysProfileName ?? '', 'sys')}
            onEdit={handleStartEdit}
            onDelete={handleDelete}
          />
        </main>

        <aside className="task-column">
          <TaskManagementEditor
            form={form}
            editorMode={editorMode}
            isSubmitting={isSubmitting}
            mapOptions={mapOptions}
            zoneOptions={editorZoneCatalog.selectOptions}
            planProfileOptions={planProfileCatalog.selectOptions}
            sysProfileOptions={sysProfileCatalog.selectOptions}
            mapLoading={mapCatalog.isLoading || mapCatalog.isFetching}
            zoneLoading={editorZoneCatalog.isLoading || editorZoneCatalog.isFetching}
            planProfileLoading={planProfileCatalog.isLoading || planProfileCatalog.isFetching}
            sysProfileLoading={sysProfileCatalog.isLoading || sysProfileCatalog.isFetching}
            editorMapName={editorMapName}
            selectedZoneSummary={selectedZoneSummary}
            repeatAfterFullChargeEnabled={repeatAfterFullChargeEnabledInForm}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
            onMapChange={() => {
              if (form.getFieldValue('zoneId')) {
                form.setFields([{ name: 'zoneId', value: undefined }])
              }
            }}
          />

          <Card
            title="当前范围"
            className="task-card"
            extra={<UnorderedListOutlined />}
          >
            <ul className="task-scope-list">
              {[
                '任务列表查询',
                '任务详情查询',
                '任务创建',
                '任务更新',
                '任务删除',
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>

          <LiveCommandContextCard selectedTask={selectedTaskDetail} />
        </aside>
      </div>
    </div>
  )
}
