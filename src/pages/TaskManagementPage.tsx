import { useEffect, useMemo, useState } from 'react'

import { Button, Card, Form, Input, Select, Space, Tag, Typography } from 'antd'
import { PlusOutlined, ReloadOutlined, UnorderedListOutlined } from '@ant-design/icons'

import { manageTask } from '../api/gateway/robotGateway'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { AppLoadingState } from '../components/feedback/AppLoadingState'
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
import { formatNumber } from '../utils/geometry'
import { formatProfileDisplayName } from '../utils/profileCatalog'
import './TaskManagementPage.css'

type EditorMode = 'idle' | 'create' | 'edit'

function getConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: '已连接' }
    case 'connecting':
      return { color: 'processing', label: '连接中' }
    case 'error':
      return { color: 'error', label: '连接异常' }
    case 'mock':
      return { color: 'purple', label: 'Mock 数据' }
    case 'closed':
      return { color: 'warning', label: '连接关闭' }
    default:
      return { color: 'default', label: '未连接' }
  }
}

export function TaskManagementPage() {
  const { snapshot, defaultUrl, connect } = useRosConnection()
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('idle')
  const [taskSearchText, setTaskSearchText] = useState('')
  const [taskSortMode, setTaskSortMode] = useState<'enabled-first' | 'name-asc' | 'id-desc'>(
    'enabled-first',
  )
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
        entry.isActive ? '当前活动地图' : '',
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
      parts.push(`规划档位=${selectedZoneInForm.planProfileName}`)
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
  const visibleTasks = useMemo(() => {
    const normalizedQuery = taskSearchText.trim().toLowerCase()
    const filteredTasks = (tasksQuery.data ?? []).filter((task) => {
      if (!normalizedQuery) {
        return true
      }

      return [
        task.name,
        String(task.id),
        task.mapName,
        task.zoneId,
        task.planProfileName,
        task.sysProfileName,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })

    return [...filteredTasks].sort((left, right) => {
      if (taskSortMode === 'enabled-first' && left.enabled !== right.enabled) {
        return left.enabled ? -1 : 1
      }

      if (taskSortMode === 'id-desc') {
        return right.id - left.id
      }

      return left.name.localeCompare(right.name, 'zh-CN')
    })
  }, [taskSearchText, taskSortMode, tasksQuery.data])
  const selectedTaskHiddenByFilter = Boolean(
    selectedTask &&
      taskSearchText.trim() &&
      !visibleTasks.some((task) => task.id === selectedTask.id),
  )

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
      setActionError('请先选择要编辑的任务。')
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

      setActionError(error instanceof Error ? error.message : '任务操作失败。')
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
            任务 CRUD 统一通过 `/database_server/app/clean_task_service`。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color="gold">任务站点页</Tag>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          <RosbridgeEndpointControl
            snapshot={snapshot}
            defaultUrl={defaultUrl}
            onConnect={handleReconnect}
          />
        </Space>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <AppFeedbackBanner
          tone="error"
          title="ROS 连接异常"
          description={snapshot.lastError}
          className="task-banner"
        />
      ) : null}

      {snapshot.status === 'mock' ? (
        <AppFeedbackBanner
          tone="info"
          title="当前正在使用 Mock 数据"
          description="如果需要接入真实后端，请在 `.env.development` 中设置 `VITE_USE_MOCK_DATA=false`。"
          className="task-banner"
        />
      ) : null}

      {tasksQuery.error instanceof Error ? (
        <AppFeedbackBanner
          tone="error"
          title="任务列表加载失败"
          description={tasksQuery.error.message}
          actionLabel="重试"
          onAction={() => void refetchTaskData()}
          className="task-banner"
        />
      ) : null}

      {actionError ? (
        <AppFeedbackBanner
          tone="warning"
          title="任务操作未完成"
          description={actionError}
          className="task-banner"
        />
      ) : null}

      {editorMode !== 'idle' && profileCatalogError ? (
        <AppFeedbackBanner
          tone="warning"
          title="档位目录加载失败"
          description={profileCatalogError}
          className="task-banner"
        />
      ) : null}

      {editorMode !== 'idle' && editorZoneCatalog.error ? (
        <AppFeedbackBanner
          tone="warning"
          title="区域目录加载失败"
          description={editorZoneCatalog.error.message}
          className="task-banner"
        />
      ) : null}

      {editorMode !== 'idle' && mapCatalog.error ? (
        <AppFeedbackBanner
          tone="warning"
          title="地图目录加载失败"
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
            <div className="task-list-toolbar">
              <Input.Search
                allowClear
                placeholder="搜索任务名、task_id、地图或 zone"
                value={taskSearchText}
                onChange={(event) => setTaskSearchText(event.target.value)}
              />
              <Select
                value={taskSortMode}
                options={[
                  { label: '启用优先', value: 'enabled-first' },
                  { label: '名称排序', value: 'name-asc' },
                  { label: '最新 task_id', value: 'id-desc' },
                ]}
                onChange={(value) => setTaskSortMode(value)}
              />
            </div>

            <Typography.Paragraph className="task-list-summary">
              当前显示 {visibleTasks.length} / {tasksQuery.data?.length ?? 0} 条任务
              {selectedTaskHiddenByFilter ? '，已选任务被当前筛选暂时隐藏。' : '。'}
            </Typography.Paragraph>

            {tasksQuery.isLoading ? (
              <AppLoadingState message="正在加载任务列表..." className="task-loading" />
            ) : visibleTasks.length > 0 ? (
              <div className="task-list">
                {visibleTasks.map((task) => (
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
              <AppEmptyState
                title={taskSearchText.trim() ? '没有匹配的任务' : '暂无任务'}
                description={
                  taskSearchText.trim()
                    ? '当前筛选条件下没有结果，可以清空搜索词后再试。'
                    : '当前还没有可显示的任务记录。'
                }
                actionLabel={taskSearchText.trim() ? '清空筛选' : undefined}
                onAction={taskSearchText.trim() ? () => setTaskSearchText('') : undefined}
              />
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
            title="本页范围"
            className="task-card"
            extra={<UnorderedListOutlined />}
          >
            <ul className="task-scope-list">
              {[
                '任务列表查询',
                '任务详情查看',
                '任务创建',
                '任务修改',
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
