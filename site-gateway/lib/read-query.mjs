import { getDeprecatedReadQueryFallback } from './read-query-contracts.mjs'

function normalizeError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return new Error(error.trim())
  }

  return new Error(fallbackMessage)
}

export async function callAppFirstReadQueryService(gateway, options) {
  let fallbackReason = ''
  let appPayload = null
  const { canonical } = options.contract
  const deprecatedFallback = getDeprecatedReadQueryFallback(options.contract)

  try {
    appPayload = await gateway.callService({
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

  try {
    const payload = await gateway.callService({
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
