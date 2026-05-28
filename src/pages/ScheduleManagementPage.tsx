import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'

import { manageSchedule } from '../api/gateway/scheduleGateway'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { AppLoadingState } from '../components/feedback/AppLoadingState'
import { ScheduleManagementDetail } from '../features/schedule-management/ScheduleManagementDetail'
import { ScheduleManagementEditor } from '../features/schedule-management/ScheduleManagementEditor'
import {
  buildCreateScheduleDefaults,
  buildEditScheduleDefaults,
} from '../features/schedule-management/scheduleManagementDefaults'
import { useScheduleManagementData } from '../features/schedule-management/useScheduleManagementData'
import { useProfileCatalog } from '../hooks/useProfileCatalog'
import { useRosConnection } from '../hooks/useRosConnection'
import type { ScheduleDraftInput } from '../types/schedule'
import { formatProfileDisplayName } from '../utils/profileCatalog'
import './ScheduleManagementPage.css'

type EditorMode = 'idle' | 'create' | 'edit'

function getResultMessage(result: unknown) {
  if (typeof result !== 'object' || result === null || !('message' in result)) {
    return ''
  }

  const message = (result as { message?: unknown }).message
  return typeof message === 'string' ? message.trim() : ''
}

export function ScheduleManagementPage() {
  const { snapshot } = useRosConnection()
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('idle')
  const [scheduleSearchText, setScheduleSearchText] = useState('')
  const [scheduleSortMode, setScheduleSortMode] = useState<
    'enabled-first' | 'task-name' | 'recent-fire'
  >('enabled-first')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [autoSelectFirstSchedule, setAutoSelectFirstSchedule] = useState(true)
  const [form] = Form.useForm<ScheduleDraftInput>()

  const {
    schedulesQuery,
    tasksQuery,
    detailQuery,
    selectedSchedule,
    selectedScheduleDetail,
    selectedTaskForDetail,
    detailNotFound,
    refetchScheduleData,
  } = useScheduleManagementData(snapshot, selectedScheduleId)

  const selectedTaskIdInForm = Form.useWatch('taskId', form) ?? 0
  const selectedTypeInForm = Form.useWatch('type', form)
  const selectedTaskInForm = useMemo(
    () => tasksQuery.data?.find((task) => task.id === selectedTaskIdInForm) ?? null,
    [selectedTaskIdInForm, tasksQuery.data],
  )

  const scheduleProfileCatalogMapName =
    selectedTaskInForm?.mapName || selectedScheduleDetail?.mapName || ''
  const planProfileCatalog = useProfileCatalog({
    profileKind: 'plan',
    mapName: scheduleProfileCatalogMapName,
    selectedProfileNames: [
      selectedScheduleDetail?.planProfileName,
      selectedTaskInForm?.planProfileName,
    ],
  })
  const sysProfileCatalog = useProfileCatalog({
    profileKind: 'sys',
    mapName: scheduleProfileCatalogMapName,
    selectedProfileNames: [
      selectedScheduleDetail?.sysProfileName,
      selectedTaskInForm?.sysProfileName,
    ],
  })

  const visibleSchedules = useMemo(() => {
    const normalizedQuery = scheduleSearchText.trim().toLowerCase()
    const filteredSchedules = (schedulesQuery.data ?? []).filter((schedule) => {
      if (!normalizedQuery) {
        return true
      }

      return [
        schedule.id,
        schedule.taskName,
        String(schedule.taskId),
        schedule.type,
        schedule.time,
        schedule.timezone,
        schedule.mapName,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })

    return [...filteredSchedules].sort((left, right) => {
      if (scheduleSortMode === 'enabled-first' && left.enabled !== right.enabled) {
        return left.enabled ? -1 : 1
      }

      if (scheduleSortMode === 'recent-fire') {
        return (right.lastFireTs ?? 0) - (left.lastFireTs ?? 0)
      }

      return (left.taskName || left.id).localeCompare(right.taskName || right.id, 'zh-CN')
    })
  }, [scheduleSearchText, scheduleSortMode, schedulesQuery.data])
  const selectedScheduleHiddenByFilter = Boolean(
    selectedSchedule &&
      scheduleSearchText.trim() &&
      !visibleSchedules.some((schedule) => schedule.id === selectedSchedule.id),
  )

  const renderProfileValue = (profileName: string, kind: 'plan' | 'sys') => {
    if (!profileName.trim()) {
      return '--'
    }

    const catalog = kind === 'plan' ? planProfileCatalog : sysProfileCatalog
    return formatProfileDisplayName(catalog.entryByName.get(profileName) ?? null, profileName)
  }

  useEffect(() => {
    const firstSchedule = schedulesQuery.data?.[0] ?? null

    if (selectedScheduleId === null && firstSchedule && autoSelectFirstSchedule) {
      setSelectedScheduleId(firstSchedule.id)
      return
    }

    if (
      selectedScheduleId !== null &&
      schedulesQuery.data &&
      !schedulesQuery.data.some((schedule) => schedule.id === selectedScheduleId)
    ) {
      setAutoSelectFirstSchedule(false)
      setSelectedScheduleId(null)
    }
  }, [autoSelectFirstSchedule, selectedScheduleId, schedulesQuery.data])

  useEffect(() => {
    if (!detailNotFound) {
      return
    }

    setAutoSelectFirstSchedule(false)
    setSelectedScheduleId(null)
    setEditorMode('idle')
    form.resetFields()
  }, [detailNotFound, form])

  const handleStartCreate = () => {
    setActionError(null)
    setActionSuccess(null)
    form.setFieldsValue(
      buildCreateScheduleDefaults(selectedTaskForDetail ?? tasksQuery.data?.[0] ?? null),
    )
    setEditorMode('create')
  }

  const handleStartEdit = () => {
    if (!selectedScheduleDetail) {
      setActionError('请先选择要编辑的调度。')
      return
    }

    setActionError(null)
    setActionSuccess(null)
    form.setFieldsValue(buildEditScheduleDefaults(selectedScheduleDetail))
    setEditorMode('edit')
  }

  const handleCancelEdit = () => {
    setEditorMode('idle')
    setActionError(null)
    setActionSuccess(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const selectedTask =
        tasksQuery.data?.find((task) => task.id === values.taskId) ?? selectedTaskInForm

      if (!selectedTask) {
        throw new Error('请选择一个有效任务。')
      }

      setActionError(null)
      setActionSuccess(null)
      setIsSubmitting(true)

      if (editorMode === 'edit') {
        if (!selectedScheduleDetail) {
          throw new Error('当前没有可编辑的调度详情。')
        }

        const result = await manageSchedule({
          action: 'update',
          schedule: selectedScheduleDetail,
          input: values,
          task: selectedTask,
        })
        await refetchScheduleData()
        setAutoSelectFirstSchedule(true)
        setSelectedScheduleId(result.schedule.id)
        setActionSuccess(`调度 ${result.schedule.id} 已保存。`)
      } else {
        const result = await manageSchedule({
          action: 'create',
          input: values,
          task: selectedTask,
        })
        await refetchScheduleData()
        setAutoSelectFirstSchedule(true)
        setSelectedScheduleId(result.schedule.id)
        setActionSuccess(`调度 ${result.schedule.id} 已创建。`)
      }

      setEditorMode('idle')
      form.resetFields()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return
      }

      setActionSuccess(null)
      setActionError(error instanceof Error ? error.message : '调度操作失败。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedScheduleDetail) {
      return
    }

    try {
      const deletedScheduleId = selectedScheduleDetail.id
      setActionError(null)
      setActionSuccess(null)
      setIsSubmitting(true)
      const result = await manageSchedule({
        action: 'delete',
        scheduleId: deletedScheduleId,
        taskId: selectedScheduleDetail.taskId,
      })
      const backendMessage = getResultMessage(result) || 'deleted'
      setAutoSelectFirstSchedule(false)
      setSelectedScheduleId(null)
      await refetchScheduleData({ includeDetail: false })
      setEditorMode('idle')
      form.resetFields()
      setActionSuccess(`调度 ${deletedScheduleId} 已删除，后端返回：${backendMessage}。`)
    } catch (error) {
      setActionSuccess(null)
      setActionError(error instanceof Error ? error.message : '调度删除失败。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const profileCatalogError =
    planProfileCatalog.error?.message ?? sysProfileCatalog.error?.message ?? null

  return (
    <div className="schedule-page">
      <header className="schedule-page-header">
        <div>
          <Typography.Title level={2}>调度管理</Typography.Title>
        </div>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <AppFeedbackBanner
          tone="error"
          title="ROS 连接异常"
          description={snapshot.lastError}
          className="schedule-banner"
        />
      ) : null}

      {schedulesQuery.error instanceof Error ? (
        <AppFeedbackBanner
          tone="error"
          title="调度列表加载失败"
          description={schedulesQuery.error.message}
          actionLabel="重试"
          onAction={() => void refetchScheduleData()}
          className="schedule-banner"
        />
      ) : null}

      {tasksQuery.error instanceof Error ? (
        <AppFeedbackBanner
          tone="warning"
          title="任务目录加载失败"
          description={tasksQuery.error.message}
          actionLabel="重试"
          onAction={() => void refetchScheduleData()}
          className="schedule-banner"
        />
      ) : null}

      {actionError ? (
        <AppFeedbackBanner
          tone="warning"
          title="调度操作未完成"
          description={actionError}
          className="schedule-banner"
        />
      ) : null}

      {actionSuccess ? (
        <AppFeedbackBanner
          closable
          tone="success"
          title="调度操作已完成"
          description={actionSuccess}
          className="schedule-banner"
          onClose={() => setActionSuccess(null)}
        />
      ) : null}

      {profileCatalogError ? (
        <AppFeedbackBanner
          tone="warning"
          title="档位目录加载失败"
          description={profileCatalogError}
          className="schedule-banner"
        />
      ) : null}

      <div className="schedule-grid">
        <aside className="schedule-column">
          <Card
            title="调度列表"
            className="schedule-card"
            extra={
              <Space size="small" wrap>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => void refetchScheduleData()}>
                  刷新
                </Button>
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleStartCreate}>
                  新建调度
                </Button>
              </Space>
            }
          >
            <div className="schedule-list-toolbar">
              <Input.Search
                allowClear
                placeholder="搜索 schedule_id、任务、类型或时间"
                value={scheduleSearchText}
                onChange={(event) => setScheduleSearchText(event.target.value)}
              />
              <Select
                value={scheduleSortMode}
                options={[
                  { label: '启用优先', value: 'enabled-first' },
                  { label: '按任务排序', value: 'task-name' },
                  { label: '最近触发优先', value: 'recent-fire' },
                ]}
                onChange={(value) => setScheduleSortMode(value)}
              />
            </div>

            <Typography.Paragraph className="schedule-list-summary">
              当前显示 {visibleSchedules.length} / {schedulesQuery.data?.length ?? 0} 条调度
              {selectedScheduleHiddenByFilter ? '，已选调度被当前筛选暂时隐藏。' : '。'}
            </Typography.Paragraph>

            {schedulesQuery.isLoading ? (
              <AppLoadingState message="正在加载调度列表..." className="schedule-loading" />
            ) : visibleSchedules.length > 0 ? (
              <div className="schedule-list">
                {visibleSchedules.map((schedule) => (
                  <button
                    key={schedule.id}
                    type="button"
                    className={`schedule-list-item ${selectedScheduleId === schedule.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedScheduleId(schedule.id)
                      setAutoSelectFirstSchedule(true)
                      setActionError(null)
                      setActionSuccess(null)
                    }}
                  >
                    <span className="schedule-list-main">
                      <span className="schedule-list-title">{schedule.id}</span>
                      <span className="schedule-list-subtle">
                        {schedule.taskName || `task_id=${schedule.taskId}`}
                      </span>
                    </span>
                    <span className="schedule-list-tags">
                      <Tag color={schedule.enabled ? 'green' : 'default'}>
                        {schedule.enabled ? '启用' : '禁用'}
                      </Tag>
                      <Tag color="blue">{schedule.type || '--'}</Tag>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <AppEmptyState
                title={scheduleSearchText.trim() ? '没有匹配的调度' : '暂无调度'}
                description={
                  scheduleSearchText.trim()
                    ? '当前筛选条件下没有结果，可以清空搜索词后再试。'
                    : '当前还没有可显示的调度记录。'
                }
                actionLabel={scheduleSearchText.trim() ? '清空筛选' : undefined}
                onAction={scheduleSearchText.trim() ? () => setScheduleSearchText('') : undefined}
              />
            )}
          </Card>
        </aside>

        <main className="schedule-column">
          <ScheduleManagementDetail
            detail={selectedScheduleDetail}
            isLoading={detailQuery.isLoading}
            isRefreshing={detailQuery.isFetching && Boolean(selectedSchedule)}
            error={
              !detailNotFound && detailQuery.error instanceof Error
                ? detailQuery.error.message
                : null
            }
            notFound={detailNotFound}
            isSubmitting={isSubmitting}
            planProfileLabel={renderProfileValue(selectedScheduleDetail?.planProfileName ?? '', 'plan')}
            sysProfileLabel={renderProfileValue(selectedScheduleDetail?.sysProfileName ?? '', 'sys')}
            onEdit={handleStartEdit}
            onDelete={handleDelete}
          />
        </main>

        <aside className="schedule-column">
          <ScheduleManagementEditor
            form={form}
            editorMode={editorMode}
            isSubmitting={isSubmitting}
            tasks={tasksQuery.data ?? []}
            selectedType={selectedTypeInForm}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
          />
        </aside>
      </div>
    </div>
  )
}
