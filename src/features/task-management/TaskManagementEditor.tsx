import type { FormInstance } from 'antd'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { CheckCircleOutlined, PlusOutlined } from '@ant-design/icons'

import { AppEmptyState } from '../../components/feedback/AppEmptyState'
import { AppLoadingState } from '../../components/feedback/AppLoadingState'
import type { TaskDraftInput } from '../../types/task'
import { STANDARD_CLEAN_MODE_SELECT_OPTIONS } from '../../utils/cleanMode'

interface TaskManagementEditorProps {
  form: FormInstance<TaskDraftInput>
  editorMode: 'idle' | 'create' | 'edit'
  isSubmitting: boolean
  mapOptions: Array<{ label: string; value: string; disabled?: boolean }>
  zoneOptions: Array<{ label: string; value: string }>
  planProfileOptions: Array<{ label: string; value: string }>
  sysProfileOptions: Array<{ label: string; value: string }>
  mapLoading: boolean
  zoneLoading: boolean
  planProfileLoading: boolean
  sysProfileLoading: boolean
  editorMapName: string
  selectedZoneSummary: string | null
  repeatAfterFullChargeEnabled: boolean
  onSubmit: () => void
  onCancel: () => void
  onMapChange: () => void
}

function renderSelectLoading(message: string) {
  return <AppLoadingState compact message={message} />
}

export function TaskManagementEditor({
  form,
  editorMode,
  isSubmitting,
  mapOptions,
  zoneOptions,
  planProfileOptions,
  sysProfileOptions,
  mapLoading,
  zoneLoading,
  planProfileLoading,
  sysProfileLoading,
  editorMapName,
  selectedZoneSummary,
  repeatAfterFullChargeEnabled,
  onSubmit,
  onCancel,
  onMapChange,
}: TaskManagementEditorProps) {
  return (
    <Card
      title="任务编辑"
      className="task-card"
      extra={
        editorMode === 'create' ? (
          <Tag color="green">新建</Tag>
        ) : editorMode === 'edit' ? (
          <Tag color="blue">编辑中</Tag>
        ) : (
          <Tag>空闲</Tag>
        )
      }
    >
      {editorMode === 'idle' ? (
        <AppEmptyState description="可新建任务，或选择已有任务进入编辑。" />
      ) : (
        <Form<TaskDraftInput> form={form} layout="vertical" className="task-form">
          <Form.Item
            name="taskId"
            label="任务 ID"
            extra="填 0 时由后端自动分配 task_id。"
          >
            <InputNumber
              disabled={editorMode === 'edit'}
              min={0}
              precision={0}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称。' }]}
          >
            <Input placeholder="例如：daily_zone_a" />
          </Form.Item>

          <Form.Item name="enabled" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Form.Item
            name="status"
            label="状态码"
            rules={[{ required: true, message: '请输入状态码。' }]}
          >
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="mapName"
            label="地图名称"
            extra="区域下拉选项会随当前所选地图加载。"
            rules={[{ required: true, message: '请选择地图。' }]}
          >
            <Select
              showSearch
              loading={mapLoading}
              options={mapOptions}
              optionFilterProp="label"
              placeholder="请选择地图"
              notFoundContent={
                mapLoading ? renderSelectLoading('加载地图中...') : '暂无可选地图'
              }
              onChange={onMapChange}
            />
          </Form.Item>

          <Form.Item
            name="zoneId"
            label="作业区域"
            rules={[{ required: true, message: '请选择区域。' }]}
          >
            <Select
              showSearch
              disabled={!editorMapName}
              loading={zoneLoading}
              options={zoneOptions}
              optionFilterProp="label"
              placeholder={editorMapName ? '请选择区域' : '请先选择地图'}
              notFoundContent={
                zoneLoading
                  ? renderSelectLoading('加载区域中...')
                  : '当前地图下暂无可选区域'
              }
            />
          </Form.Item>

          {selectedZoneSummary ? (
            <Typography.Paragraph className="task-footnote">
              {selectedZoneSummary}
            </Typography.Paragraph>
          ) : null}

          <Form.Item
            name="planProfileName"
            label="规划档位"
            rules={[{ required: true, message: '请选择规划档位。' }]}
          >
            <Select
              showSearch
              loading={planProfileLoading}
              options={planProfileOptions}
              optionFilterProp="label"
              placeholder="请选择规划档位"
              notFoundContent={
                planProfileLoading
                  ? renderSelectLoading('加载规划档位中...')
                  : '暂无可选规划档位'
              }
            />
          </Form.Item>

          <Form.Item
            name="sysProfileName"
            label="系统档位"
            rules={[{ required: true, message: '请选择系统档位。' }]}
          >
            <Select
              showSearch
              loading={sysProfileLoading}
              options={sysProfileOptions}
              optionFilterProp="label"
              placeholder="请选择系统档位"
              notFoundContent={
                sysProfileLoading
                  ? renderSelectLoading('加载系统档位中...')
                  : '暂无可选系统档位'
              }
            />
          </Form.Item>

          <Form.Item
            name="cleanMode"
            label="清洁模式"
            rules={[{ required: true, message: '请选择清洁模式。' }]}
          >
            <Select
              showSearch
              options={STANDARD_CLEAN_MODE_SELECT_OPTIONS}
              optionFilterProp="label"
              placeholder="请选择清洁模式"
            />
          </Form.Item>

          <Form.Item
            name="returnToDockOnFinish"
            label="完成后是否回桩"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="回桩"
              unCheckedChildren="原地"
              disabled={repeatAfterFullChargeEnabled}
            />
          </Form.Item>

          <Form.Item
            name="repeatAfterFullCharge"
            label="满电后是否续扫"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="续扫"
              unCheckedChildren="不续扫"
              onChange={(checked) => {
                if (checked) {
                  form.setFieldsValue({ returnToDockOnFinish: true })
                }
              }}
            />
          </Form.Item>

          <Form.Item
            name="loops"
            label="循环次数"
            rules={[{ required: true, message: '请输入循环次数。' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>

          <Space wrap>
            <Button
              type="primary"
              icon={editorMode === 'create' ? <PlusOutlined /> : <CheckCircleOutlined />}
              loading={isSubmitting}
              onClick={() => void onSubmit()}
            >
              {editorMode === 'create' ? '创建任务' : '保存任务'}
            </Button>
            <Button onClick={onCancel}>取消</Button>
          </Space>

          <Typography.Paragraph className="task-footnote">
            后端校验错误会直接展示，方便现场在不中断上下文的情况下查看真实失败原因。
          </Typography.Paragraph>
        </Form>
      )}
    </Card>
  )
}
