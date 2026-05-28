import { useEffect, useMemo } from 'react'

import { Button, Card, Form, Input, Switch } from 'antd'

import { buildTimestampedMapName } from '../../utils/slam'

type SaveMapFormValues = {
  mapName: string
  setActive: boolean
  description: string
}

type SaveMapFormProps = {
  disabled: boolean
  loading: boolean
  suggestedSaveMapName?: string
  onSubmit: (values: SaveMapFormValues) => void
}

export function SaveMapForm({
  disabled,
  loading,
  suggestedSaveMapName,
  onSubmit,
}: SaveMapFormProps) {
  const [form] = Form.useForm<SaveMapFormValues>()
  const generatedSaveMapName = useMemo(
    () => buildTimestampedMapName(suggestedSaveMapName || 'slam_map'),
    [suggestedSaveMapName],
  )

  useEffect(() => {
    const current = form.getFieldValue('mapName')

    if (!current || !String(current).trim()) {
      form.setFieldsValue({
        mapName: generatedSaveMapName,
      })
    }
  }, [form, generatedSaveMapName])

  return (
    <Card title="保存地图" className="slam-card">
      <Form<SaveMapFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          mapName: generatedSaveMapName,
          setActive: true,
          description: '',
        }}
        onFinish={onSubmit}
      >
        <Form.Item
          name="mapName"
          label="地图名称"
          rules={[{ required: true, message: '请输入要保存的 map_name' }]}
        >
          <Input size="large" disabled={disabled} placeholder={generatedSaveMapName} />
        </Form.Item>

        <Form.Item
          name="setActive"
          label="保存成功后切换为当前活动地图"
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
            保存地图
          </Button>
        </div>
      </Form>
    </Card>
  )
}
