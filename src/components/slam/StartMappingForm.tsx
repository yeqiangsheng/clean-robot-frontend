import { useEffect, useMemo } from 'react'

import { Button, Card, Form, Input, Space, Typography } from 'antd'

import { buildTimestampedMapName } from '../../utils/slam'

type StartMappingFormValues = {
  mapName: string
  frameId: string
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
        这里会启动一次新的建图会话。建议使用唯一地图名称，并在停止建图前先保存地图，避免当前成果丢失。
      </Typography.Paragraph>

      <Form<StartMappingFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          mapName: generatedMapName,
          frameId: 'map',
        }}
        onFinish={onSubmit}
      >
        <Form.Item
          name="mapName"
          label="地图名称"
          rules={[{ required: true, message: '请输入建图 map_name。' }]}
        >
          <Input disabled={disabled} placeholder={generatedMapName} />
        </Form.Item>

        <Form.Item name="frameId" label="坐标系">
          <Input disabled={disabled} placeholder="map" />
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
