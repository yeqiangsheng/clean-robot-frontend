import { useEffect, useMemo, useState } from 'react'

import { Card, Space, Tag, Typography } from 'antd'

import { MapCanvas } from '../components/canvas/MapCanvas'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { OdometryHealthCard } from '../components/odometry/OdometryHealthCard'
import { ResolvedSystemReadinessCard } from '../components/readiness/SystemReadinessCard'
import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { JsonViewerDrawer } from '../components/slam/JsonViewerDrawer'
import { RelocalizeForm } from '../components/slam/RelocalizeForm'
import { SaveMapForm } from '../components/slam/SaveMapForm'
import { SlamJobCard } from '../components/slam/SlamJobCard'
import { SlamJobHistory } from '../components/slam/SlamJobHistory'
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
import { useSystemReadiness } from '../hooks/useSystemReadiness'
import { useSlamWorkbenchStore } from '../stores/slamWorkbenchStore'
import type { SlamActionKind, SlamSubmitJobResponse } from '../types/slam-workflow'
import {
  getSlamActionLabel,
  getSlamConnectionTag,
  getSlamJobHeadline,
  getSlamJobResultDetail,
  getSlamPageMode,
  isSlamJobTerminalState,
  isMappingMode,
} from '../utils/slam'
import './SlamWorkbenchPage.css'

const MAP_LAYER_VISIBILITY = {
  map: true,
  zone: false,
  noGoArea: false,
  virtualWall: false,
}

const UI_TEXT = {
  title: 'SLAM 工作台',
  intro:
    '当前页面围绕 canonical submit / status / job 链路工作：长动作统一走 /clean_robot_server/app/submit_slam_command，状态查询走 get_slam_status / get_slam_job，并继续结合 /clean_robot_server/slam_state、/clean_robot_server/slam_job_state 和 /map 实时观察现场状态。',
  interfaceTag: 'SLAM 正式接口',
  rosFailed: '站点网关 ROS 连接失败',
  submitFailed: 'SLAM 动作提交失败',
  readinessBlocked: '系统 readiness 当前存在阻塞',
  readinessBlockedFallback: '请展开“系统 readiness 摘要”查看 checks[] 的详细说明。',
  stateStale: 'SLAM 状态可能已延迟',
  stateStaleDescription:
    'SLAM 状态 topic 或 /map 最近没有刷新，建议结合里程计和 readiness 一起判断是否还能继续操作。',
  liveMapTitle: '实时建图画布',
  liveMapDescription:
    '当 slam_state.current_mode == "mapping" 时，这里会展示 /map 的实时画面。页面本身不改动建图流程，只帮助现场判断当前动作是否已经进入统一 job 生命周期。',
  notMappingTitle: '当前不在建图模式',
  notMappingDescription: '进入建图态后，这里会显示实时 /map 画面。',
  mapTopicStaleTitle: '/map topic 已延迟',
  mapTopicStaleFallback: '后端报告 /map 当前 stale。',
  mapTopicSubscribeError: '/map 订阅异常',
  mapEmptyWhileMapping: '已进入建图态，等待 /map 首帧。',
  mapEmptyDefault: '当前没有实时建图画面。',
  mapMetricsPrefix: '/map 消息数：',
  mapMetricsUpdatedAt: '，最近更新时间：',
  readinessTitle: '系统 readiness 摘要',
  mapCatalogLoadFailed: '地图资产目录加载失败',
  jsonTitle: 'SLAM JSON',
  jobJsonTitle: 'SLAM Job JSON',
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
    response.jobId ? `job_id：${response.jobId}` : '',
    response.message || '',
    fallbackValue || '',
  ].filter((item) => item.trim().length > 0)

  return {
    type: 'info',
    message: `${actionLabel}已提交`,
    description: descriptionParts.join(' | '),
  }
}

export function SlamWorkbenchPage() {
  const { snapshot, defaultUrl, connect } = useRosConnection()
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
    topicSnapshot: jobTopicSnapshot,
    loading: jobLoading,
    error: jobError,
    isPolling,
    startPolling,
  } = useSlamWorkflowJob(snapshot)
  const jobHistory = useSlamWorkbenchStore((state) => state.jobHistory)
  const clearHistory = useSlamWorkbenchStore((state) => state.clearHistory)
  const jsonPreview = useSlamWorkbenchStore((state) => state.jsonPreview)
  const openJsonPreview = useSlamWorkbenchStore((state) => state.openJsonPreview)
  const closeJsonPreview = useSlamWorkbenchStore((state) => state.closeJsonPreview)
  const { selectableEntries, error: mapCatalogError } = useMapCatalog()
  const odometry = useOdometryStatus(snapshot)
  const readiness = useSystemReadiness(0, snapshot)
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
  const liveMap = useLiveOccupancyMap(snapshot, {
    enabled: mappingMode,
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
    readinessBlocked: readiness.effectiveReadiness?.canStartTask === false,
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

  const handleReconnect = async (url?: string) => {
    await connect((url ?? snapshot.url) || defaultUrl)
    await Promise.all([
      refresh(),
      odometry.serviceQuery.refetch(),
      readiness.serviceQuery.refetch(),
    ])
  }

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
        description: values.description,
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
        description: values.description,
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
        description: values.description,
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
        description: values.description,
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
        <div>
          <Typography.Title level={2}>{UI_TEXT.title}</Typography.Title>
          <Typography.Paragraph>{UI_TEXT.intro}</Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color="gold">{UI_TEXT.interfaceTag}</Tag>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          {effectiveState?.runtimeMapName ? (
            <Tag color="geekblue">{effectiveState.runtimeMapName}</Tag>
          ) : null}
          <RosbridgeEndpointControl
            snapshot={snapshot}
            defaultUrl={defaultUrl}
            onConnect={handleReconnect}
          />
        </Space>
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

      {readiness.effectiveReadiness?.canStartTask === false ? (
        <AppFeedbackBanner
          tone="warning"
          title={UI_TEXT.readinessBlocked}
          description={
            readiness.effectiveReadiness.blockingReasons.length > 0
              ? readiness.effectiveReadiness.blockingReasons.join(' | ')
              : UI_TEXT.readinessBlockedFallback
          }
          className="slam-banner"
        />
      ) : null}

      {isStateStale ? (
        <AppFeedbackBanner
          tone="warning"
          title={UI_TEXT.stateStale}
          description={UI_TEXT.stateStaleDescription}
          className="slam-banner"
        />
      ) : null}

      <SlamStatusHeader
        snapshot={snapshot}
        state={effectiveState}
        canStartTask={readiness.effectiveReadiness?.canStartTask ?? null}
        odomValid={odometry.effectiveState?.odomValid ?? null}
        pageMode={pageMode}
      />

      <div className="slam-grid">
        <section className="slam-actions-column">
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
        </section>

        <section className="slam-info-column">
          <Card title={UI_TEXT.liveMapTitle} className="slam-card">
            <Typography.Paragraph className="slam-card-copy">
              {UI_TEXT.liveMapDescription}
            </Typography.Paragraph>

            {!mappingMode ? (
              <AppFeedbackBanner
                tone="info"
                title={UI_TEXT.notMappingTitle}
                description={UI_TEXT.notMappingDescription}
                className="slam-inline-alert"
              />
            ) : null}

            {effectiveState?.mapTopicFresh === false ? (
              <AppFeedbackBanner
                tone="warning"
                title={UI_TEXT.mapTopicStaleTitle}
                description={
                  effectiveState.mapAgeS === null
                    ? UI_TEXT.mapTopicStaleFallback
                    : `/map 最近一帧距今 ${effectiveState.mapAgeS.toFixed(
                        effectiveState.mapAgeS >= 10 ? 0 : 1,
                      )} s。`
                }
                className="slam-inline-alert"
              />
            ) : null}

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
                />
              </div>
            ) : (
              <AppEmptyState
                description={
                  mappingMode ? UI_TEXT.mapEmptyWhileMapping : UI_TEXT.mapEmptyDefault
                }
              />
            )}

            <Typography.Paragraph className="slam-footnote">
              {UI_TEXT.mapMetricsPrefix}
              {liveMap.messageCount}
              {UI_TEXT.mapMetricsUpdatedAt}
              {liveMap.lastMessageAt
                ? new Date(liveMap.lastMessageAt).toLocaleString('zh-CN', { hour12: false })
                : '--'}
            </Typography.Paragraph>
          </Card>

          <OdometryHealthCard
            state={odometry.effectiveState}
            topicSnapshot={odometry.topicSnapshot}
            serviceError={
              odometry.serviceQuery.error instanceof Error
                ? odometry.serviceQuery.error.message
                : null
            }
          />

          <ResolvedSystemReadinessCard
            readinessState={readiness}
            taskId={0}
            title={UI_TEXT.readinessTitle}
          />

          <SlamStateCard
            state={effectiveState}
            topicSnapshot={topicSnapshot}
            stateError={serviceQuery.error instanceof Error ? serviceQuery.error.message : null}
          />

          <SlamJobCard
            job={job}
            activeJobId={activeJobId}
            topicSnapshot={jobTopicSnapshot}
            loading={jobLoading}
            error={jobError}
            isPolling={isPolling}
            lastSubmittedJob={lastSubmittedJob}
            onViewJson={() =>
              openJsonPreview({
                title: UI_TEXT.jobJsonTitle,
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
                title: `${UI_TEXT.jobJsonTitle}: ${historyJob.jobId}`,
                payload: historyJob.raw,
              })
            }
            onClear={clearHistory}
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

      <JsonViewerDrawer
        open={Boolean(jsonPreview)}
        title={jsonPreview?.title ?? UI_TEXT.jsonTitle}
        payload={jsonPreview?.payload ?? {}}
        onClose={closeJsonPreview}
      />
    </div>
  )
}
