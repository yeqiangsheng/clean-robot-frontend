import { useEffect, useMemo } from 'react'

import { Button, Card, Form, Input, Space, Switch, Typography } from 'antd'

import { buildTimestampedMapName } from '../../utils/slam'

type SaveMapFormValues = {
  saveMapName: string
  includeUnfinishedSubmaps: boolean
  setActiveOnSave: boolean
  switchToLocalizationAfterSave: boolean
  relocalizeAfterSwitch: boolean
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
    const current = form.getFieldValue('saveMapName')

    if (!current || !String(current).trim()) {
      form.setFieldsValue({
        saveMapName: generatedSaveMapName,
      })
    }
  }, [form, generatedSaveMapName])

  return (
    <Card title="保存地图" className="slam-card">
      <Typography.Paragraph className="slam-card-copy">
        这里会调用 `save_map`。`save_map_name` 是输出地图名，建议使用唯一值，避免和已有资源冲突。默认会把新地图设为当前地图，但不会自动切回定位模式。
      </Typography.Paragraph>

      <Form<SaveMapFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          saveMapName: generatedSaveMapName,
          includeUnfinishedSubmaps: false,
          setActiveOnSave: true,
          switchToLocalizationAfterSave: false,
          relocalizeAfterSwitch: false,
        }}
        onFinish={onSubmit}
      >
        <Form.Item
          name="saveMapName"
          label="保存地图名称"
          rules={[{ required: true, message: '请输入 save_map_name。' }]}
        >
          <Input disabled={disabled} placeholder={generatedSaveMapName} />
        </Form.Item>

        <Form.Item
          name="includeUnfinishedSubmaps"
          label="包含未完成子图"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        <Form.Item
          name="setActiveOnSave"
          label="保存后设为当前地图"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        <Form.Item
          name="switchToLocalizationAfterSave"
          label="保存后切回定位模式"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        <Form.Item
          name="relocalizeAfterSwitch"
          label="切回后重新定位"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        <Space wrap>
          <Button type="primary" htmlType="submit" loading={loading} disabled={disabled}>
            保存地图
          </Button>
          <Button disabled={disabled || loading} onClick={() => form.resetFields()}>
            重置
          </Button>
        </Space>
      </Form>
    </Card>
  )
}
