import { getRosConnectionManager } from './client'
import { setRosDebugEvent } from './debug'
import { EXECUTION_SERVICE } from './serviceNames'

import type { ExecutionCommandName, ExecutionCommandResult } from '../../types/execution'
import type { RosServiceRequest } from '../../types/ros'

type JsonRecord = Record<string, unknown>

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

const EXECUTION_SERVICE_TYPE = EXECUTION_SERVICE.serviceType
const EXECUTION_CANONICAL_SERVICE_NAME = EXECUTION_SERVICE.canonicalName
const EXECUTION_DEPRECATED_FALLBACK_SERVICE_NAME =
  EXECUTION_SERVICE.deprecatedFallbackName

export const EXECUTION_COMMANDS = {
  START: 0,
  PAUSE: 1,
  CONTINUE: 2,
  STOP: 3,
  RETURN: 4,
} as const

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickString(record: JsonRecord, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

async function callRosService(payload: RosServiceRequest) {
  const client = getRosConnectionManager()

  const callService = (serviceName: string) =>
    client.callService<RosServiceRequest, JsonRecord>({
      serviceName,
      serviceType: EXECUTION_SERVICE_TYPE,
      request: payload,
    })

  try {
    return await callService(EXECUTION_CANONICAL_SERVICE_NAME)
  } catch (canonicalError) {
    setRosDebugEvent(
      `execution:deprecated-fallback:${EXECUTION_DEPRECATED_FALLBACK_SERVICE_NAME}`,
    )

    try {
      return await callService(EXECUTION_DEPRECATED_FALLBACK_SERVICE_NAME)
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : `Deprecated fallback execution service ${EXECUTION_DEPRECATED_FALLBACK_SERVICE_NAME} failed.`
      const normalizedFallbackError = new Error(fallbackMessage)

      if (canonicalError instanceof Error && canonicalError.message.trim().length > 0) {
        normalizedFallbackError.message = `${normalizedFallbackError.message} (canonical failure: ${canonicalError.message})`
      }

      throw normalizedFallbackError
    }
  }
}

export async function executeTaskCommand(
  command: ExecutionCommandName,
  taskId: number,
): Promise<ExecutionCommandResult> {
  if (USE_MOCK_DATA) {
    return {
      success: command === 'START' || command === 'RETURN',
      message:
        command === 'START'
          ? `accepted: start_task ${taskId}`
          : command === 'RETURN'
            ? 'accepted: dock'
            : `${command.toLowerCase()} requires active mission in mock mode`,
      command,
      taskId,
      raw: {},
    }
  }

  const payload = await callRosService({
    command: EXECUTION_COMMANDS[command],
    task_id: Math.max(0, Math.round(taskId)),
  })

  return {
    success: isRecord(payload) && typeof payload.success === 'boolean' ? payload.success : false,
    message: isRecord(payload) ? pickString(payload, 'message') : '',
    command,
    taskId,
    raw: isRecord(payload) ? payload : {},
  }
}
