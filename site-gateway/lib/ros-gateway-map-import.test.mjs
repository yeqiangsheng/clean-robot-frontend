import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { RosGateway } from './ros-gateway.mjs'

const tempDirs = []

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'clean-robot-map-import-'))
  tempDirs.push(dir)
  return dir
}

function createGateway(mapImportPbstreamDir = '') {
  return new RosGateway({
    rosbridgeUrl: 'ws://127.0.0.1:9090',
    mapImportPbstreamDir,
  })
}

describe('RosGateway map import preflight', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) =>
        rm(dir, {
          recursive: true,
          force: true,
        }),
      ),
    )
  })

  it('rejects path-like map names before checking the filesystem', async () => {
    const gateway = createGateway('C:/maps')

    await expect(
      gateway.checkMapImportPreflight({ mapName: '../site_map_live' }),
    ).resolves.toMatchObject({
      canImport: false,
      status: 'MAP_IMPORT_INVALID_NAME',
      expectedPath: null,
    })
  })

  it('reports a missing pbstream directory configuration as a blocking environment issue', async () => {
    const gateway = createGateway('')

    await expect(
      gateway.checkMapImportPreflight({ mapName: 'site_map_live' }),
    ).resolves.toMatchObject({
      canImport: false,
      status: 'MAP_IMPORT_PBSTREAM_DIR_MISSING',
      expectedPath: null,
    })
  })

  it('blocks import when the expected pbstream file is missing', async () => {
    const dir = await createTempDir()
    const gateway = createGateway(dir)

    const preflight = await gateway.checkMapImportPreflight({
      mapName: 'site_map_live',
    })

    expect(preflight).toMatchObject({
      canImport: false,
      status: 'MAP_IMPORT_PBSTREAM_MISSING',
      expectedPath: join(dir, 'site_map_live.pbstream'),
    })
  })

  it('allows import only when the pbstream file exists', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'site_map_live.pbstream'), '')
    const gateway = createGateway(dir)

    const preflight = await gateway.checkMapImportPreflight({
      mapName: 'site_map_live',
    })

    expect(preflight).toMatchObject({
      canImport: true,
      status: 'MAP_IMPORT_READY',
      expectedPath: join(dir, 'site_map_live.pbstream'),
    })
  })

  it('turns a failed preflight into a recoverable import error before calling ROS', async () => {
    const dir = await createTempDir()
    const gateway = createGateway(dir)

    await expect(
      gateway.importCurrentMapAsset({
        mapName: 'site_map_live',
        setActive: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'MAP_IMPORT_PBSTREAM_MISSING',
      recoverable: true,
    })
  })
})
