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

import { manageSchedule } from '../api/gateway/robotGateway'
import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { ScheduleManagementDetail } from '../features/schedule-management/ScheduleManagementDetail'
import { ScheduleManagementEditor } from '../features/schedule-management/ScheduleManagementEditor'
import {
  buildCreateScheduleDefaults,
  buildEditScheduleDefaults,
  getScheduleMetadataEntries,
} from '../features/schedule-management/scheduleManagementDefaults'
import { useScheduleManagementData } from '../features/schedule-management/useScheduleManagementData'
import { useProfileCatalog } from '../hooks/useProfileCatalog'
import { useRosConnection } from '../hooks/useRosConnection'
import type { ScheduleDraftInput } from '../types/schedule'
import { formatProfileDisplayName } from '../utils/profileCatalog'
import './ScheduleManagementPage.css'

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

export function ScheduleManagementPage() {
  const { snapshot, defaultUrl, quickUrls, connect } = useRosConnection()
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [form] = Form.useForm<ScheduleDraftInput>()

  const connectionTag = getConnectionTag(snapshot.status)
  const {
    schedulesQuery,
    tasksQuery,
    detailQuery,
    selectedSchedule,
    selectedScheduleDetail,
    selectedTaskForDetail,
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

  const metadataEntries = getScheduleMetadataEntries(selectedScheduleDetail)

  const renderProfileValue = (profileName: string, kind: 'plan' | 'sys') => {
    if (!profileName.trim()) {
      return '--'
    }

    const catalog = kind === 'plan' ? planProfileCatalog : sysProfileCatalog
    return formatProfileDisplayName(catalog.entryByName.get(profileName) ?? null, profileName)
  }

  useEffect(() => {
    const firstSchedule = schedulesQuery.data?.[0] ?? null

    if (selectedScheduleId === null && firstSchedule) {
      setSelectedScheduleId(firstSchedule.id)
      return
    }

    if (
      selectedScheduleId !== null &&
      schedulesQuery.data &&
      !schedulesQuery.data.some((schedule) => schedule.id === selectedScheduleId)
    ) {
      setSelectedScheduleId(firstSchedule?.id ?? null)
    }
  }, [selectedScheduleId, schedulesQuery.data])

  const handleReconnect = async (url?: string) => {
    await connect((url ?? snapshot.url) || defaultUrl)
    await refetchScheduleData()
  }

  const handleStartCreate = () => {
    setActionError(null)
    form.setFieldsValue(
      buildCreateScheduleDefaults(selectedTaskForDetail ?? tasksQuery.data?.[0] ?? null),
    )
    setEditorMode('create')
  }

  const handleStartEdit = () => {
    if (!selectedScheduleDetail) {
      setActionError('请先选择调度再编辑。')
      return
    }

    setActionError(null)
    form.setFieldsValue(buildEditScheduleDefaults(selectedScheduleDetail))
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
      const selectedTask =
        tasksQuery.data?.find((task) => task.id === values.taskId) ?? selectedTaskInForm

      if (!selectedTask) {
        throw new Error('保存前请选择有效的任务。')
      }

      setActionError(null)
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
        setSelectedScheduleId(result.schedule.id)
      } else {
        const result = await manageSchedule({
          action: 'create',
          input: values,
          task: selectedTask,
        })
        await refetchScheduleData()
        setSelectedScheduleId(result.schedule.id)
      }

      setEditorMode('idle')
      form.resetFields()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return
      }

      setActionError(error instanceof Error ? error.message : '调度保存失败。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedScheduleDetail) {
      return
    }

    try {
      setActionError(null)
      setIsSubmitting(true)
      await manageSchedule({
        action: 'delete',
        scheduleId: selectedScheduleDetail.id,
        taskId: selectedScheduleDetail.taskId,
      })
      await refetchScheduleData()
      setEditorMode('idle')
      form.resetFields()
    } catch (error) {
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
          <Typography.Paragraph>
            这是试点现场的调度 CRUD 页面，底层接入 `/database_server/clean_schedule_service`。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color="gold">调度配置</Tag>
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
          className="schedule-banner"
        />
      ) : null}

      {snapshot.status === 'mock' ? (
        <Alert
          showIcon
          type="info"
          title="当前为 Mock 模式"
          description="如需连接真实后端，请在 `.env.development` 中设置 `VITE_USE_MOCK_DATA=false`。"
          className="schedule-banner"
        />
      ) : null}

      {schedulesQuery.error instanceof Error ? (
        <Alert
          showIcon
          type="error"
          title="调度列表加载失败"
          description={schedulesQuery.error.message}
          className="schedule-banner"
        />
      ) : null}

      {tasksQuery.error instanceof Error ? (
        <Alert
          showIcon
          type="warning"
          title="任务列表不可用"
          description={tasksQuery.error.message}
          className="schedule-banner"
        />
      ) : null}

      {actionError ? (
        <Alert
          showIcon
          type="warning"
          title="调度操作反馈"
          description={actionError}
          className="schedule-banner"
        />
      ) : null}

      {profileCatalogError ? (
        <Alert
          showIcon
          type="warning"
          title="档位目录部分不可用"
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
            {schedulesQuery.isLoading ? (
              <div className="schedule-loading">
                <Spin />
                <Typography.Text>正在加载调度列表...</Typography.Text>
              </div>
            ) : schedulesQuery.data && schedulesQuery.data.length > 0 ? (
              <div className="schedule-list">
                {schedulesQuery.data.map((schedule) => (
                  <button
                    key={schedule.id}
                    type="button"
                    className={`schedule-list-item ${selectedScheduleId === schedule.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedScheduleId(schedule.id)
                      setActionError(null)
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未返回任何调度。" />
            )}
          </Card>
        </aside>

        <main className="schedule-column">
          <ScheduleManagementDetail
            detail={selectedScheduleDetail}
            isLoading={detailQuery.isLoading}
            isRefreshing={detailQuery.isFetching && Boolean(selectedSchedule)}
            error={detailQuery.error instanceof Error ? detailQuery.error.message : null}
            isSubmitting={isSubmitting}
            metadataEntries={metadataEntries}
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
            selectedTask={selectedTaskInForm}
            planProfileLabel={renderProfileValue(selectedTaskInForm?.planProfileName ?? '', 'plan')}
            sysProfileLabel={renderProfileValue(selectedTaskInForm?.sysProfileName ?? '', 'sys')}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
          />

          <Card
            title="当前范围"
            className="schedule-card"
            extra={<UnorderedListOutlined />}
          >
            <ul className="schedule-scope-list">
              {[
                '调度列表查询',
                '调度详情查询',
                '创建单次 / 每日 / 每周调度',
                '更新调度配置',
                '删除调度',
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  )
}
