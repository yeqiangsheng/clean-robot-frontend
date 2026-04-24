import { useMemo } from 'react'

import { useSystemReadiness } from './useSystemReadiness'
import type { RosConnectionSnapshot } from '../types/ros'
import type { SystemReadinessCheck } from '../types/systemReadiness'

function normalizeLevel(value: string) {
  return value.trim().toLowerCase()
}

function summarizeCheck(check: SystemReadinessCheck) {
  return check.summary.trim().length > 0 ? `${check.key}: ${check.summary}` : check.key
}

function isNonBlockingWarningCheck(check: SystemReadinessCheck) {
  const level = normalizeLevel(check.level)

  return (
    check.key === 'station_status' ||
    ['warn', 'warning', 'degraded', 'info', 'notice'].includes(level)
  )
}

function isBlockingCheck(check: SystemReadinessCheck) {
  if (check.ok) {
    return false
  }

  return !isNonBlockingWarningCheck(check)
}

function getPrimaryBlockReason(blockingReasons: string[], checksSummary: string[]) {
  if (blockingReasons.length > 0) {
    return blockingReasons[0]
  }

  if (checksSummary.length > 0) {
    return checksSummary[0]
  }

  return '后端返回 can_start_task=false，但没有附带更多阻断信息。'
}

export function useTaskStartGate(taskId: number, snapshot: RosConnectionSnapshot) {
  const readiness = useSystemReadiness(taskId, snapshot)

  const blockingChecks = useMemo(
    () =>
      (readiness.effectiveReadiness?.checks ?? []).filter(isBlockingCheck),
    [readiness.effectiveReadiness?.checks],
  )

  const warningChecks = useMemo(
    () =>
      (readiness.effectiveReadiness?.checks ?? []).filter(
        (check) =>
          isNonBlockingWarningCheck(check) ||
          (check.ok && (check.stale || check.missing)),
      ),
    [readiness.effectiveReadiness?.checks],
  )

  const blockingCheckSummaries = useMemo(
    () => blockingChecks.map(summarizeCheck),
    [blockingChecks],
  )

  const warningCheckSummaries = useMemo(
    () => warningChecks.map(summarizeCheck),
    [warningChecks],
  )

  const explicitWarnings = readiness.effectiveReadiness?.warnings
  const allWarningSummaries = useMemo(
    () =>
      Array.from(
        new Set([...(explicitWarnings ?? []), ...warningCheckSummaries]),
      ),
    [explicitWarnings, warningCheckSummaries],
  )

  const canIssueStart =
    taskId > 0 &&
    snapshot.status !== 'connecting' &&
    Boolean(readiness.effectiveReadiness?.canStartTask)

  return {
    ...readiness,
    canIssueStart,
    blockingChecks,
    warningChecks,
    blockingCheckSummaries,
    warningCheckSummaries,
    allWarningSummaries,
    primaryBlockReason: getPrimaryBlockReason(
      readiness.effectiveReadiness?.blockingReasons ?? [],
      blockingCheckSummaries,
    ),
  }
}
