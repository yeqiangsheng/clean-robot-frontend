import { useEffect, useMemo } from 'react'

import { Button, Card, Form, Input, Space, Switch, Typography } from 'antd'

import { buildTimestampedMapName } from '../../utils/slam'

type StartMappingFormValues = {
  mapName: string
  setActive: boolean
  description: string
}

type StartMappingFormProps = {
  disabled: boolean
  loading: boolean
  suggestedMapName?: string
  onSubmit: (values: StartMappingFormValues) => void
}

export function StartMappingForm({
  disabled,
  loading,
  suggestedMapName,
  onSubmit,
}: StartMappingFormProps) {
  const [form] = Form.useForm<StartMappingFormValues>()
  const generatedMapName = useMemo(
    () =>
      buildTimestampedMapName(
        suggestedMapName ? `${suggestedMapName}_mapping` : 'slam_mapping',
      ),
    [suggestedMapName],
  )

  useEffect(() => {
    const current = form.getFieldValue('mapName')

    if (!current || !String(current).trim()) {
      form.setFieldsValue({
        mapName: generatedMapName,
      })
    }
  }, [form, generatedMapName])

  return (
    <Card title="开始建图" className="slam-card">
      <Typography.Paragraph className="slam-card-copy">
        通过 `/clean_robot_server/app/submit_slam_command(start_mapping)` 提交建图任务，
        开始后页面会继续订阅 `/map` 实时地图。
      </Typography.Paragraph>

      <Form<StartMappingFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          mapName: generatedMapName,
          setActive: true,
          description: '',
        }}
        onFinish={onSubmit}
      >
        <Form.Item
          name="mapName"
          label="地图名称"
          rules={[{ required: true, message: '请输入建图输出的 map_name' }]}
        >
          <Input disabled={disabled} placeholder={generatedMapName} />
        </Form.Item>

        <Form.Item
          name="setActive"
          label="建图完成后切换为当前活动地图"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        <Form.Item name="description" label="说明">
          <Input disabled={disabled} placeholder="可选，用于记录本次建图原因" />
        </Form.Item>

        <Space wrap>
          <Button type="primary" htmlType="submit" loading={loading} disabled={disabled}>
            开始建图
          </Button>
          <Button disabled={disabled || loading} onClick={() => form.resetFields()}>
            重置
          </Button>
        </Space>
      </Form>
    </Card>
  )
}
