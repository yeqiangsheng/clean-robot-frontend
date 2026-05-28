import type { FormInstance } from 'antd'
import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Tag,
} from 'antd'
import { CheckCircleOutlined, PlusOutlined } from '@ant-design/icons'

import { AppEmptyState } from '../../components/feedback/AppEmptyState'
import type { ScheduleDraftInput } from '../../types/schedule'
import type { TaskEntity } from '../../types/task'
import { DOW_OPTIONS } from './scheduleManagementDefaults'

interface ScheduleManagementEditorProps {
  form: FormInstance<ScheduleDraftInput>
  editorMode: 'idle' | 'create' | 'edit'
  isSubmitting: boolean
  tasks: TaskEntity[]
  selectedType: string | undefined
  onSubmit: () => void
  onCancel: () => void
}

export function ScheduleManagementEditor({
  form,
  editorMode,
  isSubmitting,
  tasks,
  selectedType,
  onSubmit,
  onCancel,
}: ScheduleManagementEditorProps) {
  return (
    <Card
      title="调度编辑"
      className="schedule-card"
      extra={
        editorMode === 'create' ? (
          <Tag color="green">新建</Tag>
        ) : editorMode === 'edit' ? (
          <Tag color="blue">编辑</Tag>
        ) : (
          <Tag>空闲</Tag>
        )
      }
    >
      {editorMode === 'idle' ? (
        <AppEmptyState description="可新建调度，或选择已有调度进入编辑。" />
      ) : (
        <Form<ScheduleDraftInput> form={form} layout="vertical" className="schedule-form">
          <Form.Item
            name="scheduleId"
            label="调度 ID"
            rules={[{ required: true, message: '请输入调度 ID。' }]}
          >
            <Input disabled={editorMode === 'edit'} placeholder="schedule_20260409_0930" />
          </Form.Item>

          <Form.Item
            name="taskId"
            label="关联任务"
            rules={[{ required: true, message: '请选择任务。' }]}
          >
            <Select
              showSearch
              placeholder="请选择任务"
              optionFilterProp="label"
              options={tasks.map((task) => ({
                label: `${task.id} / ${task.name}`,
                value: task.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="enabled" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Form.Item
            name="type"
            label="调度类型"
            rules={[{ required: true, message: '请选择调度类型。' }]}
          >
            <Select
              options={[
                { label: '单次', value: 'once' },
                { label: '每日', value: 'daily' },
                { label: '每周', value: 'weekly' },
              ]}
            />
          </Form.Item>

          {selectedType === 'weekly' ? (
            <Form.Item
              name="dow"
              label="星期"
              rules={[
                { required: true, type: 'array', min: 1, message: '请至少选择一个星期。' },
              ]}
            >
              <Checkbox.Group options={DOW_OPTIONS} />
            </Form.Item>
          ) : null}

          {selectedType !== 'once' ? (
            <Form.Item
              name="time"
              label="时间"
              rules={[{ required: true, message: '请输入时间，例如 18:30。' }]}
            >
              <Input placeholder="18:30" />
            </Form.Item>
          ) : null}

          {selectedType === 'once' ? (
            <Form.Item
              name="at"
              label="执行时间"
              rules={[
                {
                  required: true,
                  message: '请输入单次执行时间，例如 2026-04-09 18:30。',
                },
              ]}
            >
              <Input placeholder="2026-04-09 18:30" />
            </Form.Item>
          ) : null}

          <Form.Item
            name="timezone"
            label="时区"
            rules={[{ required: true, message: '请输入时区。' }]}
          >
            <Input placeholder="Asia/Shanghai" />
          </Form.Item>

          {selectedType !== 'once' ? (
            <>
              <Form.Item name="startDate" label="开始日期">
                <Input placeholder="2026-04-09" />
              </Form.Item>

              <Form.Item name="endDate" label="结束日期">
                <Input placeholder="2026-12-31" />
              </Form.Item>
            </>
          ) : null}

          <Space wrap>
            <Button
              type="primary"
              icon={editorMode === 'create' ? <PlusOutlined /> : <CheckCircleOutlined />}
              loading={isSubmitting}
              onClick={() => void onSubmit()}
            >
              {editorMode === 'create' ? '创建调度' : '保存调度'}
            </Button>
            <Button onClick={onCancel}>取消</Button>
          </Space>
        </Form>
      )}
    </Card>
  )
}
