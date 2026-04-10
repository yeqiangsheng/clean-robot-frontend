import { Drawer, Typography } from 'antd'

type JsonViewerDrawerProps = {
  open: boolean
  title: string
  payload: unknown
  onClose: () => void
}

export function JsonViewerDrawer({
  open,
  title,
  payload,
  onClose,
}: JsonViewerDrawerProps) {
  return (
    <Drawer
      title={title}
      placement="right"
      size={560}
      open={open}
      onClose={onClose}
    >
      <Typography.Paragraph className="slam-json-drawer-copy">
        原始 JSON 会保留在这里，方便现场调试和结果核对；主页面只展示最关键的字段。
      </Typography.Paragraph>
      <pre className="slam-json-pre">{JSON.stringify(payload, null, 2)}</pre>
    </Drawer>
  )
}
