import { useEffect } from 'react'

import { Button, Card, Form, Input, Select, Switch } from 'antd'

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
              size="large"
              showSearch
              allowClear
              disabled={disabled}
              placeholder="请选择目标地图"
              optionFilterProp="label"
              options={mapOptions}
            />
          ) : (
            <Input size="large" disabled={disabled} placeholder="请输入 map_name" />
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

        <div className="slam-form-actions">
          <Button
            block
            size="large"
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={disabled}
          >
            切换地图
          </Button>
        </div>
      </Form>
    </Card>
  )
}
