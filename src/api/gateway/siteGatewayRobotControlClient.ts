import type { AuditEventRecord } from '../../types/appShell'
import type { ActuatorCommand, ActuatorStatus } from '../../types/actuator'
import type { DockCalibrationCommandInput, DockCalibrationCommandResult, DockCalibrationStatusResult } from '../../types/dockCalibration'
import type { ExecutionCommandName } from '../../types/execution'
import type { ManualDriveCommandInput, ManualDriveCommandResult, ManualDriveStatus } from '../../types/manualDrive'
import type { SlamActionKind, SubmitSlamWorkflowRequest } from '../../types/slam-workflow'
import { appendAuditEventFromResponse, buildQueryString, requestJson } from './siteGatewayHttp'

export async function requestExecutionCommand(command: ExecutionCommandName, taskId: number) {
  const result = await requestJson<{
    success: boolean
    message: string
    command: ExecutionCommandName
    taskId: number
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>('/execution/commands', {
    method: 'POST',
    body: JSON.stringify({ command, taskId }),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestDockCalibrationStatus(robotId?: string) {
  return requestJson<DockCalibrationStatusResult>(
    `/dock-calibration/status${buildQueryString({ robotId })}`,
  )
}

export async function requestDockCalibrationCommand(command: DockCalibrationCommandInput) {
  const result = await requestJson<
    DockCalibrationCommandResult & { auditEvent?: AuditEventRecord }
  >('/dock-calibration/command', {
    method: 'POST',
    body: JSON.stringify(command),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestManualDriveStatus() {
  return requestJson<ManualDriveStatus>('/manual-drive/status')
}

export async function requestManualDriveCommand(command: ManualDriveCommandInput) {
  const result = await requestJson<ManualDriveCommandResult & { auditEvent?: AuditEventRecord }>(
    '/manual-drive/command',
    {
      method: 'POST',
      body: JSON.stringify(command),
    },
  )
  appendAuditEventFromResponse(result)
  return result
}

export async function requestSlamAction(
  actionKind: SlamActionKind,
  payload: SubmitSlamWorkflowRequest | undefined = undefined,
) {
  const result = await requestJson<Record<string, unknown>>('/slam/actions', {
    method: 'POST',
    body: JSON.stringify({ actionKind, payload }),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestActuatorStatus() {
  return requestJson<ActuatorStatus>('/actuators/status')
}

export async function requestActuatorCommand(command: ActuatorCommand) {
  const result = await requestJson<{
    ok?: boolean
    success: boolean
    kind?: string
    message?: string
    lastCommand?: ActuatorStatus['lastCommand']
    auditEvent?: AuditEventRecord
  }>(
    '/actuator/commands',
    {
      method: 'POST',
      body: JSON.stringify({ command }),
    },
  )
  appendAuditEventFromResponse(result)
  return result
}
