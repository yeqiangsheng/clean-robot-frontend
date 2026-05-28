import {
  ExportOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  Collapse,
  Descriptions,
  Modal,
  Slider,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'

import {
  ACTUATOR_LEVEL_MAX,
  getActuatorStatus,
  runActuatorCommand,
  type ActuatorCommand,
} from '../api/gateway/actuatorControlGateway'
import {
  ActuatorCommandLogCard,
} from '../components/actuator/ActuatorCommandLogCard'
import {
  CommandStateLine,
  MetricProgress,
} from '../components/actuator/ActuatorStatusWidgets'
import { GatewayRosSessionControl } from '../components/app/GatewayRosSessionControl'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { useAppFeedback } from '../hooks/useAppFeedback'
import { useRosConnection } from '../hooks/useRosConnection'
import { useAppShellStore } from '../stores/appShellStore'
import {
  COMMAND_LOG_LIMIT,
  LEVEL_MARKS,
  STATUS_REFETCH_INTERVAL_MS,
  VACUUM_DEFAULT_LEVEL,
  WATER_DEFAULT_LEVEL,
  copyText,
  createCommandId,
  formatAge,
  formatCurrent,
  formatJson,
  formatLevel,
  formatPercent,
  formatTimestamp,
  formatVoltageMv,
  getConnectionTag,
  getDockSupplyStateColor,
  getErrorMessage,
  getPositionTagColor,
  getStatusDisabledReason,
  getStepsForCommand,
  normalizeLevel,
  type CommandLogItem,
  type PendingCommand,
} from '../utils/actuatorControlPage'
import './ActuatorControlPage.css'

export function ActuatorControlPage() {
  const { snapshot, reconnect } = useRosConnection()
  const feedback = useAppFeedback()
  const grantedCapabilities = useAppShellStore((state) => state.grantedCapabilities)
  const currentRole = useAppShellStore((state) => state.currentRole)
  const hasActuatorControl = grantedCapabilities.includes('actuatorControl')
  const rosConnected = snapshot.status === 'connected' && snapshot.isConnected
  const servicesReady = rosConnected || snapshot.status === 'mock'

  const statusQuery = useQuery({
    queryKey: ['actuator-status', snapshot.sessionId],
    queryFn: getActuatorStatus,
    enabled: servicesReady && hasActuatorControl,
    retry: 1,
    refetchInterval: servicesReady && hasActuatorControl ? STATUS_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
  })

  const status = statusQuery.data ?? null
  const [waterLevel, setWaterLevel] = useState(WATER_DEFAULT_LEVEL)
  const [waterEnabled, setWaterEnabled] = useState(false)
  const [vacuumLevel, setVacuumLevel] = useState(VACUUM_DEFAULT_LEVEL)
  const [vacuumEnabled, setVacuumEnabled] = useState(false)
  const [dockDeferExit, setDockDeferExit] = useState(false)
  const [chargingEnabled, setChargingEnabled] = useState(false)
  const [refillRunning, setRefillRunning] = useState(false)
  const [drainRunning, setDrainRunning] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null)
  const [commandLogs, setCommandLogs] = useState<CommandLogItem[]>([])
  const [publishError, setPublishError] = useState<string | null>(null)

  const connectionTag = getConnectionTag(snapshot.status)
  const disabledReason = getStatusDisabledReason({
    hasCapability: hasActuatorControl,
    rosConnected: servicesReady,
    status,
    statusLoading: statusQuery.isLoading,
    pendingCommand,
  })
  const controlsDisabled = disabledReason.length > 0
  const latestCommandLog = commandLogs[0] ?? null
  const stationConnected = status?.stationConnected === true
  const agvInPlace = status?.station?.agvInPlace === true
  const dockSupplyState = status?.dockSupplyState ?? 'UNKNOWN'
  const dockSupplyStartable = ['IDLE', 'DONE', 'FAILED', 'CANCELED'].includes(dockSupplyState)
  const batteryPercentage = status?.battery?.percentage ?? status?.batteryPercentage ?? null
  const batteryVoltage = status?.battery?.voltage ?? status?.batteryVoltage ?? null
  const batteryCurrent = status?.battery?.current ?? status?.batteryCurrent ?? null
  const cleanLevel = status?.levels?.cleanLevel ?? status?.cleanLevel ?? null
  const sewageLevel = status?.levels?.sewageLevel ?? status?.sewageLevel ?? null
  const hasEngineeringRole = currentRole === 'engineer' || currentRole === 'admin'
  const dockServiceDisabledReason = !hasActuatorControl
    ? '当前用户没有 actuatorControl 权限'
    : !hasEngineeringRole
      ? '该功能需要工程/调试权限'
      : !servicesReady
        ? 'ROS 未连接'
        : pendingCommand
          ? `${pendingCommand.label} 正在下发`
          : !status
            ? '等待补给流程状态'
            : ''
  const stationBaseDisabledReason = !hasActuatorControl
    ? '当前用户没有 actuatorControl 权限'
    : !hasEngineeringRole
      ? '该功能需要工程/调试权限'
      : !servicesReady
        ? 'ROS 未连接'
        : pendingCommand
          ? `${pendingCommand.label} 正在下发`
          : !status
            ? '等待补给站状态'
            : !stationConnected
              ? '补给站 TCP bridge 未连接'
              : ''
  const stationIoDisabledReason =
    stationBaseDisabledReason ||
    (!status?.mcoreConnected ? 'M-core bridge 未连接' : '') ||
    (!agvInPlace ? 'AGV 未到位' : '')
  const stationStopDisabledReason =
    stationBaseDisabledReason || (!status?.mcoreConnected ? 'M-core bridge 未连接' : '')
  const dockStartDisabledReason =
    dockServiceDisabledReason ||
    (!dockSupplyStartable ? `当前流程状态为 ${dockSupplyState}` : '')
  const dockExitDisabledReason =
    dockServiceDisabledReason ||
    (dockSupplyState !== 'READY_TO_EXIT' ? `当前流程状态为 ${dockSupplyState}` : '')

  const statusTags = useMemo(() => {
    return [
      {
        key: 'combined',
        label: status?.topics.combinedStatus.fresh ? 'combined_status 正常' : 'combined_status 不可用',
        color: status?.topics.combinedStatus.fresh ? 'green' : 'orange',
      },
      {
        key: 'mcore',
        label: status?.mcoreConnected ? 'M-core 已连接' : 'M-core 未连接',
        color: status?.mcoreConnected ? 'green' : 'red',
      },
      {
        key: 'station',
        label: status?.stationConnected ? '补给站已连接' : '补给站未连接',
        color: status?.stationConnected ? 'green' : 'red',
      },
      {
        key: 'dockSupply',
        label: `流程 ${status?.dockSupplyState ?? 'UNKNOWN'}`,
        color: getDockSupplyStateColor(status?.dockSupplyState),
      },
    ]
  }, [status])

  useEffect(() => {
    if (!refillRunning && !drainRunning) {
      return undefined
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = '补水或排水测试仍在运行，请先停止。'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [drainRunning, refillRunning])

  const appendCommandLog = (label: string, command: ActuatorCommand) => {
    const logItem: CommandLogItem = {
      id: createCommandId(),
      label,
      sentAt: Date.now(),
      command,
      steps: getStepsForCommand(command),
    }

    setCommandLogs((previousLogs) => [logItem, ...previousLogs].slice(0, COMMAND_LOG_LIMIT))
  }

  const executeCommand = async (
    key: string,
    label: string,
    command: ActuatorCommand,
    blockedReason = disabledReason,
  ) => {
    if (blockedReason) {
      feedback.warning('命令不可下发', blockedReason)
      return false
    }

    setPublishError(null)
    setPendingCommand({ key, label })

    try {
      await runActuatorCommand(command)
      appendCommandLog(label, command)
      feedback.success(`${label}已下发`, '命令已通过 Site Gateway 发布到 ROS topic。')
      await statusQuery.refetch()
      return true
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      setPublishError(errorMessage)
      feedback.error(`${label}下发失败`, errorMessage)
      return false
    } finally {
      setPendingCommand(null)
    }
  }

  const setWaterSequence = (enabled: boolean, nextLevel = waterLevel) => {
    const level = normalizeLevel(nextLevel)
    void executeCommand(
      enabled ? 'water-on' : 'water-off',
      enabled ? '出水开启' : '出水关闭',
      enabled
        ? { kind: 'waterSequence', enabled: true, level }
        : { kind: 'waterSequence', enabled: false },
    ).then((success) => {
      if (success) {
        setWaterEnabled(enabled)
        if (enabled) {
          setWaterLevel(level)
        }
      }
    })
  }

  const setVacuumChain = (enabled: boolean, nextLevel = vacuumLevel) => {
    const level = normalizeLevel(nextLevel)
    void executeCommand(
      enabled ? 'vacuum-on' : 'vacuum-off',
      enabled ? '吸水/真空开启' : '吸水/真空关闭',
      enabled
        ? { kind: 'vacuumChain', enabled: true, level }
        : { kind: 'vacuumChain', enabled: false },
    ).then((success) => {
      if (success) {
        setVacuumEnabled(enabled)
        if (enabled) {
          setVacuumLevel(level)
        }
      }
    })
  }

  const runConfirmedCommand = ({
    key,
    label,
    command,
    blockedReason,
    title,
    content,
    onSuccess,
  }: {
    key: string
    label: string
    command: ActuatorCommand
    blockedReason: string
    title: string
    content: string
    onSuccess?: () => void
  }) => {
    if (blockedReason) {
      feedback.warning('命令不可下发', blockedReason)
      return
    }

    Modal.confirm({
      title,
      content,
      okText: '确认下发',
      cancelText: '取消',
      onOk: async () => {
        const success = await executeCommand(key, label, command, blockedReason)
        if (success) {
          onSuccess?.()
        }
      },
    })
  }

  const runDockSupplyStart = () => {
    runConfirmedCommand({
      key: 'dock-supply-start',
      label: '启动补给/充电',
      command: { kind: 'dockSupplyStart' },
      blockedReason: dockStartDisabledReason,
      title: '确认启动自动补给/充电',
      content: '机器人可能移动，并会操作阀门和充电链路。请确认现场安全后再启动。',
    })
  }

  const runDockSupplyCancel = () => {
    void executeCommand(
      'dock-supply-cancel',
      '取消补给/充电',
      { kind: 'dockSupplyCancel' },
      dockServiceDisabledReason,
    )
  }

  const setDockSupplyDeferExit = (enabled: boolean) => {
    void executeCommand(
      'dock-supply-defer-exit',
      enabled ? '完成后停留在桩上' : '完成后自动离桩',
      { kind: 'dockSupplyDeferExit', enabled },
      dockServiceDisabledReason,
    ).then((success) => {
      if (success) {
        setDockDeferExit(enabled)
      }
    })
  }

  const runDockSupplyExit = () => {
    void executeCommand(
      'dock-supply-exit',
      '执行离桩',
      { kind: 'dockSupplyExit' },
      dockExitDisabledReason,
    )
  }

  const setChargingSequence = (enabled: boolean) => {
    const blockedReason = enabled ? stationIoDisabledReason : stationStopDisabledReason

    runConfirmedCommand({
      key: enabled ? 'charging-on' : 'charging-off',
      label: enabled ? '充电使能开启' : '充电使能关闭',
      command: { kind: 'chargingSequence', enabled },
      blockedReason,
      title: enabled ? '确认开启充电使能' : '确认关闭充电使能',
      content: '该动作会同时控制车端充电允许和桩端充电机开关。',
      onSuccess: () => {
        setChargingEnabled(enabled)
      },
    })
  }

  const setStationRefill = (enabled: boolean) => {
    const blockedReason = enabled ? stationIoDisabledReason : stationStopDisabledReason
    runConfirmedCommand({
      key: enabled ? 'station-refill-on' : 'station-refill-off',
      label: enabled ? '补水测试开始' : '补水测试停止',
      command: { kind: 'stationRefillSequence', enabled },
      blockedReason,
      title: enabled ? '确认开始补水测试' : '确认停止补水测试',
      content: enabled
        ? '该动作会打开车端清水阀和桩端补水阀，请确认 AGV 已到位。'
        : '将完整关闭桩端补水和车端清水阀。',
      onSuccess: () => {
        setRefillRunning(enabled)
      },
    })
  }

  const setStationDrain = (enabled: boolean) => {
    const blockedReason = enabled ? stationIoDisabledReason : stationStopDisabledReason
    runConfirmedCommand({
      key: enabled ? 'station-drain-on' : 'station-drain-off',
      label: enabled ? '排水测试开始' : '排水测试停止',
      command: { kind: 'stationDrainSequence', enabled },
      blockedReason,
      title: enabled ? '确认开始排水测试' : '确认停止排水测试',
      content: enabled
        ? '该动作会打开车端污水阀和桩端排水，请确认 AGV 已到位。'
        : '将完整关闭桩端排水和车端污水阀。',
      onSuccess: () => {
        setDrainRunning(enabled)
      },
    })
  }

  const runStationRodCommand = (connectRod: boolean) => {
    runConfirmedCommand({
      key: connectRod ? 'station-rod-connect' : 'station-rod-reset',
      label: connectRod ? '机械连接/伸出' : '机械复位/收回',
      command: connectRod ? { kind: 'stationRodConnect' } : { kind: 'stationRodReset' },
      blockedReason: stationBaseDisabledReason || (!agvInPlace ? 'AGV 未到位' : ''),
      title: connectRod ? '确认机械连接/伸出' : '确认机械复位/收回',
      content: '机械连接属于高级调试动作，请确认后端已启用机械连接能力且现场安全。',
    })
  }

  const runScraperCommand = (deploy: boolean) => {
    Modal.confirm({
      title: deploy ? '确认放下刮扒' : '确认收起刮扒',
      content: '刮扒是升降机构，通常与吸水/真空联动。请确认机器人已停稳且周边安全。',
      okText: deploy ? '放下' : '收起',
      cancelText: '取消',
      onOk: () =>
        executeCommand(
          deploy ? 'scraper-deploy' : 'scraper-stow',
          deploy ? '刮扒放下' : '刮扒收起',
          deploy ? { kind: 'scraperDeploy' } : { kind: 'scraperStow' },
        ),
    })
  }

  const handleCopyLog = async (logItem: CommandLogItem) => {
    try {
      await copyText(
        [
          `时间：${formatTimestamp(logItem.sentAt)}`,
          `功能：${logItem.label}`,
          `Command：${formatJson({ command: logItem.command })}`,
          ...logItem.steps.flatMap((step, index) => [
            `步骤 ${index + 1}：${step.label}`,
            `Topic：${step.topicName}`,
            `Type：${step.messageType}`,
            `Payload：${formatJson(step.payload)}`,
          ]),
        ].join('\n'),
      )
      feedback.success('日志已复制', '命令请求和 ROS topic payload 已复制。')
    } catch (error) {
      feedback.error('复制失败', getErrorMessage(error))
    }
  }

  return (
    <div className="actuator-page">
      <header className="actuator-page-header">
        <div>
          <Typography.Title level={2}>执行机构调试</Typography.Title>
          <Typography.Paragraph>
            出水、吸水/真空、刷盘、刮扒和补给站按商用控制链路下发；机械连接在补给站高级区单独调试。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          {statusTags.map((item) => (
            <Tag key={item.key} color={item.color}>
              {item.label}
            </Tag>
          ))}
          <GatewayRosSessionControl
            snapshot={snapshot}
            onReconnect={reconnect}
          />
        </Space>
      </header>

      {disabledReason ? (
        <AppFeedbackBanner
          tone={rosConnected ? 'warning' : 'error'}
          title="执行机构命令暂不可用"
          description={disabledReason}
          className="actuator-banner"
        />
      ) : null}

      {currentRole !== 'engineer' && currentRole !== 'admin' ? (
        <AppFeedbackBanner
          tone="warning"
          title="执行机构调试需要工程权限"
          description="普通操作员不应在任务执行过程中手动下发执行机构命令。"
          className="actuator-banner"
        />
      ) : null}

      {publishError ? (
        <AppFeedbackBanner
          tone="error"
          title="命令下发失败"
          description={publishError}
          className="actuator-banner"
        />
      ) : null}

      <div className="actuator-grid">
        <main className="actuator-main">
          <div className="actuator-control-grid">
            <Card
              title="出水"
              className="actuator-card"
              extra={<Tag color="blue">{formatLevel(waterLevel)}</Tag>}
            >
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <div className="actuator-inline-row">
                  <Typography.Text strong>出水开关</Typography.Text>
                  <Switch
                    checked={waterEnabled}
                    checkedChildren="开"
                    unCheckedChildren="关"
                    disabled={controlsDisabled}
                    loading={pendingCommand?.key === 'water-on' || pendingCommand?.key === 'water-off'}
                    onChange={(checked) => {
                      setWaterSequence(checked)
                    }}
                  />
                </div>

                <Slider
                  min={0}
                  max={ACTUATOR_LEVEL_MAX}
                  step={1}
                  marks={LEVEL_MARKS}
                  value={waterLevel}
                  disabled={controlsDisabled}
                  tooltip={{ formatter: (value) => formatLevel(value ?? null) }}
                  onChange={(value) => {
                    setWaterLevel(normalizeLevel(value))
                  }}
                  onChangeComplete={(value) => {
                    const level = normalizeLevel(value)
                    setWaterLevel(level)
                    if (waterEnabled) {
                      setWaterSequence(true, level)
                    }
                  }}
                />

                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="清水水位">
                    {formatPercent(cleanLevel)}
                  </Descriptions.Item>
                  <Descriptions.Item label="命令状态">
                    <CommandStateLine status={status} />
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card
              title="吸水/真空"
              className="actuator-card"
              extra={<Tag color="geekblue">{formatLevel(vacuumLevel)}</Tag>}
            >
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <div className="actuator-inline-row">
                  <Typography.Text strong>吸水/真空开关</Typography.Text>
                  <Switch
                    checked={vacuumEnabled}
                    checkedChildren="开"
                    unCheckedChildren="关"
                    disabled={controlsDisabled}
                    loading={pendingCommand?.key === 'vacuum-on' || pendingCommand?.key === 'vacuum-off'}
                    onChange={(checked) => {
                      setVacuumChain(checked)
                    }}
                  />
                </div>

                <Slider
                  min={0}
                  max={ACTUATOR_LEVEL_MAX}
                  step={1}
                  marks={LEVEL_MARKS}
                  value={vacuumLevel}
                  disabled={controlsDisabled}
                  tooltip={{ formatter: (value) => formatLevel(value ?? null) }}
                  onChange={(value) => {
                    setVacuumLevel(normalizeLevel(value))
                  }}
                  onChangeComplete={(value) => {
                    const level = normalizeLevel(value)
                    setVacuumLevel(level)
                    if (vacuumEnabled) {
                      setVacuumChain(true, level)
                    }
                  }}
                />

                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="污水水位">
                    {formatPercent(sewageLevel)}
                  </Descriptions.Item>
                  <Descriptions.Item label="反馈说明">
                    <Typography.Text type="secondary">
                      无真空转速闭环，仅显示 gateway 命令状态。
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="命令状态">
                    <CommandStateLine status={status} />
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card
              title="刷盘"
              className="actuator-card"
              extra={
                <Tag color={getPositionTagColor(status?.brush.position ?? null)}>
                  {status?.brush.label ?? '未知'}
                </Tag>
              }
            >
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <div className="actuator-action-grid">
                  <Button
                    type="primary"
                    className="actuator-action-button"
                    disabled={controlsDisabled}
                    loading={pendingCommand?.key === 'brush-work'}
                    onClick={() => {
                      void executeCommand('brush-work', '刷盘工作', {
                        kind: 'brushWorkPosition',
                      })
                    }}
                  >
                    工作
                  </Button>
                  <Button
                    className="actuator-action-button"
                    disabled={controlsDisabled}
                    loading={pendingCommand?.key === 'brush-retract'}
                    onClick={() => {
                      void executeCommand('brush-retract', '刷盘收起', {
                        kind: 'brushRetract',
                      })
                    }}
                  >
                    收起
                  </Button>
                </div>

                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="刷盘位置">
                    {status?.brush.label ?? '未知'}
                  </Descriptions.Item>
                  <Descriptions.Item label="命令状态">
                    <CommandStateLine status={status} />
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card
              title="刮扒"
              className="actuator-card"
              extra={
                <Tag color={getPositionTagColor(status?.scraper.position ?? null)}>
                  {status?.scraper.label ?? '未知'}
                </Tag>
              }
            >
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <div className="actuator-action-grid">
                  <Button
                    type="primary"
                    className="actuator-action-button"
                    disabled={controlsDisabled}
                    loading={pendingCommand?.key === 'scraper-deploy'}
                    onClick={() => {
                      runScraperCommand(true)
                    }}
                  >
                    放下
                  </Button>
                  <Button
                    className="actuator-action-button"
                    disabled={controlsDisabled}
                    loading={pendingCommand?.key === 'scraper-stow'}
                    onClick={() => {
                      runScraperCommand(false)
                    }}
                  >
                    收起
                  </Button>
                </div>

                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="刮扒位置">
                    {status?.scraper.label ?? '未知'}
                  </Descriptions.Item>
                  <Descriptions.Item label="命令状态">
                    <CommandStateLine status={status} />
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card
              title="充电桩/补给站"
              className="actuator-card actuator-card-wide"
              extra={<Tag color={getDockSupplyStateColor(dockSupplyState)}>{dockSupplyState}</Tag>}
            >
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <div className="actuator-status-chip-row">
                  <Tag color={stationConnected ? 'green' : 'red'}>
                    {stationConnected ? '桩连接正常' : '桩未连接'}
                  </Tag>
                  <Tag color={status?.mcoreConnected ? 'green' : 'red'}>
                    {status?.mcoreConnected ? '车端连接正常' : '车端未连接'}
                  </Tag>
                  <Tag color={agvInPlace ? 'green' : 'orange'}>
                    {agvInPlace ? 'AGV 已到位' : 'AGV 未到位'}
                  </Tag>
                  <Tag color={getDockSupplyStateColor(dockSupplyState)}>
                    流程 {dockSupplyState}
                  </Tag>
                </div>

                <div className="actuator-charge-layout">
                  <section className="actuator-charge-section">
                    <div className="actuator-section-head">
                      <div>
                        <Typography.Title level={5} className="actuator-no-margin">
                          状态
                        </Typography.Title>
                        <Typography.Text type="secondary">
                          只展示后端可靠状态，不使用 station_status[12]/[13] 判断充电机。
                        </Typography.Text>
                      </div>
                    </div>

                    <div className="actuator-charge-status-grid">
                      <div className="actuator-status-panel">
                        <div className="actuator-status-panel-head">
                          <Typography.Text strong>补给站</Typography.Text>
                          <Tag color={stationConnected ? 'green' : 'red'}>
                            {stationConnected ? '已连接' : '未连接'}
                          </Tag>
                        </div>
                        <Descriptions column={1} size="small" colon={false}>
                          <Descriptions.Item label="AGV 到位">
                            <Tag color={agvInPlace ? 'green' : 'orange'}>
                              {agvInPlace ? '是' : '否'}
                            </Tag>
                          </Descriptions.Item>
                          <Descriptions.Item label="机械连接到位">
                            {status?.station?.rodConnected ? '是' : '否'}
                          </Descriptions.Item>
                          <Descriptions.Item label="机械复位到位">
                            {status?.station?.rodReset ? '是' : '否'}
                          </Descriptions.Item>
                        </Descriptions>
                      </div>

                      <div className="actuator-status-panel">
                        <div className="actuator-status-panel-head">
                          <Typography.Text strong>电池 / 液位</Typography.Text>
                          <Tag color={getDockSupplyStateColor(dockSupplyState)}>
                            {dockSupplyState}
                          </Tag>
                        </div>
                        <Descriptions column={1} size="small" colon={false}>
                          <Descriptions.Item label="电池">
                            {`${formatPercent(batteryPercentage)} / ${formatVoltageMv(batteryVoltage)} / ${formatCurrent(
                              batteryCurrent,
                            )}`}
                          </Descriptions.Item>
                          <Descriptions.Item label="清水液位">
                            {formatPercent(cleanLevel)}
                          </Descriptions.Item>
                          <Descriptions.Item label="污水液位">
                            {formatPercent(sewageLevel)}
                          </Descriptions.Item>
                        </Descriptions>
                      </div>
                    </div>

                    <div className="actuator-action-grid">
                      <Button
                        type="primary"
                        className="actuator-action-button"
                        icon={<PlayCircleOutlined />}
                        disabled={Boolean(dockStartDisabledReason)}
                        loading={pendingCommand?.key === 'dock-supply-start'}
                        onClick={runDockSupplyStart}
                      >
                        启动补给/充电
                      </Button>
                      <Button
                        danger
                        className="actuator-action-button"
                        icon={<StopOutlined />}
                        disabled={Boolean(dockServiceDisabledReason)}
                        loading={pendingCommand?.key === 'dock-supply-cancel'}
                        onClick={runDockSupplyCancel}
                      >
                        取消流程
                      </Button>
                    </div>

                    <div className="actuator-inline-row">
                      <Typography.Text strong>完成后停留在桩上</Typography.Text>
                      <Switch
                        checked={dockDeferExit}
                        checkedChildren="停留"
                        unCheckedChildren="离桩"
                        disabled={Boolean(dockServiceDisabledReason)}
                        loading={pendingCommand?.key === 'dock-supply-defer-exit'}
                        onChange={setDockSupplyDeferExit}
                      />
                    </div>

                    <Button
                      className="actuator-action-button"
                      icon={<ExportOutlined />}
                      disabled={Boolean(dockExitDisabledReason)}
                      loading={pendingCommand?.key === 'dock-supply-exit'}
                      onClick={runDockSupplyExit}
                    >
                      离桩
                    </Button>
                  </section>

                  <section className="actuator-charge-section">
                    <div className="actuator-section-head">
                      <div>
                        <Typography.Title level={5} className="actuator-no-margin">
                          手动调试
                        </Typography.Title>
                        <Typography.Text type="secondary">
                          充电、补水、排水均为组合命令，关闭动作会完整关闭车端和桩端链路。
                        </Typography.Text>
                      </div>
                    </div>

                    <Collapse
                      items={[
                        {
                          key: 'station-manual',
                          label: '高级手动调试',
                          children: (
                            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                              <AppFeedbackBanner
                                tone="warning"
                                title="手动调试需要二次确认"
                                description="开始补水、排水或充电前，请确认 AGV 已到位，现场人员远离阀门和充电触点。"
                              />

                              <div className="actuator-inline-row">
                                <div>
                                  <Typography.Text strong>充电使能</Typography.Text>
                                  <Typography.Paragraph className="actuator-footnote">
                                    同时控制车端 /mcore/charge_enable 和桩端 operation=1。
                                  </Typography.Paragraph>
                                </div>
                                <Switch
                                  checked={chargingEnabled}
                                  checkedChildren="开"
                                  unCheckedChildren="关"
                                  disabled={Boolean(
                                    chargingEnabled
                                      ? stationStopDisabledReason
                                      : stationIoDisabledReason,
                                  )}
                                  loading={
                                    pendingCommand?.key === 'charging-on' ||
                                    pendingCommand?.key === 'charging-off'
                                  }
                                  onChange={setChargingSequence}
                                />
                              </div>

                              <div className="actuator-status-panel">
                                <div className="actuator-status-panel-head">
                                  <Typography.Text strong>补水测试</Typography.Text>
                                  <Tag color="blue">清水 {formatPercent(cleanLevel)}</Tag>
                                </div>
                                <div className="actuator-action-grid">
                                  <Button
                                    type="primary"
                                    className="actuator-action-button"
                                    disabled={Boolean(stationIoDisabledReason)}
                                    loading={pendingCommand?.key === 'station-refill-on'}
                                    onClick={() => {
                                      setStationRefill(true)
                                    }}
                                  >
                                    开始补水
                                  </Button>
                                  <Button
                                    className="actuator-action-button"
                                    disabled={Boolean(stationStopDisabledReason)}
                                    loading={pendingCommand?.key === 'station-refill-off'}
                                    onClick={() => {
                                      setStationRefill(false)
                                    }}
                                  >
                                    停止补水
                                  </Button>
                                </div>
                              </div>

                              <div className="actuator-status-panel">
                                <div className="actuator-status-panel-head">
                                  <Typography.Text strong>排水测试</Typography.Text>
                                  <Tag color="orange">污水 {formatPercent(sewageLevel)}</Tag>
                                </div>
                                <div className="actuator-action-grid">
                                  <Button
                                    type="primary"
                                    className="actuator-action-button"
                                    disabled={Boolean(stationIoDisabledReason)}
                                    loading={pendingCommand?.key === 'station-drain-on'}
                                    onClick={() => {
                                      setStationDrain(true)
                                    }}
                                  >
                                    开始排水
                                  </Button>
                                  <Button
                                    danger
                                    className="actuator-action-button"
                                    disabled={Boolean(stationStopDisabledReason)}
                                    loading={pendingCommand?.key === 'station-drain-off'}
                                    onClick={() => {
                                      setStationDrain(false)
                                    }}
                                  >
                                    停止排水
                                  </Button>
                                </div>
                              </div>

                              {status?.capabilities?.mechanicalConnect ? (
                                <div className="actuator-status-panel">
                                  <div className="actuator-status-panel-head">
                                    <Typography.Text strong>机械连接/电缸</Typography.Text>
                                    <Space size="small" wrap>
                                      <Tag color={status?.station?.rodConnected ? 'green' : 'default'}>
                                        连接 {status?.station?.rodConnected ? '到位' : '未到位'}
                                      </Tag>
                                      <Tag color={status?.station?.rodReset ? 'green' : 'default'}>
                                        复位 {status?.station?.rodReset ? '到位' : '未到位'}
                                      </Tag>
                                    </Space>
                                  </div>
                                  <div className="actuator-action-grid">
                                    <Button
                                      className="actuator-action-button"
                                      disabled={Boolean(stationBaseDisabledReason || !agvInPlace)}
                                      loading={pendingCommand?.key === 'station-rod-connect'}
                                      onClick={() => {
                                        runStationRodCommand(true)
                                      }}
                                    >
                                      连接/伸出
                                    </Button>
                                    <Button
                                      className="actuator-action-button"
                                      disabled={Boolean(stationBaseDisabledReason || !agvInPlace)}
                                      loading={pendingCommand?.key === 'station-rod-reset'}
                                      onClick={() => {
                                        runStationRodCommand(false)
                                      }}
                                    >
                                      复位/收回
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <AppFeedbackBanner
                                  tone="info"
                                  title="机械连接/电缸默认不开放"
                                  description="当前能力未启用，商用现场不展示 operation=8/9 的机械动作按钮。"
                                />
                              )}
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </section>
                </div>
              </Space>
            </Card>

          </div>

          <ActuatorCommandLogCard
            logs={commandLogs}
            limit={COMMAND_LOG_LIMIT}
            onClear={() => {
              setCommandLogs([])
            }}
            onCopy={handleCopyLog}
          />
        </main>

        <aside className="actuator-side">
          <Card title="执行机构状态" className="actuator-card">
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="M-core bridge">
                  <Tag color={status?.mcoreConnected ? 'green' : 'red'}>
                    {status?.mcoreConnected ? '已连接' : '未连接'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="补给站 bridge">
                  <Tag color={stationConnected ? 'green' : 'red'}>
                    {stationConnected ? '已连接' : '未连接'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="AGV 到位">
                  <Tag color={agvInPlace ? 'green' : 'orange'}>
                    {agvInPlace ? '是' : '否'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="补给流程">
                  <Tag color={getDockSupplyStateColor(dockSupplyState)}>{dockSupplyState}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="清水水位">
                  {formatPercent(cleanLevel)}
                </Descriptions.Item>
                <Descriptions.Item label="污水水位">
                  {formatPercent(sewageLevel)}
                </Descriptions.Item>
                <Descriptions.Item label="电池电量">
                  {formatPercent(batteryPercentage)}
                </Descriptions.Item>
                <Descriptions.Item label="电池电压">
                  {formatVoltageMv(batteryVoltage)}
                </Descriptions.Item>
                <Descriptions.Item label="电池电流">
                  {formatCurrent(batteryCurrent)}
                </Descriptions.Item>
                <Descriptions.Item label="刷盘位置">
                  {status?.brush.label ?? '未知'}
                </Descriptions.Item>
                <Descriptions.Item label="刮扒位置">
                  {status?.scraper.label ?? '未知'}
                </Descriptions.Item>
              </Descriptions>

              <MetricProgress label="清水" value={cleanLevel} color="#1f7a68" />
              <MetricProgress label="污水" value={sewageLevel} color="#cf5a36" />
              <MetricProgress
                label="电池"
                value={batteryPercentage}
                color="#d17721"
              />
            </Space>
          </Card>

          <Card title="Topic 健康" className="actuator-card">
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="/combined_status">
                <Space size="small" wrap>
                  <Tag color={status?.topics.combinedStatus.fresh ? 'green' : 'orange'}>
                    {status?.topics.combinedStatus.fresh ? '正常' : '过期'}
                  </Tag>
                  <Typography.Text>
                    {formatAge(status?.topics.combinedStatus.ageMs ?? null)}
                  </Typography.Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="/mcore_tcp_bridge/connected">
                <Space size="small" wrap>
                  <Tag color={status?.topics.mcoreConnected.fresh ? 'green' : 'orange'}>
                    {status?.topics.mcoreConnected.fresh ? '正常' : '过期'}
                  </Tag>
                  <Typography.Text>
                    {formatAge(status?.topics.mcoreConnected.ageMs ?? null)}
                  </Typography.Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="/station_tcp_bridge/connected">
                <Space size="small" wrap>
                  <Tag color={status?.topics.stationConnected?.fresh ? 'green' : 'orange'}>
                    {status?.topics.stationConnected?.fresh ? '正常' : '过期'}
                  </Tag>
                  <Typography.Text>
                    {formatAge(status?.topics.stationConnected?.ageMs ?? null)}
                  </Typography.Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="/dock_supply/state">
                <Space size="small" wrap>
                  <Tag color={status?.topics.dockSupplyState?.fresh ? 'green' : 'orange'}>
                    {status?.topics.dockSupplyState?.fresh ? '正常' : '过期'}
                  </Tag>
                  <Typography.Text>
                    {formatAge(status?.topics.dockSupplyState?.ageMs ?? null)}
                  </Typography.Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="/station_status">
                <Space size="small" wrap>
                  <Tag color={status?.topics.stationStatus?.fresh ? 'green' : 'orange'}>
                    {status?.topics.stationStatus?.fresh ? '正常' : '过期'}
                  </Tag>
                  <Typography.Text>
                    {formatAge(status?.topics.stationStatus?.ageMs ?? null)}
                  </Typography.Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="/battery_state">
                <Space size="small" wrap>
                  <Tag color={status?.topics.batteryState?.fresh ? 'green' : 'orange'}>
                    {status?.topics.batteryState?.fresh ? '正常' : '过期'}
                  </Tag>
                  <Typography.Text>
                    {formatAge(status?.topics.batteryState?.ageMs ?? null)}
                  </Typography.Text>
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            title="最近命令"
            className="actuator-card"
            extra={pendingCommand ? <Tag color="processing">{pendingCommand.label}</Tag> : null}
          >
            {latestCommandLog ? (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="时间">
                    {formatTimestamp(latestCommandLog.sentAt)}
                  </Descriptions.Item>
                  <Descriptions.Item label="功能">{latestCommandLog.label}</Descriptions.Item>
                  <Descriptions.Item label="步骤数">{latestCommandLog.steps.length}</Descriptions.Item>
                </Descriptions>
                <Typography.Text className="actuator-payload-text">
                  {formatJson({ command: latestCommandLog.command })}
                </Typography.Text>
              </Space>
            ) : (
              <AppEmptyState description="第一条命令发出后，这里会显示最近发送摘要。" />
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
