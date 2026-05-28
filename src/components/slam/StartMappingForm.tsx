import { useEffect, useMemo } from 'react'

import { Button, Card, Form, Input, Switch } from 'antd'

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
          <Input size="large" disabled={disabled} placeholder={generatedMapName} />
        </Form.Item>

        <Form.Item
          name="setActive"
          label="建图完成后切换为当前活动地图"
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
            开始建图
          </Button>
        </div>
      </Form>
    </Card>
  )
}
