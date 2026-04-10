import { useEffect } from 'react'

import { Button, Card, Form, Input, InputNumber, Space, Switch, Typography } from 'antd'

type SwitchMapFormValues = {
  mapName: string
  frameId: string
  hasInitialPose: boolean
  initialPoseX: number
  initialPoseY: number
  initialPoseYaw: number
}

type SwitchMapFormProps = {
  disabled: boolean
  loading: boolean
  initialMapName?: string
  onSubmit: (values: SwitchMapFormValues) => void
}

export function SwitchMapForm({
  disabled,
  loading,
  initialMapName,
  onSubmit,
}: SwitchMapFormProps) {
  const [form] = Form.useForm<SwitchMapFormValues>()
  const hasInitialPose = Form.useWatch('hasInitialPose', form) ?? false

  useEffect(() => {
    const current = form.getFieldValue('mapName')

    if ((!current || !String(current).trim()) && initialMapName) {
      form.setFieldsValue({
        mapName: initialMapName,
      })
    }
  }, [form, initialMapName])

  return (
    <Card title="切图并定位" className="slam-card">
      <Typography.Paragraph className="slam-card-copy">
        当目标地图已经明确时使用这里。如果自动定位不稳定，可以同时提交一个初始位姿。
      </Typography.Paragraph>

      <Form<SwitchMapFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          mapName: initialMapName ?? '',
          frameId: 'map',
          hasInitialPose: false,
          initialPoseX: 0,
          initialPoseY: 0,
          initialPoseYaw: 0,
        }}
        onFinish={onSubmit}
      >
        <Form.Item
          name="mapName"
          label="目标地图名称"
          rules={[{ required: true, message: '请输入目标 map_name。' }]}
        >
          <Input disabled={disabled} placeholder="0327-1" />
        </Form.Item>

        <Form.Item name="frameId" label="坐标系">
          <Input disabled={disabled} placeholder="map" />
        </Form.Item>

        <Form.Item
          name="hasInitialPose"
          label="附带初始位姿"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        {hasInitialPose ? (
          <div className="slam-inline-grid">
            <Form.Item name="initialPoseX" label="x">
              <InputNumber style={{ width: '100%' }} disabled={disabled} />
            </Form.Item>
            <Form.Item name="initialPoseY" label="y">
              <InputNumber style={{ width: '100%' }} disabled={disabled} />
            </Form.Item>
            <Form.Item name="initialPoseYaw" label="yaw">
              <InputNumber style={{ width: '100%' }} disabled={disabled} />
            </Form.Item>
          </div>
        ) : null}

        <Space wrap>
          <Button type="primary" htmlType="submit" loading={loading} disabled={disabled}>
            切图并定位
          </Button>
          <Button disabled={disabled || loading} onClick={() => form.resetFields()}>
            重置
          </Button>
        </Space>
      </Form>
    </Card>
  )
}
