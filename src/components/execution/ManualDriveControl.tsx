import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'

import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  DragOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Modal, message } from 'antd'

import { getManualDriveStatus, sendManualDriveCommand } from '../../api/gateway/manualDriveGateway'
import { useRosConnection } from '../../hooks/useRosConnection'
import type { ManualDriveDirection } from '../../types/manualDrive'
import './ManualDriveControl.css'

const HEARTBEAT_INTERVAL_MS = 200
const COMMAND_DURATION_MS = 1_000
const STOP_COMMAND_DURATION_MS = 100
const MAX_IN_FLIGHT_MOVE_COMMANDS = 3
const DEFAULT_LINEAR_MPS = 0.3
const DEFAULT_ANGULAR_RADPS = 0.35

function formatManualDriveReason(reason: string | null | undefined): string {
  const raw = reason?.trim()
  if (!raw) {
    return ''
  }

  const normalized = raw.toLowerCase()
  if (
    normalized.includes('platform status unavailable') ||
    normalized.includes('platform status') && normalized.includes('stale')
  ) {
    return '平台状态未更新，当前不可手动移动。请确认底盘状态、急停和 ROS 实时数据正常。'
  }
  if (normalized.includes('caller role') || normalized.includes('not permitted')) {
    return '当前状态不允许手动移动。'
  }
  if (normalized.includes('mission=running') || normalized.includes('task') && normalized.includes('running')) {
    return '清扫任务执行中，请先结束任务后再手动移动。'
  }
  if (normalized.includes('localization') || normalized.includes('manual_assist_required')) {
    return '定位未就绪，请先完成重定位后再手动移动。'
  }
  if (normalized.includes('emergency') || normalized.includes('e-stop') || normalized.includes('estop')) {
    return '急停或安全状态未解除，当前不可手动移动。'
  }
  if (normalized.includes('map') && normalized.includes('mismatch')) {
    return '运行地图与定位地图不一致，当前不可手动移动。'
  }
  if (normalized.includes('service') && normalized.includes('does not exist')) {
    return '手动移动接口暂不可用，请确认后端服务已更新并重启。'
  }
  if (normalized.includes('ros') && normalized.includes('not')) {
    return 'ROS 会话未连接，暂不可手动移动。'
  }

  return raw
}

function formatManualDriveReasons(reasons: string[]): string {
  const formattedReasons = reasons
    .map((reason) => formatManualDriveReason(reason))
    .filter(Boolean)

  return Array.from(new Set(formattedReasons)).join('；')
}

const directionConfig: Record<
  ManualDriveDirection,
  {
    label: string
    icon: ReactNode
    className: string
  }
> = {
  forward: {
    label: '前进',
    icon: <ArrowUpOutlined />,
    className: 'manual-drive-forward',
  },
  backward: {
    label: '后退',
    icon: <ArrowDownOutlined />,
    className: 'manual-drive-backward',
  },
  turn_left: {
    label: '左转',
    icon: <ArrowLeftOutlined />,
    className: 'manual-drive-left',
  },
  turn_right: {
    label: '右转',
    icon: <ArrowRightOutlined />,
    className: 'manual-drive-right',
  },
}

interface ManualDriveControlProps {
  className?: string
}

export function ManualDriveControl({ className }: ManualDriveControlProps) {
  const { snapshot } = useRosConnection()
  const [open, setOpen] = useState(false)
  const [activeDirection, setActiveDirection] = useState<ManualDriveDirection | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const heartbeatTimerRef = useRef<number | null>(null)
  const activeDirectionRef = useRef<ManualDriveDirection | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const activeButtonRef = useRef<HTMLButtonElement | null>(null)
  const driveSessionRef = useRef(0)
  const moveInFlightCountRef = useRef(0)
  const pendingStopAfterMoveRef = useRef<{
    direction: ManualDriveDirection
    sessionId: number
  } | null>(null)

  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'
  const statusQuery = useQuery({
    queryKey: ['manual-drive', 'status', snapshot.sessionId],
    queryFn: getManualDriveStatus,
    enabled: open && servicesReady,
    retry: 1,
    refetchInterval: open && servicesReady && !activeDirection ? 1_000 : false,
    refetchOnWindowFocus: false,
  })
  const status = statusQuery.data
  const blockedReasons = useMemo(() => status?.blockedReasons ?? [], [status?.blockedReasons])
  const driveReady =
    servicesReady && statusQuery.isSuccess && status?.enabled !== false && status?.allowed !== false

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  const clearPressedVisualState = useCallback(() => {
    activeButtonRef.current?.blur()
    activeButtonRef.current = null
  }, [])

  const resetActiveDriveState = useCallback(() => {
    activeDirectionRef.current = null
    activePointerIdRef.current = null
    setActiveDirection(null)
    clearPressedVisualState()
  }, [clearPressedVisualState])

  const stopManualDrive = useCallback(async () => {
    clearHeartbeat()
    const direction = activeDirectionRef.current
    driveSessionRef.current += 1
    const stopSessionId = driveSessionRef.current
    resetActiveDriveState()

    if (!direction) {
      return
    }

    if (moveInFlightCountRef.current > 0) {
      pendingStopAfterMoveRef.current = {
        direction,
        sessionId: stopSessionId,
      }
    }

    try {
      await sendManualDriveCommand({
        action: 'stop',
        direction,
        duration_ms: STOP_COMMAND_DURATION_MS,
      })
      setLastError(null)
    } catch (error) {
      setLastError(error instanceof Error ? error.message : '手动停止失败')
    }
  }, [clearHeartbeat, resetActiveDriveState])

  const sendMove = useCallback(async (direction: ManualDriveDirection) => {
    const linearMpsLimit =
      status && Number.isFinite(status.linearMpsLimit) && status.linearMpsLimit > 0
        ? status.linearMpsLimit
        : DEFAULT_LINEAR_MPS
    const angularRadpsLimit =
      status && Number.isFinite(status.angularRadpsLimit) && status.angularRadpsLimit > 0
        ? status.angularRadpsLimit
        : DEFAULT_ANGULAR_RADPS
    const result = await sendManualDriveCommand({
      action: 'move',
      direction,
      linear_mps: Math.min(DEFAULT_LINEAR_MPS, linearMpsLimit),
      angular_radps: Math.min(DEFAULT_ANGULAR_RADPS, angularRadpsLimit),
      duration_ms: COMMAND_DURATION_MS,
    })

    if (!result.success) {
      const reasonText =
        formatManualDriveReason(result.message) ||
        formatManualDriveReasons(result.blockedReasons) ||
        '当前状态不允许手动移动'
      throw new Error(reasonText)
    }

    setLastError(null)
  }, [status])

  const flushPendingStopAfterMove = useCallback(() => {
    const pendingStop = pendingStopAfterMoveRef.current
    if (!pendingStop) {
      return
    }

    pendingStopAfterMoveRef.current = null
    if (driveSessionRef.current !== pendingStop.sessionId || activeDirectionRef.current) {
      return
    }

    void sendManualDriveCommand({
      action: 'stop',
      direction: pendingStop.direction,
      duration_ms: STOP_COMMAND_DURATION_MS,
    }).catch((error) => {
      setLastError(error instanceof Error ? error.message : '手动停止失败')
    })
  }, [])

  const sendMoveSafely = useCallback(
    (direction: ManualDriveDirection, sessionId: number) => {
      if (
        moveInFlightCountRef.current >= MAX_IN_FLIGHT_MOVE_COMMANDS ||
        driveSessionRef.current !== sessionId ||
        activeDirectionRef.current !== direction
      ) {
        return
      }

      moveInFlightCountRef.current += 1
      void sendMove(direction)
        .catch((error) => {
          if (
            driveSessionRef.current !== sessionId ||
            activeDirectionRef.current !== direction
          ) {
            return
          }

          clearHeartbeat()
          resetActiveDriveState()
          const messageText =
            error instanceof Error ? formatManualDriveReason(error.message) : '手动移动被阻止'
          setLastError(messageText)
          message.warning(messageText)
        })
        .finally(() => {
          moveInFlightCountRef.current = Math.max(0, moveInFlightCountRef.current - 1)
          if (moveInFlightCountRef.current === 0) {
            flushPendingStopAfterMove()
          }
        })
    },
    [clearHeartbeat, flushPendingStopAfterMove, resetActiveDriveState, sendMove],
  )

  const startManualDrive = useCallback(
    (direction: ManualDriveDirection) => {
      if (!driveReady) {
        const reasonText =
          formatManualDriveReasons(blockedReasons) ||
          (servicesReady ? '当前状态不允许手动移动' : 'ROS 会话未连接')
        message.warning(reasonText)
        return
      }

      clearHeartbeat()
      driveSessionRef.current += 1
      const sessionId = driveSessionRef.current
      activeDirectionRef.current = direction
      setActiveDirection(direction)

      sendMoveSafely(direction, sessionId)

      heartbeatTimerRef.current = window.setInterval(() => {
        sendMoveSafely(direction, sessionId)
      }, HEARTBEAT_INTERVAL_MS)
    },
    [blockedReasons, clearHeartbeat, driveReady, sendMoveSafely, servicesReady],
  )

  useEffect(() => {
    const handleWindowBlur = () => {
      if (activeDirectionRef.current) {
        void stopManualDrive()
      }
    }
    const handleWindowPointerEnd = (event: globalThis.PointerEvent) => {
      if (
        activePointerIdRef.current === event.pointerId &&
        activeDirectionRef.current
      ) {
        void stopManualDrive()
      }
    }

    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('pointerup', handleWindowPointerEnd)
    window.addEventListener('pointercancel', handleWindowPointerEnd)
    return () => {
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('pointerup', handleWindowPointerEnd)
      window.removeEventListener('pointercancel', handleWindowPointerEnd)
      clearHeartbeat()
      driveSessionRef.current += 1
      resetActiveDriveState()
    }
  }, [clearHeartbeat, resetActiveDriveState, stopManualDrive])

  const handleClose = () => {
    if (activeDirectionRef.current) {
      void stopManualDrive()
    }
    setOpen(false)
  }

  const handlePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    direction: ManualDriveDirection,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    if (
      activePointerIdRef.current !== null &&
      activePointerIdRef.current !== event.pointerId
    ) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    activePointerIdRef.current = event.pointerId
    activeButtonRef.current = event.currentTarget
    startManualDrive(direction)
  }

  const handlePointerStop = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (
      activePointerIdRef.current !== null &&
      activePointerIdRef.current !== event.pointerId
    ) {
      return
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    event.currentTarget.blur()
    if (activeDirectionRef.current) {
      void stopManualDrive()
    } else {
      resetActiveDriveState()
    }
  }

  const rootClassName = ['manual-drive-control', className].filter(Boolean).join(' ')

  return (
    <div className={rootClassName}>
      <Button
        className="manual-drive-trigger"
        type="primary"
        icon={<DragOutlined />}
        onClick={() => setOpen(true)}
      >
        手动
      </Button>

      <Modal
        centered
        className="manual-drive-modal"
        closeIcon={<span className="manual-drive-close-text">关闭</span>}
        destroyOnHidden
        footer={null}
        open={open}
        title={null}
        width={620}
        onCancel={handleClose}
      >
        <div className="manual-drive-modal-body">
          {!driveReady && blockedReasons.length > 0 ? (
            <div className="manual-drive-blocked-reasons">
              {formatManualDriveReasons(blockedReasons.slice(0, 3))}
            </div>
          ) : null}

          {!driveReady && statusQuery.isError ? (
            <div className="manual-drive-blocked-reasons">
              {statusQuery.error instanceof Error
                ? formatManualDriveReason(statusQuery.error.message)
                : '手动移动状态接口暂不可用'}
            </div>
          ) : null}

          {lastError ? <div className="manual-drive-error">{lastError}</div> : null}

          <div className="manual-drive-pad">
            {(Object.keys(directionConfig) as ManualDriveDirection[]).map((direction) => {
              const config = directionConfig[direction]
              return (
                <button
                  key={direction}
                  type="button"
                  className={[
                    'manual-drive-direction-button',
                    config.className,
                    activeDirection === direction ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={!driveReady}
                  aria-label={config.label}
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerCancel={handlePointerStop}
                  onPointerDown={(event) => handlePointerDown(event, direction)}
                  onPointerUp={handlePointerStop}
                >
                  <span className="manual-drive-direction-icon" aria-hidden="true">
                    {config.icon}
                  </span>
                  <span>{config.label}</span>
                </button>
              )
            })}
            <div className="manual-drive-stop-indicator">
              <StopOutlined />
              <span>松手停止</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
