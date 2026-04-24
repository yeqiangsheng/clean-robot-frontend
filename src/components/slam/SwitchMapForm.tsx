import { useEffect } from 'react'

import { Button, Card, Form, Input, Select, Space, Switch, Typography } from 'antd'

type SwitchMapFormValues = {
  mapName: string
  restartLocalizationAfterSwitch: boolean
  description: string
  setActive: boolean
}

type SwitchMapFormProps = {
  disabled: boolean
  loading: boolean
  initialMapName?: string
  mapOptions?: Array<{ label: string; value: string }>
  onSubmit: (values: SwitchMapFormValues) => void
}

export function SwitchMapForm({
  disabled,
  loading,
  initialMapName,
  mapOptions = [],
  onSubmit,
}: SwitchMapFormProps) {
  const [form] = Form.useForm<SwitchMapFormValues>()

  useEffect(() => {
    const current = form.getFieldValue('mapName')

    if ((!current || !String(current).trim()) && initialMapName) {
      form.setFieldsValue({
        mapName: initialMapName,
      })
    }
  }, [form, initialMapName])

  return (
    <Card title="切换地图" className="slam-card">
      <Typography.Paragraph className="slam-card-copy">
        通过 `/clean_robot_server/app/submit_slam_command(switch_map)` 提交切图请求，
        只有在 `can_switch_map` 允许时才能执行。
      </Typography.Paragraph>

      <Form<SwitchMapFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          mapName: initialMapName ?? '',
          restartLocalizationAfterSwitch: true,
          description: '',
          setActive: true,
        }}
        onFinish={onSubmit}
      >
        <Form.Item
          name="mapName"
          label="目标地图"
          rules={[{ required: true, message: '请选择要切换的地图' }]}
        >
          {mapOptions.length > 0 ? (
            <Select
              showSearch
              allowClear
              disabled={disabled}
              placeholder="请选择目标地图"
              optionFilterProp="label"
              options={mapOptions}
            />
          ) : (
            <Input disabled={disabled} placeholder="请输入 map_name" />
          )}
        </Form.Item>

        <Form.Item
          name="restartLocalizationAfterSwitch"
          label="切换后自动重定位"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        <Form.Item
          name="setActive"
          label="切换后设为当前活动地图"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        <Form.Item name="description" label="说明">
          <Input disabled={disabled} placeholder="可选，用于记录本次切图原因" />
        </Form.Item>

        <Space wrap>
          <Button type="primary" htmlType="submit" loading={loading} disabled={disabled}>
            切换地图
          </Button>
          <Button disabled={disabled || loading} onClick={() => form.resetFields()}>
            重置
          </Button>
        </Space>
      </Form>
    </Card>
  )
}
