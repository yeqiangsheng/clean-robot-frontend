import { useEffect, useMemo, useState } from 'react'

import {
  Alert,
  Button,
  Card,
  Space,
  Tag,
  Typography,
} from 'antd'
import { AimOutlined, RobotOutlined } from '@ant-design/icons'

import { JsonViewerDrawer } from '../components/slam/JsonViewerDrawer'
import { RelocalizeForm } from '../components/slam/RelocalizeForm'
import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { SaveMapForm } from '../components/slam/SaveMapForm'
import { SlamJobCard } from '../components/slam/SlamJobCard'
import { SlamJobHistory } from '../components/slam/SlamJobHistory'
import { SlamStateCard } from '../components/slam/SlamStateCard'
import { SlamStatusHeader } from '../components/slam/SlamStatusHeader'
import { StartMappingForm } from '../components/slam/StartMappingForm'
import { StopMappingAction } from '../components/slam/StopMappingAction'
import { SwitchMapForm } from '../components/slam/SwitchMapForm'
import { runSlamAction } from '../api/gateway/slamGateway'
import { isSlamJobTerminalState } from '../api/ros/slamWorkflowServices'
import { useRosConnection } from '../hooks/useRosConnection'
import { useSlamJobRunner } from '../hooks/useSlamJobRunner'
import { useSlamWorkflowJob } from '../hooks/useSlamWorkflowJob'
import { useSlamWorkflowState } from '../hooks/useSlamWorkflowState'
import { useSlamWorkbenchStore } from '../stores/slamWorkbenchStore'
import { getSlamConnectionTag } from '../utils/slam'
import './SlamWorkbenchPage.css'

export function SlamWorkbenchPage() {
  const { snapshot, defaultUrl, quickUrls, connect } = useRosConnection()
  const servicesReady = snapshot.isConnected
  const connectionTag = getSlamConnectionTag(snapshot.status)
  const {
    serviceQuery,
    topicSnapshot,
    effectiveState,
    isStateStale,
    refresh,
  } = useSlamWorkflowState(snapshot)
  const {
    activeJobId,
    job,
    loading: jobLoading,
    error: jobError,
    isPolling,
    startPolling,
  } = useSlamWorkflowJob(snapshot)
  const jobHistory = useSlamWorkbenchStore((state) => state.jobHistory)
  const clearHistory = useSlamWorkbenchStore((state) => state.clearHistory)
  const relocalizeExpanded = useSlamWorkbenchStore((state) => state.relocalizeExpanded)
  const setRelocalizeExpanded = useSlamWorkbenchStore(
    (state) => state.setRelocalizeExpanded,
  )
  const jsonPreview = useSlamWorkbenchStore((state) => state.jsonPreview)
  const openJsonPreview = useSlamWorkbenchStore((state) => state.openJsonPreview)
  const closeJsonPreview = useSlamWorkbenchStore((state) => state.closeJsonPreview)
  const [syncLoading, setSyncLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error' | 'info'
    message: string
    description?: string
  } | null>(null)
  const [lastTerminalJobKey, setLastTerminalJobKey] = useState('')
  const {
    runningAction,
    submitError,
    clearSubmitError,
    runJob,
  } = useSlamJobRunner({
    refreshState: async () => {
      await refresh()
    },
    onManualAssistRequired: () => {
      setRelocalizeExpanded(true)
    },
  })

  const hasManualAssist =
    effectiveState?.manualAssistRequired === true ||
    job?.jobState === 'MANUAL_ASSIST_REQUIRED'
  const manualAssistReason =
    effectiveState?.lastErrorMessage ||
    effectiveState?.blockingReason ||
    job?.resultMessage ||
    ''
  const mappingSessionActive = effectiveState?.mappingSessionActive === true
  const actionBusy = runningAction !== null || isPolling
  const actionDisabled = !servicesReady || actionBusy
  const localizationActionsDisabled = actionDisabled || mappingSessionActive
  const mappingStartDisabled = actionDisabled || mappingSessionActive
  const mappingControlsDisabled = actionDisabled || !mappingSessionActive

  useEffect(() => {
    const stateJobId = effectiveState?.activeJobId?.trim() ?? ''

    if (!stateJobId) {
      return
    }

    if (
      !activeJobId ||
      (job && isSlamJobTerminalState(job.jobState) && activeJobId !== stateJobId)
    ) {
      startPolling(stateJobId)
    }
  }, [activeJobId, effectiveState?.activeJobId, job, startPolling])

  useEffect(() => {
    if (hasManualAssist) {
      setRelocalizeExpanded(true)
    }
  }, [hasManualAssist, setRelocalizeExpanded])

  useEffect(() => {
    if (!job || !isSlamJobTerminalState(job.jobState)) {
      return
    }

    const nextKey = `${job.jobId}:${job.jobState}:${job.updatedTs ?? ''}`

    if (nextKey === lastTerminalJobKey) {
      return
    }

    setLastTerminalJobKey(nextKey)
    setFeedback({
      type: job.jobState === 'SUCCEEDED' ? 'success' : job.jobState === 'FAILED' ? 'error' : 'warning',
      message: `Job ${job.jobState}`,
      description: job.resultMessage || job.progressText || job.jobType || job.jobId,
    })
  }, [job, lastTerminalJobKey])

  const handleReconnect = async (url?: string) => {
    await connect((url ?? snapshot.url) || defaultUrl)
  }

  const handleSyncRuntime = async () => {
    setSyncLoading(true)

    try {
      const result = await runSlamAction('sync_runtime_state')
      await refresh()
      setFeedback({
        type: result.success ? 'success' : 'warning',
        message: result.success ? 'Runtime sync completed' : 'Runtime sync returned warning',
        description: result.message || undefined,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: 'Runtime sync failed',
        description: error instanceof Error ? error.message : 'Runtime sync failed.',
      })
    } finally {
      setSyncLoading(false)
    }
  }

  const handleCancelJob = async () => {
    if (!job) {
      return
    }

    setCancelLoading(true)

    try {
      const result = await runSlamAction('cancel_job', { jobId: job.jobId })
      await Promise.all([refresh(), Promise.resolve()])
      setFeedback({
        type: result.success ? 'success' : 'warning',
        message: result.success ? 'Cancel job requested' : 'Cancel job returned warning',
        description: result.message || result.jobState || undefined,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: 'Cancel job failed',
        description: error instanceof Error ? error.message : 'Cancel job failed.',
      })
    } finally {
      setCancelLoading(false)
    }
  }

  const handlePrepareForTask = async () => {
    const result = await runJob({
      actionKind: 'prepare_for_task',
      payload: {},
    })

    if (result.ok && result.response) {
      setFeedback({
        type: 'info',
        message: 'Prepare for task accepted',
        description: result.response.message || result.response.jobId,
      })
    }
  }

  const handleSwitchMap = async (values: {
    mapName: string
    frameId: string
    hasInitialPose: boolean
    initialPoseX: number
    initialPoseY: number
    initialPoseYaw: number
  }) => {
    const result = await runJob({
      actionKind: 'switch_map_and_localize',
      payload: {
        mapName: values.mapName,
        frameId: values.frameId,
        hasInitialPose: values.hasInitialPose,
        initialPoseX: values.initialPoseX,
        initialPoseY: values.initialPoseY,
        initialPoseYaw: values.initialPoseYaw,
      },
    })

    if (result.ok && result.response) {
      setFeedback({
        type: 'info',
        message: 'Switch map job accepted',
        description: result.response.jobId || result.response.message,
      })
    }
  }

  const handleRelocalize = async (values: {
    hasInitialPose: boolean
    initialPoseX: number
    initialPoseY: number
    initialPoseYaw: number
  }) => {
    const result = await runJob({
      actionKind: 'relocalize',
      payload: {
        hasInitialPose: values.hasInitialPose,
        initialPoseX: values.initialPoseX,
        initialPoseY: values.initialPoseY,
        initialPoseYaw: values.initialPoseYaw,
      },
    })

    if (result.ok && result.response) {
      setFeedback({
        type: 'info',
        message: 'Relocalize job accepted',
        description: result.response.jobId || result.response.message,
      })
    }
  }

  const handleStartMapping = async (values: { mapName: string; frameId: string }) => {
    const result = await runJob({
      actionKind: 'start_mapping',
      payload: {
        mapName: values.mapName,
        frameId: values.frameId,
      },
    })

    if (result.ok && result.response) {
      setFeedback({
        type: 'info',
        message: 'Start mapping job accepted',
        description: result.response.jobId || result.response.message,
      })
    }
  }

  const handleSaveMap = async (values: {
    saveMapName: string
    includeUnfinishedSubmaps: boolean
    setActiveOnSave: boolean
    switchToLocalizationAfterSave: boolean
    relocalizeAfterSwitch: boolean
  }) => {
    const result = await runJob({
      actionKind: 'save_map',
      payload: {
        saveMapName: values.saveMapName,
        includeUnfinishedSubmaps: values.includeUnfinishedSubmaps,
        setActiveOnSave: values.setActiveOnSave,
        switchToLocalizationAfterSave: values.switchToLocalizationAfterSave,
        relocalizeAfterSwitch: values.relocalizeAfterSwitch,
      },
    })

    if (result.ok && result.response) {
      setFeedback({
        type: 'info',
        message: 'Save map job accepted',
        description: result.response.jobId || result.response.message,
      })
    }
  }

  const handleStopMapping = async () => {
    const result = await runJob({
      actionKind: 'stop_mapping',
      payload: {},
    })

    if (result.ok && result.response) {
      setFeedback({
        type: 'info',
        message: 'Stop mapping job accepted',
        description: result.response.jobId || result.response.message,
      })
    }
  }

  const headerBadges = useMemo(
    () =>
      [
        <Tag key="feature" color="gold">SLAM v1</Tag>,
        <Tag key="connection" color={connectionTag.color}>{connectionTag.label}</Tag>,
        effectiveState?.runtimeMapName ? (
          <Tag key="map" color="geekblue">{effectiveState.runtimeMapName}</Tag>
        ) : null,
        effectiveState?.taskReady ? (
          <Tag key="ready" color="success">task ready</Tag>
        ) : null,
      ].filter(Boolean),
    [
      connectionTag.color,
      connectionTag.label,
      effectiveState?.runtimeMapName,
      effectiveState?.taskReady,
    ],
  )

  return (
    <div className="slam-page">
      <header className="slam-page-header">
        <div>
          <Typography.Title level={2}>SLAM 工程台</Typography.Title>
          <Typography.Paragraph>
            这是面向工程师的现场 SLAM 调试页，保留底层服务/话题的直接诊断能力，并通过本地审计日志记录高风险操作。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          {headerBadges}
          <RosbridgeEndpointControl
            snapshot={snapshot}
            defaultUrl={defaultUrl}
            quickUrls={quickUrls}
            onConnect={handleReconnect}
          />
        </Space>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <Alert
          showIcon
          type="error"
          title="rosbridge 连接失败"
          description={snapshot.lastError}
          className="slam-banner"
        />
      ) : null}

      {snapshot.status === 'mock' ? (
        <Alert
          showIcon
          type="warning"
          title="Mock workflow is not supported on this page"
          description="Connect to a real rosbridge endpoint before validating `/slam_workflow/*` services and topic updates."
          className="slam-banner"
        />
      ) : null}

      {feedback ? (
        <Alert
          showIcon
          closable={{ onClose: () => setFeedback(null) }}
          type={feedback.type}
          title={feedback.message}
          description={feedback.description}
          className="slam-banner"
        />
      ) : null}

      {submitError ? (
        <Alert
          showIcon
          closable={{ onClose: clearSubmitError }}
          type="error"
          title="SLAM action submit failed"
          description={submitError}
          className="slam-banner"
        />
      ) : null}

      {hasManualAssist ? (
        <Alert
          showIcon
          type="warning"
          title="Manual assist is required"
          description={
            manualAssistReason
              ? `${manualAssistReason} Open the relocalize panel, provide an initial pose, and retry.`
              : 'The automatic flow did not converge. Open the relocalize panel, provide an initial pose, and retry.'
          }
          className="slam-banner"
        />
      ) : null}

      {isStateStale ? (
        <Alert
          showIcon
          type="warning"
          title="SLAM topic may be stale"
          description="The page is still falling back to `get_state`, but `/slam_workflow/state` has not refreshed as expected."
          className="slam-banner"
        />
      ) : null}

      <SlamStatusHeader
        snapshot={snapshot}
        state={effectiveState}
        topicHealth={topicSnapshot.health}
        onSync={() => void handleSyncRuntime()}
        isSyncing={syncLoading}
        onViewJson={() =>
          openJsonPreview({
            title: 'SLAM State JSON',
            payload: effectiveState?.raw ?? {},
          })
        }
      />

      <div className="slam-grid">
        <section className="slam-actions-column">
          <SwitchMapForm
            disabled={localizationActionsDisabled}
            loading={runningAction === 'switch_map_and_localize'}
            initialMapName={effectiveState?.runtimeMapName}
            onSubmit={(values) => void handleSwitchMap(values)}
          />

          <RelocalizeForm
            disabled={localizationActionsDisabled}
            expanded={relocalizeExpanded}
            loading={runningAction === 'relocalize'}
            manualAssistRequired={hasManualAssist}
            manualAssistReason={manualAssistReason || undefined}
            onExpandedChange={setRelocalizeExpanded}
            onSubmit={(values) => void handleRelocalize(values)}
            runtimeMapName={effectiveState?.runtimeMapName}
          />

          <StartMappingForm
            disabled={mappingStartDisabled}
            loading={runningAction === 'start_mapping'}
            suggestedMapName={effectiveState?.runtimeMapName}
            onSubmit={(values) => void handleStartMapping(values)}
          />

          <SaveMapForm
            disabled={mappingControlsDisabled}
            loading={runningAction === 'save_map'}
            suggestedSaveMapName={effectiveState?.runtimeMapName}
            onSubmit={(values) => void handleSaveMap(values)}
          />

          <StopMappingAction
            disabled={mappingControlsDisabled}
            loading={runningAction === 'stop_mapping'}
            onConfirm={() => void handleStopMapping()}
          />

          <Card
            title="Auxiliary Action"
            className="slam-card"
            extra={<RobotOutlined />}
          >
            <Typography.Paragraph className="slam-card-copy">
              `prepare_for_task` is useful right before task start. If the robot is on the wrong
              map or not localized yet, the backend can fill in the missing recovery steps.
            </Typography.Paragraph>
            <Space wrap>
              <Button
                icon={<AimOutlined />}
                onClick={() => void handlePrepareForTask()}
                disabled={localizationActionsDisabled}
                loading={runningAction === 'prepare_for_task'}
              >
                Prepare For Task
              </Button>
            </Space>
          </Card>
        </section>

        <section className="slam-info-column">
          <SlamStateCard
            state={effectiveState}
            topicSnapshot={topicSnapshot}
            stateError={serviceQuery.error instanceof Error ? serviceQuery.error.message : null}
          />

          <SlamJobCard
            job={job}
            loading={jobLoading}
            error={jobError}
            isPolling={isPolling}
            cancelLoading={cancelLoading}
            canCancel={Boolean(job && !isSlamJobTerminalState(job.jobState))}
            onCancel={() => void handleCancelJob()}
            onViewJson={() =>
              openJsonPreview({
                title: 'SLAM Job JSON',
                payload: job?.raw ?? {},
              })
            }
          />

          <SlamJobHistory
            jobs={jobHistory}
            activeJobId={activeJobId}
            onSelectJob={startPolling}
            onViewJson={(historyJob) =>
              openJsonPreview({
                title: `SLAM Job JSON: ${historyJob.jobId}`,
                payload: historyJob.raw,
              })
            }
            onClear={clearHistory}
          />
        </section>
      </div>

      <JsonViewerDrawer
        open={Boolean(jsonPreview)}
        title={jsonPreview?.title ?? 'SLAM JSON'}
        payload={jsonPreview?.payload ?? {}}
        onClose={closeJsonPreview}
      />
    </div>
  )
}
