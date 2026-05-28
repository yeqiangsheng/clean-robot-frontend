import { describe, expect, it } from 'vitest'

import type { SlamWorkflowJob, SlamWorkflowState } from '../types/slam-workflow'
import {
  formatAge,
  formatBoolText,
  getLocalizationTag,
  getSlamActionLabel,
  getSlamJobHeadline,
  getSlamJobProgressLabel,
  getSlamJobResultDetail,
  getSlamJobStateTag,
  getSlamJobSummary,
  getSlamPageMode,
  getSlamPageModeTag,
  getWorkflowStateTag,
  isMappingMode,
} from './slam'

function createState(overrides: Partial<SlamWorkflowState> = {}): SlamWorkflowState {
  return {
    desiredMode: '',
    currentMode: 'LOCALIZATION',
    activeMapName: 'map-a',
    activeMapId: '',
    activeMapMd5: '',
    runtimeMapName: 'map-a',
    runtimeMapId: '',
    runtimeMapMd5: '',
    localizationState: 'LOCALIZED',
    localizationValid: true,
    runtimeMapReady: true,
    activeMapMatch: true,
    lifecycleState: 'ACTIVE',
    activeJobId: '',
    activeJobStatus: '',
    activeJobPhase: '',
    activeJobProgress01: null,
    mapTopicFresh: true,
    mapAgeS: 0.1,
    trackedPoseFresh: true,
    trackedPoseAgeS: 0.1,
    trackedPoseFrame: 'map',
    trackedPoseX: 1,
    trackedPoseY: 2,
    trackedPoseTheta: 0,
    trackedPoseStampMs: Date.now(),
    trackedPoseSource: 'topic:/tracked_pose',
    missionState: 'IDLE',
    phase: 'IDLE',
    publicState: 'IDLE',
    executorState: 'IDLE',
    taskRunning: false,
    canSwitchMap: true,
    canRestartLocalization: true,
    canStartMapping: true,
    canSaveMapping: true,
    canStopMapping: false,
    lastErrorCode: '',
    lastErrorMessage: '',
    blockingReasons: [],
    warnings: [],
    stampMs: Date.now(),
    raw: {},
    ...overrides,
  }
}

function createJob(overrides: Partial<SlamWorkflowJob> = {}): SlamWorkflowJob {
  return {
    jobId: 'job-1',
    robotId: 'local_robot',
    operation: 3,
    operationName: 'start_mapping',
    requestedMapName: 'map-a',
    resolvedMapName: 'map-a',
    setActive: true,
    description: '',
    status: 'RUNNING',
    phase: 'creating_map',
    progress01: 0.4,
    done: false,
    success: null,
    errorCode: '',
    message: '',
    currentMode: 'MAPPING',
    localizationState: 'LOCALIZED',
    createdAtMs: Date.now(),
    startedAtMs: Date.now(),
    finishedAtMs: null,
    updatedAtMs: Date.now(),
    raw: {},
    ...overrides,
  }
}

describe('slam utils', () => {
  it('formats shared display values in Chinese', () => {
    expect(formatBoolText(true)).toBe('是')
    expect(formatBoolText(false)).toBe('否')
    expect(formatAge(800)).toBe('800 ms 前')
    expect(getSlamPageModeTag('steady_mapping').label).toBe('建图稳态')
  })

  it('detects mapping and workflow tags correctly', () => {
    expect(isMappingMode(createState({ currentMode: 'mapping' }))).toBe(true)
    expect(getWorkflowStateTag(createState({ currentMode: 'MAPPING' })).label).toBe('建图中')
    expect(getWorkflowStateTag(createState({ activeJobId: 'job-1' })).label).toBe('作业执行中')
    expect(getWorkflowStateTag(createState({ localizationValid: false })).label).toBe('定位未就绪')
  })

  it('translates localization and job tags correctly', () => {
    expect(
      getLocalizationTag(
        createState({ localizationState: 'RELOCALIZING', localizationValid: null }),
      ).label,
    ).toBe('重定位中')
    expect(
      getLocalizationTag(createState({ localizationState: 'LOST', localizationValid: false }))
        .label,
    ).toBe('定位异常')
    expect(getSlamJobStateTag(createJob({ done: true, success: true, status: 'SUCCESS' })).label).toBe(
      '已完成',
    )
    expect(getSlamJobStateTag(createJob({ done: true, success: false, status: 'FAILED' })).label).toBe(
      '已失败',
    )
  })

  it('summarizes action, phase and result details for job cards', () => {
    const runningJob = createJob({
      operationName: 'switch_map_and_localize',
      phase: 'queued',
      progress01: 0.2,
      message: '',
    })
    const failedJob = createJob({
      done: true,
      success: false,
      status: 'FAILED',
      errorCode: 'map_missing',
      message: '地图文件缺失',
    })

    expect(getSlamActionLabel('switch_map')).toBe('切图并定位')
    expect(getSlamJobHeadline(runningJob)).toBe('切图并定位进行中')
    expect(getSlamJobProgressLabel(runningJob)).toBe('20%')
    expect(getSlamJobSummary(runningJob)).toContain('阶段：排队中')
    expect(getSlamJobSummary(runningJob)).toContain('进度：20%')
    expect(getSlamJobResultDetail(failedJob)).toContain('错误码：map_missing')
    expect(getSlamJobResultDetail(failedJob)).toContain('地图文件缺失')
  })

  it('keeps page mode priority aligned with live acceptance rules', () => {
    expect(
      getSlamPageMode({
        state: createState({ activeJobId: 'job-1' }),
        readinessBlocked: true,
        job: createJob({ done: true, success: false, status: 'FAILED' }),
      }),
    ).toBe('job_running')

    expect(
      getSlamPageMode({
        state: createState(),
        readinessBlocked: true,
        job: createJob({ done: true, success: false, status: 'FAILED' }),
      }),
    ).toBe('system_blocked')

    expect(
      getSlamPageMode({
        state: createState(),
        readinessBlocked: false,
        job: createJob({ done: true, success: false, status: 'FAILED' }),
      }),
    ).toBe('job_failed')

    expect(
      getSlamPageMode({
        state: createState({ currentMode: 'MAPPING' }),
        readinessBlocked: false,
        job: null,
      }),
    ).toBe('steady_mapping')
  })
})
