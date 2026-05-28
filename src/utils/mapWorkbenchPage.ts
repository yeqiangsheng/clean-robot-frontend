import type { GatewayErrorShape } from '../types/appShell'
import type { MapCatalogEntry } from '../types/mapCatalog'
import type { AreaEntity, LayerKey, MapEntity, WorkbenchSelection } from '../types/map-editor'
import { formatNumber } from './geometry'

export const kindLabelMap: Record<LayerKey, string> = {
  map: '地图',
  zone: '覆盖区',
  noGoArea: '禁入区',
  virtualWall: '虚拟墙',
}

export type WorkbenchEntity = MapEntity | AreaEntity
export type WorkbenchEntityGroup = {
  key: LayerKey
  title: string
  entities: WorkbenchEntity[]
}

export type MapAssetImportFormValues = {
  mapName: string
  description: string
  setActive: boolean
}

export type MapImportFeedbackState = {
  type: 'success' | 'warning' | 'error'
  message: string
}

export type MapImportPreflightResult = {
  canImport: boolean
  status: string
  message: string
  expectedPath: string | null
}

export type MapAssetFeedbackState = {
  type: 'success' | 'warning' | 'error'
  title: string
  message?: string
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
}

export function getMapRevisionId(entry: MapCatalogEntry) {
  return (
    entry.revisionId ||
    (typeof entry.raw.map_revision_id === 'string' ? entry.raw.map_revision_id : '') ||
    (typeof entry.raw.revision_id === 'string' ? entry.raw.revision_id : '') ||
    ''
  )
}

export function isProtectedMapAsset(entry: MapCatalogEntry) {
  return entry.enabled || entry.isActive || entry.isRuntime || entry.isPendingSwitch
}

export function formatBlockedReasons(reasons: string[]) {
  return reasons.length > 0 ? reasons.join('；') : ''
}

export function findSelectedEntity(
  selection: WorkbenchSelection,
  map: MapEntity | null,
  zones: AreaEntity[],
  noGoAreas: AreaEntity[],
  virtualWalls: AreaEntity[],
) {
  if (!selection) {
    return map
  }

  if (selection.kind === 'map') {
    return map?.id === selection.id ? map : null
  }

  const entityCollections: Record<Exclude<LayerKey, 'map'>, AreaEntity[]> = {
    zone: zones,
    noGoArea: noGoAreas,
    virtualWall: virtualWalls,
  }

  return (
    entityCollections[selection.kind].find((entity) => entity.id === selection.id) ?? null
  )
}

export function getEntityList(
  map: MapEntity | null,
  zones: AreaEntity[],
  noGoAreas: AreaEntity[],
  virtualWalls: AreaEntity[],
) {
  return [
    ...(map ? [map] : []),
    ...zones,
    ...noGoAreas,
    ...virtualWalls,
  ] satisfies WorkbenchEntity[]
}

export function getEntityGroups(
  map: MapEntity | null,
  zones: AreaEntity[],
  noGoAreas: AreaEntity[],
  virtualWalls: AreaEntity[],
) {
  return [
    {
      key: 'map',
      title: '地图',
      entities: map ? [map] : [],
    },
    {
      key: 'zone',
      title: '覆盖区',
      entities: zones,
    },
    {
      key: 'noGoArea',
      title: '禁入区',
      entities: noGoAreas,
    },
    {
      key: 'virtualWall',
      title: '虚拟墙',
      entities: virtualWalls,
    },
  ] satisfies WorkbenchEntityGroup[]
}

export function buildDefaultZoneName() {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')

  return `zone_${stamp}`
}

export function buildDefaultNoGoName() {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')

  return `no_go_${stamp}`
}

export function buildDefaultWallName() {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')

  return `virtual_wall_${stamp}`
}

export function detectWorkbenchDrawerViewport() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.matchMedia(
    '(max-width: 1366px) and (min-width: 901px) and (orientation: landscape)',
  ).matches
}

export function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function toBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true
    }

    if (value === 'false') {
      return false
    }
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  return null
}

export function getTrimmedRawString(
  entity: AreaEntity | null,
  key: string,
) {
  const value = entity?.raw[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

export function buildZonePreviewFeedbackMessage(options: {
  estimatedLengthM: number | null
  estimatedDurationS: number | null
  areaM2: number | null
}) {
  const parts: string[] = []

  if (options.estimatedLengthM !== null) {
    parts.push(`预计长度 ${formatNumber(options.estimatedLengthM, 1)} m`)
  }

  if (options.estimatedDurationS !== null) {
    parts.push(`预计时长 ${formatNumber(options.estimatedDurationS, 0)} s`)
  }

  if (options.areaM2 !== null) {
    parts.push(`影响范围 ${formatNumber(options.areaM2, 1)} m²`)
  }

  return parts.join(' | ') || '后端已返回新的覆盖路径预览。'
}

export function toGatewayErrorShape(error: unknown): GatewayErrorShape | null {
  if (
    error instanceof Error &&
    'code' in error &&
    'source' in error &&
    'recoverable' in error &&
    'requiresEngineer' in error &&
    'missingDependency' in error
  ) {
    return error as GatewayErrorShape
  }

  return null
}

export function formatMapImportBlockedFeedback(
  preflight: MapImportPreflightResult,
): MapImportFeedbackState {
  switch (preflight.status) {
    case 'MAP_IMPORT_INVALID_NAME':
      return {
        type: 'warning',
        message: '请填写与现场保存的 pbstream 文件完全一致的地图名称，再重新检查。',
      }
    case 'MAP_IMPORT_PBSTREAM_MISSING':
      return {
        type: 'warning',
        message:
          preflight.expectedPath?.trim()
            ? `当前环境缺少 pbstream 文件，暂不可导入。请先确认文件存在：${preflight.expectedPath}`
            : preflight.message,
      }
    case 'MAP_IMPORT_PBSTREAM_DIR_MISSING':
      return {
        type: 'error',
        message: preflight.message,
      }
    default:
      return {
        type: preflight.canImport ? 'success' : 'warning',
        message: preflight.message,
      }
  }
}

export function formatMapImportFailureFeedback(
  error: unknown,
  phase: 'preflight' | 'import',
): MapImportFeedbackState {
  const gatewayError = toGatewayErrorShape(error)
  const fallbackMessage =
    error instanceof Error
      ? error.message
      : phase === 'preflight'
        ? '导入前置检查失败，暂不发起导入。'
        : '地图资产导入失败，请稍后重试。'

  if (gatewayError) {
    switch (gatewayError.code) {
      case 'MAP_IMPORT_INVALID_NAME':
        return {
          type: 'warning',
          message: '请填写与现场保存的 pbstream 文件完全一致的地图名称，再重新尝试。',
        }
      case 'MAP_IMPORT_PBSTREAM_MISSING':
        return {
          type: 'warning',
          message: gatewayError.message,
        }
      case 'MAP_IMPORT_PBSTREAM_DIR_MISSING':
        return {
          type: 'error',
          message: gatewayError.message,
        }
      default:
        if (gatewayError.missingDependency) {
          return {
            type: 'error',
            message:
              phase === 'preflight'
                ? `导入前置检查接口暂不可用，请检查 ${gatewayError.missingDependency}。后端返回：${gatewayError.message}`
                : `地图资产导入接口暂不可用，请检查 ${gatewayError.missingDependency}。后端返回：${gatewayError.message}`,
          }
        }

        if (gatewayError.code === 'GATEWAY_HTTP_ERROR') {
          return {
            type: 'error',
            message:
              phase === 'preflight'
                ? `导入前置检查失败，站点网关暂时没有给出有效响应。后端返回：${gatewayError.message}`
                : `地图资产导入失败，站点网关暂时没有给出有效响应。后端返回：${gatewayError.message}`,
          }
        }
    }
  }

  if (/pbstream|no such file|not found|missing/i.test(fallbackMessage)) {
    return {
      type: 'warning',
      message: `当前环境缺少 pbstream 文件，暂不可导入。后端返回：${fallbackMessage}`,
    }
  }

  return {
    type: 'error',
    message:
      phase === 'preflight'
        ? `导入前置检查失败：${fallbackMessage}`
        : `地图资产导入失败：${fallbackMessage}`,
  }
}
