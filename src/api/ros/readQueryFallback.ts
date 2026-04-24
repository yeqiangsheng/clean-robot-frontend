import { setRosDebugEvent } from './debug'
import { getRosConnectionManager } from './client'

import type {
  RosServiceRequest,
  RosServiceResponse,
} from '../../types/ros'
import {
  getDeprecatedReadQueryFallback,
  type RosReadQueryContract,
} from './queryContracts'

export type AppFirstReadQueryDecision<TValue> =
  | {
      kind: 'success'
      value: TValue
    }
  | {
      kind: 'fallback'
      reason: string
    }
  | {
      kind: 'error'
      error: Error
    }

function normalizeError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return new Error(error.trim())
  }

  return new Error(fallbackMessage)
}

export async function callAppFirstReadQueryService<
  TRequest extends RosServiceRequest,
  TResponse extends RosServiceResponse,
  TResult,
>(options: {
  contract: RosReadQueryContract
  request: TRequest
  evaluateAppResponse: (payload: TResponse) => AppFirstReadQueryDecision<TResult>
  mapLegacyResponse: (payload: TResponse) => TResult
}) {
  const client = getRosConnectionManager()
  let fallbackReason = ''
  let appPayload: TResponse | null = null
  const { canonical } = options.contract
  const deprecatedFallback = getDeprecatedReadQueryFallback(options.contract)

  try {
    appPayload = await client.callService<TRequest, TResponse>({
      serviceName: canonical.serviceName,
      serviceType: canonical.serviceType,
      request: options.request,
    })
  } catch (error) {
    fallbackReason = normalizeError(
      error,
      `Canonical query ${canonical.serviceName} failed.`,
    ).message
  }

  if (!fallbackReason && appPayload) {
    const decision = options.evaluateAppResponse(appPayload)

    if (decision.kind === 'success') {
      return decision.value
    }

    if (decision.kind === 'error') {
      throw decision.error
    }

    fallbackReason = decision.reason
  }

  if (!deprecatedFallback) {
    throw new Error(
      fallbackReason ||
        `Canonical query ${canonical.serviceName} returned no usable payload.`,
    )
  }

  setRosDebugEvent(`query:deprecated-fallback:${options.contract.key}`)

  try {
    const payload = await client.callService<TRequest, TResponse>({
      serviceName: deprecatedFallback.serviceName,
      serviceType: deprecatedFallback.serviceType,
      request: options.request,
    })

    return options.mapLegacyResponse(payload)
  } catch (error) {
    const normalizedLegacyError = normalizeError(
      error,
      `Deprecated fallback query ${deprecatedFallback.serviceName} failed.`,
    )

    if (fallbackReason) {
      normalizedLegacyError.message = `${normalizedLegacyError.message} (app fallback reason: ${fallbackReason})`
    }

    throw normalizedLegacyError
  }
}
