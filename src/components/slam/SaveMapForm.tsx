import { useEffect, useMemo } from 'react'

import { Button, Card, Form, Input, Space, Switch, Typography } from 'antd'

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
      <Typography.Paragraph className="slam-card-copy">
        通过 `/clean_robot_server/app/submit_slam_command(save_mapping)` 提交保存请求，
        提交字段包括 `map_name / set_active / description`。
      </Typography.Paragraph>

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
          <Input disabled={disabled} placeholder={generatedSaveMapName} />
        </Form.Item>

        <Form.Item
          name="setActive"
          label="保存成功后切换为当前活动地图"
          valuePropName="checked"
        >
          <Switch disabled={disabled} />
        </Form.Item>

        <Form.Item name="description" label="说明">
          <Input disabled={disabled} placeholder="可选，用于记录本次保存原因" />
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
