import { useMemo, useState } from 'react'

import { AutoComplete, Button, Space, Typography } from 'antd'

import type { RosConnectionSnapshot } from '../../types/ros'

interface RosbridgeEndpointControlProps {
  snapshot: RosConnectionSnapshot
  defaultUrl: string
  quickUrls: string[]
  onConnect: (url: string) => Promise<void>
}

function normalizeUrl(value: string) {
  return value.trim()
}

function isValidRosbridgeUrl(value: string) {
  const normalized = normalizeUrl(value).toLowerCase()
  return normalized.startsWith('ws://') || normalized.startsWith('wss://')
}

export function RosbridgeEndpointControl({
  snapshot,
  defaultUrl,
  quickUrls,
  onConnect,
}: RosbridgeEndpointControlProps) {
  const [draftState, setDraftState] = useState({
    sourceUrl: snapshot.url,
    value: snapshot.url,
  })

  const normalizedCurrentUrl = normalizeUrl(snapshot.url)
  const draftUrl =
    draftState.sourceUrl === snapshot.url ? draftState.value : snapshot.url
  const normalizedDraftUrl = normalizeUrl(draftUrl)
  const disabled = snapshot.status === 'mock'

  const endpointOptions = useMemo(
    () =>
      quickUrls.map((url) => {
        const tags = [
          url === defaultUrl ? '默认' : '',
          url === normalizedCurrentUrl ? '当前' : '',
        ].filter((value) => value.length > 0)

        return {
          value: url,
          label: tags.length > 0 ? `${url} (${tags.join(', ')})` : url,
        }
      }),
    [defaultUrl, normalizedCurrentUrl, quickUrls],
  )

  return (
    <Space size="small" wrap>
      <Typography.Text code>{snapshot.url}</Typography.Text>
      <AutoComplete
        size="small"
        value={draftUrl}
        options={endpointOptions}
        disabled={disabled}
        style={{ width: 320 }}
        placeholder="ws://10.0.0.157:9090"
        onChange={(value) =>
          setDraftState({
            sourceUrl: snapshot.url,
            value,
          })
        }
        filterOption={(inputValue, option) =>
          String(option?.value ?? '').toLowerCase().includes(inputValue.toLowerCase())
        }
      />
      <Button
        size="small"
        type="primary"
        disabled={disabled || !isValidRosbridgeUrl(normalizedDraftUrl)}
        loading={snapshot.status === 'connecting' && normalizedDraftUrl === normalizedCurrentUrl}
        onClick={() => void onConnect(normalizedDraftUrl)}
      >
        {normalizedDraftUrl === normalizedCurrentUrl ? '重新连接' : '连接'}
      </Button>
    </Space>
  )
}
