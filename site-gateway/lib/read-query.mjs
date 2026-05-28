function normalizeError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return new Error(error.trim())
  }

  return new Error(fallbackMessage)
}

export async function callAppReadQueryService(gateway, options) {
  const { canonical } = options.contract

  try {
    const payload = await gateway.callService({
      serviceName: canonical.serviceName,
      serviceType: canonical.serviceType,
      request: options.request,
    })

    const decision = options.evaluateResponse(payload)

    if (decision.kind === 'success') {
      return decision.value
    }

    if (decision.kind === 'error') {
      throw decision.error
    }

    throw new Error(
      decision.reason ||
        `Canonical query ${canonical.serviceName} returned no usable payload.`,
    )
  } catch (error) {
    throw normalizeError(error, `Canonical query ${canonical.serviceName} failed.`)
  }
}
