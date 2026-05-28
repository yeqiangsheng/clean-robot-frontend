import { useEffect, useMemo, useState } from 'react'

import { Card, Typography } from 'antd'

import { MapCanvas } from '../components/canvas/MapCanvas'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { RelocalizeForm } from '../components/slam/RelocalizeForm'
import { SaveMapForm } from '../components/slam/SaveMapForm'
import { SlamJobCard } from '../components/slam/SlamJobCard'
import { SlamStateCard } from '../components/slam/SlamStateCard'
import { SlamStatusHeader } from '../components/slam/SlamStatusHeader'
import { StartMappingForm } from '../components/slam/StartMappingForm'
import { StopMappingAction } from '../components/slam/StopMappingAction'
import { SwitchMapForm } from '../components/slam/SwitchMapForm'
import { useLiveOccupancyMap } from '../hooks/useLiveOccupancyMap'
import { useMapCatalog } from '../hooks/useMapCatalog'
import { useOdometryStatus } from '../hooks/useOdometryStatus'
import { useRosConnection } from '../hooks/useRosConnection'
import { useSlamJobRunner } from '../hooks/useSlamJobRunner'
import { useSlamWorkflowJob } from '../hooks/useSlamWorkflowJob'
import { useSlamWorkflowState } from '../hooks/useSlamWorkflowState'
import type { SlamActionKind, SlamSubmitJobResponse } from '../types/slam-workflow'
import {
  getSlamActionLabel,
  getSlamJobHeadline,
  getSlamJobResultDetail,
  getSlamPageMode,
  isSlamJobTerminalState,
  isMappingMode,
} from '../utils/slam'
import {
  extractRobotPose,
  formatPoseCoordinate,
  formatPoseHeading,
} from '../utils/robotPose'
import './SlamWorkbenchPage.css'

const MAP_LAYER_VISIBILITY = {
  map: true,
  zone: false,
  noGoArea: false,
  virtualWall: false,
}

const UI_TEXT = {
  title: 'SLAM 工作台',
  rosFailed: '站点网关 ROS 连接失败',
  submitFailed: 'SLAM 动作提交失败',
  stateStale: 'SLAM 状态更新延迟',
  liveMapTitle: '实时地图',
  mapTopicSubscribeError: '实时地图加载异常',
  mapEmptyWhileMapping: '等待地图画面',
  mapEmptyDefault: '等待地图画面',
  poseTitle: '机器人位姿',
  poseWaiting: '等待位姿数据',
  mapCatalogLoadFailed: '地图资产目录加载失败',
} as const

type BannerFeedback = {
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  description?: string
}

function buildSubmitFeedback(
  actionKind: SlamActionKind,
  response: SlamSubmitJobResponse,
  fallbackValue?: string,
): BannerFeedback {
  const actionLabel = getSlamActionLabel(actionKind)
  const descriptionParts = [
    fallbackValue ? `目标地图：${fallbackValue}` : '',
    response.message || '',
  ].filter((item) => item.trim().length > 0)

  return {
    type: 'info',
    message: `${actionLabel}已提交`,
    description: descriptionParts.join(' | '),
  }
}

export function SlamWorkbenchPage() {
  const { snapshot } = useRosConnection()
  const {
    serviceQuery,
    effectiveState,
    isStateStale,
    refresh,
  } = useSlamWorkflowState(snapshot)
  const {
    activeJobId,
    job,
    loading: jobLoading,
    error: jobError,
    startPolling,
  } = useSlamWorkflowJob(snapshot)
  const { selectableEntries, error: mapCatalogError } = useMapCatalog()
  const odometry = useOdometryStatus(snapshot)
  const [feedback, setFeedback] = useState<BannerFeedback | null>(null)
  const [lastTerminalJobKey, setLastTerminalJobKey] = useState('')
  const {
    runningAction,
    submitError,
    lastSubmittedJob,
    clearSubmitError,
    runJob,
  } = useSlamJobRunner({
    refreshState: async () => {
      await refresh()
    },
  })

  const mappingMode = isMappingMode(effectiveState)
  const robotPose = useMemo(
    () =>
      extractRobotPose(effectiveState?.raw) ??
      odometry.effectiveState?.robotPose ??
      extractRobotPose(odometry.effectiveState?.raw),
    [effectiveState, odometry.effectiveState],
  )
  const robotPoseAgeS = effectiveState?.trackedPoseAgeS ?? odometry.effectiveState?.odomAgeS ?? null
  const robotPoseFresh =
    effectiveState?.trackedPoseFresh ??
    odometry.effectiveState?.odomFresh ??
    (odometry.topicSnapshot.health === 'live' ? true : null)
  const liveMap = useLiveOccupancyMap(snapshot, {
    enabled: snapshot.isConnected || snapshot.status === 'mock',
    mapName: effectiveState?.runtimeMapName || effectiveState?.activeMapName || 'runtime_map',
  })
  const mapOptions = useMemo(
    () =>
      selectableEntries.map((entry) => ({
        label: entry.displayName || entry.mapName,
        value: entry.mapName,
      })),
    [selectableEntries],
  )
  const pageMode = getSlamPageMode({
    state: effectiveState,
    readinessBlocked: false,
    job,
  })

  useEffect(() => {
    const stateJobId = effectiveState?.activeJobId?.trim() ?? ''

    if (!stateJobId) {
      return
    }

    if (
      !activeJobId ||
      (job && isSlamJobTerminalState(job.status, job.done) && activeJobId !== stateJobId)
    ) {
      startPolling(stateJobId)
    }
  }, [activeJobId, effectiveState?.activeJobId, job, startPolling])

  useEffect(() => {
    if (!job || !isSlamJobTerminalState(job.status, job.done)) {
      return
    }

    const nextKey = `${job.jobId}:${job.status}:${job.updatedAtMs ?? ''}`

    if (nextKey === lastTerminalJobKey) {
      return
    }

    const handle = globalThis.setTimeout(() => {
      setLastTerminalJobKey(nextKey)
      setFeedback({
        type: job.success ? 'success' : 'error',
        message: getSlamJobHeadline(job),
        description: getSlamJobResultDetail(job),
      })
    }, 0)

    return () => {
      globalThis.clearTimeout(handle)
    }
  }, [job, lastTerminalJobKey])

  const handleSwitchMap = async (values: {
    mapName: string
    restartLocalizationAfterSwitch: boolean
    description: string
    setActive: boolean
  }) => {
    const result = await runJob({
      actionKind: 'switch_map',
      payload: {
        mapName: values.mapName,
        restartLocalizationAfterSwitch: values.restartLocalizationAfterSwitch,
        description: values.description || '',
        setActive: values.setActive,
      },
    })

    if (result.ok && result.response) {
      setFeedback(buildSubmitFeedback('switch_map', result.response, values.mapName))
    }
  }

  const handleRelocalize = async (values: { description: string }) => {
    const result = await runJob({
      actionKind: 'relocalize',
      payload: {
        description: values.description || '',
      },
    })

    if (result.ok && result.response) {
      setFeedback(buildSubmitFeedback('relocalize', result.response))
    }
  }

  const handleStartMapping = async (values: {
    mapName: string
    setActive: boolean
    description: string
  }) => {
    const result = await runJob({
      actionKind: 'start_mapping',
      payload: {
        mapName: values.mapName,
        setActive: values.setActive,
        description: values.description || '',
      },
    })

    if (result.ok && result.response) {
      setFeedback(buildSubmitFeedback('start_mapping', result.response, values.mapName))
    }
  }

  const handleSaveMap = async (values: {
    mapName: string
    setActive: boolean
    description: string
  }) => {
    const result = await runJob({
      actionKind: 'save_mapping',
      payload: {
        mapName: values.mapName,
        setActive: values.setActive,
        description: values.description || '',
      },
    })

    if (result.ok && result.response) {
      setFeedback(buildSubmitFeedback('save_mapping', result.response, values.mapName))
    }
  }

  const handleStopMapping = async () => {
    const result = await runJob({
      actionKind: 'stop_mapping',
      payload: {},
    })

    if (result.ok && result.response) {
      setFeedback(buildSubmitFeedback('stop_mapping', result.response))
    }
  }

  const switchMapDisabled =
    !snapshot.isConnected || runningAction !== null || !effectiveState?.canSwitchMap
  const restartLocalizationDisabled =
    !snapshot.isConnected ||
    runningAction !== null ||
    !effectiveState?.canRestartLocalization
  const startMappingDisabled =
    !snapshot.isConnected || runningAction !== null || !effectiveState?.canStartMapping
  const saveMappingDisabled =
    !snapshot.isConnected || runningAction !== null || !effectiveState?.canSaveMapping
  const stopMappingDisabled =
    !snapshot.isConnected || runningAction !== null || !effectiveState?.canStopMapping

  return (
    <div className="slam-page">
      <header className="slam-page-header">
        <Typography.Title level={2}>{UI_TEXT.title}</Typography.Title>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <AppFeedbackBanner
          tone="error"
          title={UI_TEXT.rosFailed}
          description={snapshot.lastError}
          className="slam-banner"
        />
      ) : null}

      {feedback ? (
        <AppFeedbackBanner
          closable
          onClose={() => setFeedback(null)}
          tone={feedback.type}
          title={feedback.message}
          description={feedback.description}
          className="slam-banner"
        />
      ) : null}

      {submitError ? (
        <AppFeedbackBanner
          closable
          onClose={clearSubmitError}
          tone="error"
          title={UI_TEXT.submitFailed}
          description={submitError}
          className="slam-banner"
        />
      ) : null}

      {isStateStale ? (
        <AppFeedbackBanner
          tone="warning"
          title={UI_TEXT.stateStale}
          className="slam-banner"
        />
      ) : null}

      <SlamStatusHeader
        state={effectiveState}
        pageMode={pageMode}
      />

      <div className="slam-grid">
        <section className="slam-actions-column">
          <StartMappingForm
            disabled={startMappingDisabled}
            loading={runningAction === 'start_mapping'}
            suggestedMapName={effectiveState?.runtimeMapName || effectiveState?.activeMapName}
            onSubmit={(values) => void handleStartMapping(values)}
          />

          <SaveMapForm
            disabled={saveMappingDisabled}
            loading={runningAction === 'save_mapping'}
            suggestedSaveMapName={effectiveState?.runtimeMapName || effectiveState?.activeMapName}
            onSubmit={(values) => void handleSaveMap(values)}
          />

          <StopMappingAction
            disabled={stopMappingDisabled}
            loading={runningAction === 'stop_mapping'}
            onConfirm={() => void handleStopMapping()}
          />

          <SwitchMapForm
            disabled={switchMapDisabled}
            loading={runningAction === 'switch_map'}
            initialMapName={effectiveState?.runtimeMapName || effectiveState?.activeMapName}
            mapOptions={mapOptions}
            onSubmit={(values) => void handleSwitchMap(values)}
          />

          <RelocalizeForm
            disabled={restartLocalizationDisabled}
            loading={runningAction === 'relocalize'}
            lastErrorCode={effectiveState?.lastErrorCode}
            lastErrorMessage={effectiveState?.lastErrorMessage}
            onSubmit={(values) => void handleRelocalize(values)}
          />
        </section>

        <section className="slam-info-column">
          <Card title={UI_TEXT.liveMapTitle} className="slam-card">
            {liveMap.subscribeError ? (
              <AppFeedbackBanner
                tone="warning"
                title={UI_TEXT.mapTopicSubscribeError}
                description={liveMap.subscribeError}
                className="slam-inline-alert"
              />
            ) : null}

            {liveMap.map ? (
              <div className="slam-map-shell">
                <MapCanvas
                  map={liveMap.map}
                  zones={[]}
                  noGoAreas={[]}
                  virtualWalls={[]}
                  layerVisibility={MAP_LAYER_VISIBILITY}
                  selected={null}
                  onSelect={() => undefined}
                  robotPose={robotPose}
                />
              </div>
            ) : (
              <AppEmptyState
                description={
                  mappingMode ? UI_TEXT.mapEmptyWhileMapping : UI_TEXT.mapEmptyDefault
                }
              />
            )}
          </Card>

          <SlamJobCard
            job={job}
            loading={jobLoading}
            error={jobError}
            lastSubmittedJob={lastSubmittedJob}
          />

          <Card title={UI_TEXT.poseTitle} className="slam-card slam-pose-card">
            {robotPose ? (
              <div className="slam-pose-grid">
                <div className="slam-pose-item">
                  <Typography.Text className="slam-status-metric-label">X</Typography.Text>
                  <Typography.Text strong>{formatPoseCoordinate(robotPose.x)}</Typography.Text>
                </div>
                <div className="slam-pose-item">
                  <Typography.Text className="slam-status-metric-label">Y</Typography.Text>
                  <Typography.Text strong>{formatPoseCoordinate(robotPose.y)}</Typography.Text>
                </div>
                <div className="slam-pose-item">
                  <Typography.Text className="slam-status-metric-label">朝向</Typography.Text>
                  <Typography.Text strong>{formatPoseHeading(robotPose.theta)}</Typography.Text>
                </div>
                <div className="slam-pose-item">
                  <Typography.Text className="slam-status-metric-label">状态</Typography.Text>
                  <Typography.Text strong>
                    {robotPoseFresh === false ? '延迟' : '实时'}
                    {robotPoseAgeS !== null
                      ? ` ${robotPoseAgeS.toFixed(robotPoseAgeS >= 10 ? 0 : 1)}s`
                      : ''}
                  </Typography.Text>
                </div>
              </div>
            ) : (
              <AppEmptyState title={UI_TEXT.poseWaiting} description="" />
            )}
          </Card>

          <SlamStateCard
            state={effectiveState}
            stateError={serviceQuery.error instanceof Error ? serviceQuery.error.message : null}
          />

          {mapCatalogError ? (
            <AppFeedbackBanner
              tone="warning"
              title={UI_TEXT.mapCatalogLoadFailed}
              description={mapCatalogError.message}
              className="slam-inline-alert"
            />
          ) : null}
        </section>
      </div>
    </div>
  )
}
