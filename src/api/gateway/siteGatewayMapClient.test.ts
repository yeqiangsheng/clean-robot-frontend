import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  requestWorkbenchCoverageCommit,
  requestWorkbenchCoveragePreview,
} from './siteGatewayMapClient'

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('siteGatewayMapClient workbench routes', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('keeps coverage preview on the site gateway preview endpoint', async () => {
    const payload = {
      map_name: 'site_map_live',
      map_revision_id: 'rev-site-live-42',
      alignment_version: 'align-v3',
      region: [],
      profile_name: 'cover_standard',
      debug_publish_markers: false,
    }

    await requestWorkbenchCoveragePreview(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workbench/zones/coverage-preview',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
  })

  it('keeps coverage commit on the canonical site gateway zone endpoint', async () => {
    const payload = {
      map_name: 'site_map_live',
      map_revision_id: 'rev-site-live-42',
      alignment_version: 'align-v3',
      zone_id: 'zone-live-1',
      base_zone_version: 2,
      display_name: 'Zone Live',
      region: [],
      profile_name: 'cover_standard',
      set_active_plan: true,
    }

    await requestWorkbenchCoverageCommit(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workbench/zones',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
  })
})
