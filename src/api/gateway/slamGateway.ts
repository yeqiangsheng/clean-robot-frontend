import {
  cancelSlamWorkflowJob,
  submitPrepareForTask,
  submitRelocalize,
  submitSaveMap,
  submitStartMapping,
  submitStopMapping,
  submitSwitchMapAndLocalize,
  syncSlamRuntimeState,
} from '../ros/slamWorkflowServices'
import { assertCapabilityAllowed, normalizeGatewayError } from './accessControl'
import { recordAuditEvent } from './auditTrail'
import type {
  SlamActionKind,
  SlamCancelJobResponse,
  SlamSubmitJobResponse,
  SlamSyncRuntimeStateResponse,
  SubmitSlamWorkflowRequest,
} from '../../types/slam-workflow'

export async function runSlamAction(
  actionKind: SlamActionKind,
  payload?: SubmitSlamWorkflowRequest,
): Promise<SlamSubmitJobResponse>
export async function runSlamAction(
  actionKind: 'cancel_job',
  payload: { jobId: string },
): Promise<SlamCancelJobResponse>
export async function runSlamAction(
  actionKind: 'sync_runtime_state',
): Promise<SlamSyncRuntimeStateResponse>
export async function runSlamAction(
  actionKind: SlamActionKind | 'cancel_job' | 'sync_runtime_state',
  payload: SubmitSlamWorkflowRequest | { jobId: string } | undefined = undefined,
) {
  try {
    assertCapabilityAllowed('slamWorkbench', `SLAM action ${actionKind}`)
    const workflowPayload = (payload ?? {}) as SubmitSlamWorkflowRequest

    let result:
      | SlamSubmitJobResponse
      | SlamCancelJobResponse
      | SlamSyncRuntimeStateResponse

    switch (actionKind) {
      case 'prepare_for_task':
        result = await submitPrepareForTask(workflowPayload)
        break
      case 'switch_map_and_localize':
        result = await submitSwitchMapAndLocalize(workflowPayload)
        break
      case 'relocalize':
        result = await submitRelocalize(workflowPayload)
        break
      case 'start_mapping':
        result = await submitStartMapping(workflowPayload)
        break
      case 'save_map':
        result = await submitSaveMap(workflowPayload)
        break
      case 'stop_mapping':
        result = await submitStopMapping(workflowPayload)
        break
      case 'cancel_job':
        result = await cancelSlamWorkflowJob(
          (payload as { jobId: string } | undefined)?.jobId ?? '',
        )
        break
      case 'sync_runtime_state':
        result = await syncSlamRuntimeState()
        break
      default:
        throw new Error(`Unsupported SLAM action: ${String(actionKind)}`)
    }

    recordAuditEvent({
      category: 'slam',
      action: actionKind,
      target: '/slam_workflow/*',
      status: 'success',
      message: 'SLAM action completed through the gateway.',
      detail: (payload ?? {}) as Record<string, unknown>,
    })

    return result
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'SLAM_ACTION_FAILED',
      source: 'slam-gateway',
      message: 'SLAM action failed.',
      recoverable: true,
      requiresEngineer: true,
    })

    recordAuditEvent({
      category: 'slam',
      action: actionKind,
      target: '/slam_workflow/*',
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: (payload ?? {}) as Record<string, unknown>,
    })

    throw normalizedError
  }
}
