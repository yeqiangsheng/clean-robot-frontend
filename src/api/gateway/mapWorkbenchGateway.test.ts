import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MapAlignment, MapEntity } from '../../types/map-editor'

const requestWorkbenchCoveragePreview = vi.hoisted(() => vi.fn())
const requestWorkbenchCoverageCommit = vi.hoisted(() => vi.fn())

vi.mock('./siteGatewayMapClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./siteGatewayMapClient')>()

  return {
    ...actual,
    requestWorkbenchCoveragePreview,
    requestWorkbenchCoverageCommit,
  }
})

const activeMap: MapEntity = {
  id: 'map-site-live',
  name: 'site_map_live',
  kind: 'map',
  displayRegion: [],
  displayPath: [],
  displayFrame: null,
  metadata: {},
  raw: {
    map_revision_id: 'rev-site-live-42',
  },
  resolution: null,
  rasterImageUrl: null,
  occupancyGrid: null,
  size: {
    width: null,
    height: null,
  },
}

const activeAlignment: MapAlignment = {
  id: 'alignment-live',
  name: 'alignment-live',
  status: 'active',
  alignmentVersion: 'align-v3',
  rawFrame: 'map',
  alignedFrame: 'map',
  active: true,
  displayFrame: null,
  rotationDeg: 0,
  pivot: {
    x: 0,
    y: 0,
  },
  metadata: {},
  raw: {},
}

const displayRegion = [
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
]

const coverageRegion = {
  display_region: displayRegion,
  display_frame: {
    frame_id: 'map',
  },
}

describe('map workbench gateway zone actions', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('VITE_USE_MOCK_DATA', 'false')
    requestWorkbenchCoveragePreview.mockReset()
    requestWorkbenchCoverageCommit.mockReset()
    const { useAppShellStore } = await import('../../stores/appShellStore')

    useAppShellStore.getState().setSession({
      user: {
        username: 'test-engineer',
        displayName: 'Test Engineer',
        role: 'engineer',
      },
      capabilities: ['mapWorkbench'],
    })
  })

  it('sends coverage preview through canonical site gateway fields', async () => {
    const { previewCoverageRegion } = await import('./mapWorkbenchGateway')
    requestWorkbenchCoveragePreview.mockResolvedValue({
      display_preview_path: displayRegion,
      estimated_length_m: 12.5,
      estimated_duration_s: 34,
      valid: true,
    })

    const preview = await previewCoverageRegion({
      map: activeMap,
      alignment: activeAlignment,
      region: coverageRegion,
      profileName: '  cover_standard  ',
    })

    expect(preview.valid).toBe(true)
    expect(requestWorkbenchCoveragePreview).toHaveBeenCalledWith({
      map_name: 'site_map_live',
      map_revision_id: 'rev-site-live-42',
      alignment_version: 'align-v3',
      region: coverageRegion,
      profile_name: 'cover_standard',
      debug_publish_markers: false,
    })
  })

  it('sends coverage commit through canonical site gateway fields', async () => {
    const { commitCoverageRegion } = await import('./mapWorkbenchGateway')
    requestWorkbenchCoverageCommit.mockResolvedValue({
      zone_id: 'zone-live-1',
      zone_version: 3,
      plan_id: 'plan-live-1',
    })

    const result = await commitCoverageRegion({
      map: activeMap,
      alignment: activeAlignment,
      region: coverageRegion,
      displayName: '  Zone Live  ',
      profileName: '  cover_standard  ',
      zoneId: 'zone-live-1',
      baseZoneVersion: 2,
    })

    expect(result).toMatchObject({
      zoneId: 'zone-live-1',
      zoneVersion: 3,
      planId: 'plan-live-1',
    })
    expect(requestWorkbenchCoverageCommit).toHaveBeenCalledWith({
      map_name: 'site_map_live',
      map_revision_id: 'rev-site-live-42',
      alignment_version: 'align-v3',
      zone_id: 'zone-live-1',
      base_zone_version: 2,
      display_name: 'Zone Live',
      region: coverageRegion,
      profile_name: 'cover_standard',
      set_active_plan: true,
    })
  })
})
