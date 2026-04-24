import { useEffect, useMemo, useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import {
  ApartmentOutlined,
  ClusterOutlined,
  MenuOutlined,
  ProfileOutlined,
  RadarChartOutlined,
} from '@ant-design/icons'

import { MapCanvas } from '../components/canvas/MapCanvas'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { AppLoadingState } from '../components/feedback/AppLoadingState'
import { NoGoEditorPanel } from '../components/constraint-editor/NoGoEditorPanel'
import { NoGoEditorToolbar } from '../components/constraint-editor/NoGoEditorToolbar'
import { NoGoDetailsPanel } from '../components/constraint-editor/NoGoDetailsPanel'
import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { VirtualWallDetailsPanel } from '../components/wall-editor/VirtualWallDetailsPanel'
import { VirtualWallEditorPanel } from '../components/wall-editor/VirtualWallEditorPanel'
import { VirtualWallEditorToolbar } from '../components/wall-editor/VirtualWallEditorToolbar'
import { ZoneEditorToolbar } from '../components/zone-editor/ZoneEditorToolbar'
import { ZonePreviewPanel } from '../components/zone-editor/ZonePreviewPanel'
import { useInputCapabilities } from '../hooks/useInputCapabilities'
import { useMapWorkbenchData } from '../hooks/useMapWorkbenchData'
import { useProfileCatalog } from '../hooks/useProfileCatalog'
import { useRosDebug } from '../hooks/useRosDebug'
import { useRosConnection } from '../hooks/useRosConnection'
import { useZoneCommit } from '../hooks/useZoneCommit'
import { useZonePreview } from '../hooks/useZonePreview'
import { useZoneRectPreview } from '../hooks/useZoneRectPreview'
import {
  addNoGoArea,
  addVirtualWall,
  deleteCoverageZone,
  deleteNoGoArea,
  deleteVirtualWall,
  fetchCoverageZoneDetail,
  fetchZonePlanPath,
  fetchNoGoAreaDetail,
  fetchVirtualWallDetail,
  checkMapImportPreflight,
  importCurrentMapAsset,
  modifyNoGoArea,
  modifyVirtualWall,
} from '../api/gateway/robotGateway'
import { useConstraintEditorStore } from '../stores/constraintEditorStore'
import { useMapWorkbenchStore } from '../stores/mapWorkbenchStore'
import { useZoneEditorStore } from '../stores/zoneEditorStore'
import type { GatewayErrorShape } from '../types/appShell'
import type {
  AreaEntity,
  LayerKey,
  MapEntity,
  NoGoEditSession,
  Point2D,
  ZonePlanPathResult,
  VirtualWallEditSession,
  WorkbenchEditorMode,
  WorkbenchSelection,
} from '../types/map-editor'
import type { RosServiceRequest } from '../types/ros'
import { formatNumber } from '../utils/geometry'
import {
  buildWallPathRequest,
  createWallDraftFromPath,
  getWallEndpoints,
  updateWallPathEndpoint,
} from '../utils/constraint-editor'
import {
  buildRectRegionFromDiagonal,
  createRectDraftFromRegion,
  getRectCorners,
  updateRectRegionFromDraggedCorner,
} from '../utils/zone-editor'
import './MapWorkbenchPage.css'

const kindLabelMap: Record<LayerKey, string> = {
  map: '地图',
  zone: '覆盖区',
  noGoArea: '禁入区',
  virtualWall: '虚拟墙',
}

const kindColorMap: Record<LayerKey, string> = {
  map: 'default',
  zone: 'green',
  noGoArea: 'orange',
  virtualWall: 'blue',
}

type WorkbenchEntity = MapEntity | AreaEntity
type WorkbenchEntityGroup = {
  key: LayerKey
  title: string
  emptyText: string
  entities: WorkbenchEntity[]
}

type MapAssetImportFormValues = {
  mapName: string
  description: string
  setActive: boolean
}

type MapImportFeedbackState = {
  type: 'success' | 'warning' | 'error'
  message: string
}

type MapImportPreflightResult = {
  canImport: boolean
  status: string
  message: string
  expectedPath: string | null
}

function getConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: '已连接' }
    case 'connecting':
      return { color: 'processing', label: '连接中' }
    case 'error':
      return { color: 'error', label: '异常' }
    case 'mock':
      return { color: 'purple', label: '模拟数据' }
    case 'closed':
      return { color: 'warning', label: '已关闭' }
    default:
      return { color: 'default', label: '空闲' }
  }
}

function findSelectedEntity(
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

function getEntityList(
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

function getEntityGroups(
  map: MapEntity | null,
  zones: AreaEntity[],
  noGoAreas: AreaEntity[],
  virtualWalls: AreaEntity[],
) {
  return [
    {
      key: 'map',
      title: '地图',
      emptyText: '暂未加载到地图元数据。',
      entities: map ? [map] : [],
    },
    {
      key: 'zone',
      title: '覆盖区',
      emptyText: '当前没有可用覆盖区。',
      entities: zones,
    },
    {
      key: 'noGoArea',
      title: '禁入区',
      emptyText: '后端当前没有返回禁入区。',
      entities: noGoAreas,
    },
    {
      key: 'virtualWall',
      title: '虚拟墙',
      emptyText: '后端当前没有返回虚拟墙。',
      entities: virtualWalls,
    },
  ] satisfies WorkbenchEntityGroup[]
}

function getMetadataEntries(entity: WorkbenchEntity | null) {
  if (!entity) {
    return []
  }

  return Object.entries(entity.metadata).slice(0, 12)
}

function getMapName(map: MapEntity | null) {
  return (map?.raw.map_name as string | undefined) ?? map?.name ?? '--'
}

function buildDefaultZoneName() {
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

function buildDefaultNoGoName() {
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

function buildDefaultWallName() {
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

function detectWorkbenchDrawerViewport() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.matchMedia(
    '(max-width: 1366px) and (min-width: 901px) and (orientation: landscape)',
  ).matches
}

function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toBoolean(value: unknown) {
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

function getTrimmedRawString(
  entity: AreaEntity | null,
  key: string,
) {
  const value = entity?.raw[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function buildZonePreviewFeedbackMessage(options: {
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

function toGatewayErrorShape(error: unknown): GatewayErrorShape | null {
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

function formatMapImportBlockedFeedback(
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

function formatMapImportFailureFeedback(
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

export function MapWorkbenchPage() {
  const [mapImportForm] = Form.useForm<MapAssetImportFormValues>()
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [draftDisplayName, setDraftDisplayName] = useState(buildDefaultZoneName)
  const [profileName, setProfileName] = useState('')
  const [draftNoGoName, setDraftNoGoName] = useState(buildDefaultNoGoName)
  const [draftWallName, setDraftWallName] = useState(buildDefaultWallName)
  const [draftWallEnabled, setDraftWallEnabled] = useState(true)
  const [draftWallBufferM, setDraftWallBufferM] = useState<number | null>(0.2)
  const [isLoadingZoneDetail, setIsLoadingZoneDetail] = useState(false)
  const [isLoadingNoGoDetail, setIsLoadingNoGoDetail] = useState(false)
  const [isLoadingWallDetail, setIsLoadingWallDetail] = useState(false)
  const [isDeletingZone, setIsDeletingZone] = useState(false)
  const [zoneActionFeedback, setZoneActionFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [zoneCommitFeedback, setZoneCommitFeedback] = useState<{
    mode: 'create' | 'edit'
    zoneId: string
    zoneVersion: number | null
    planId: string | null
    warnings: string[]
  } | null>(null)
  const [zonePreviewFeedback, setZonePreviewFeedback] = useState<{
    type: 'success' | 'warning'
    message: string
  } | null>(null)
  const [isImportingMapAsset, setIsImportingMapAsset] = useState(false)
  const [isCheckingMapImport, setIsCheckingMapImport] = useState(false)
  const [mapImportFeedback, setMapImportFeedback] = useState<MapImportFeedbackState | null>(null)
  const [isToolsDrawerOpen, setIsToolsDrawerOpen] = useState(false)
  const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false)
  const [isTabletDrawerViewport, setIsTabletDrawerViewport] = useState(
    detectWorkbenchDrawerViewport,
  )
  const queryClient = useQueryClient()
  const { isTouchCapable, isCoarsePointer } = useInputCapabilities()
  const { snapshot, defaultUrl, connect } = useRosConnection()
  const servicesReady = snapshot.status !== 'connecting'
  const rosDebug = useRosDebug()
  const {
    data,
    isInitialLoading,
    mapError,
    mapQueryFetchStatus,
    mapQueryStatus,
    zonesQueryFetchStatus,
    zonesQueryStatus,
    zonesError,
    noGoAreasError,
    virtualWallsError,
  } = useMapWorkbenchData(snapshot)

  const {
    layerVisibility,
    selected,
    showSelectedZoneOnly,
    showSelectedZonePath,
    select,
    setLayerVisibility,
    setShowSelectedZoneOnly,
    setShowSelectedZonePath,
  } = useMapWorkbenchStore()
  const zoneMode = useZoneEditorStore((state) => state.mode)
  const activeAlignment = useZoneEditorStore((state) => state.activeAlignment)
  const editingZone = useZoneEditorStore((state) => state.editingZone)
  const zoneDraftRectPoints = useZoneEditorStore((state) => state.draftRectPoints)
  const zoneDraftDisplayRegion = useZoneEditorStore(
    (state) => state.draftDisplayRegion,
  )
  const zoneDraftRect = useZoneEditorStore((state) => state.draftRect)
  const draftPreview = useZoneEditorStore((state) => state.draftPreview)
  const zoneLastError = useZoneEditorStore((state) => state.lastError)
  const startCreatingZone = useZoneEditorStore((state) => state.startCreatingZone)
  const startEditingZone = useZoneEditorStore((state) => state.startEditingZone)
  const cancelZoneMode = useZoneEditorStore((state) => state.cancelMode)
  const setActiveAlignment = useZoneEditorStore((state) => state.setActiveAlignment)
  const setZoneDraftRectPoints = useZoneEditorStore(
    (state) => state.setDraftRectPoints,
  )
  const setZoneDraftDisplayRegion = useZoneEditorStore(
    (state) => state.setDraftDisplayRegion,
  )
  const setZoneDraftRect = useZoneEditorStore((state) => state.setDraftRect)
  const setDraftPreview = useZoneEditorStore((state) => state.setDraftPreview)
  const setZoneLastError = useZoneEditorStore((state) => state.setLastError)
  const setSelectedZoneId = useZoneEditorStore((state) => state.setSelectedZoneId)

  const constraintMode = useConstraintEditorStore((state) => state.mode)
  const editingNoGo = useConstraintEditorStore((state) => state.editingNoGo)
  const editingWall = useConstraintEditorStore((state) => state.editingWall)
  const noGoDraftRectPoints = useConstraintEditorStore(
    (state) => state.draftRectPoints,
  )
  const noGoDraftDisplayRegion = useConstraintEditorStore(
    (state) => state.draftDisplayRegion,
  )
  const noGoDraftRect = useConstraintEditorStore((state) => state.draftRect)
  const draftWallPoints = useConstraintEditorStore((state) => state.draftWallPoints)
  const draftWallPath = useConstraintEditorStore((state) => state.draftWallPath)
  const draftWall = useConstraintEditorStore((state) => state.draftWall)
  const constraintSaveLoading = useConstraintEditorStore((state) => state.saveLoading)
  const constraintDeleteLoading = useConstraintEditorStore(
    (state) => state.deleteLoading,
  )
  const constraintLastError = useConstraintEditorStore((state) => state.lastError)
  const startCreatingNoGo = useConstraintEditorStore(
    (state) => state.startCreatingNoGo,
  )
  const startEditingNoGo = useConstraintEditorStore(
    (state) => state.startEditingNoGo,
  )
  const startCreatingWall = useConstraintEditorStore(
    (state) => state.startCreatingWall,
  )
  const startEditingWall = useConstraintEditorStore(
    (state) => state.startEditingWall,
  )
  const cancelConstraintMode = useConstraintEditorStore(
    (state) => state.cancelMode,
  )
  const setSelectedNoGoAreaId = useConstraintEditorStore(
    (state) => state.setSelectedNoGoAreaId,
  )
  const setSelectedWallId = useConstraintEditorStore((state) => state.setSelectedWallId)
  const setNoGoDraftRectPoints = useConstraintEditorStore(
    (state) => state.setDraftRectPoints,
  )
  const setNoGoDraftDisplayRegion = useConstraintEditorStore(
    (state) => state.setDraftDisplayRegion,
  )
  const setNoGoDraftRect = useConstraintEditorStore((state) => state.setDraftRect)
  const setDraftWallPoints = useConstraintEditorStore((state) => state.setDraftWallPoints)
  const setDraftWallPath = useConstraintEditorStore((state) => state.setDraftWallPath)
  const setDraftWall = useConstraintEditorStore((state) => state.setDraftWall)
  const setConstraintSaveLoading = useConstraintEditorStore(
    (state) => state.setSaveLoading,
  )
  const setConstraintDeleteLoading = useConstraintEditorStore(
    (state) => state.setDeleteLoading,
  )
  const setConstraintLastError = useConstraintEditorStore(
    (state) => state.setLastError,
  )

  const effectiveAlignment = activeAlignment ?? data.alignment
  const hasMap = Boolean(data.map)
  const hasAlignment = Boolean(effectiveAlignment?.alignmentVersion)
  const inferredZoneProfileName = useMemo(() => {
    const rawProfile = data.zones[0]?.raw.plan_profile_name
    return typeof rawProfile === 'string' && rawProfile.trim().length > 0
      ? rawProfile.trim()
      : ''
  }, [data.zones])

  const entityList = useMemo(
    () => getEntityList(data.map, data.zones, data.noGoAreas, data.virtualWalls),
    [data.map, data.noGoAreas, data.virtualWalls, data.zones],
  )
  const entityGroups = useMemo(
    () => getEntityGroups(data.map, data.zones, data.noGoAreas, data.virtualWalls),
    [data.map, data.noGoAreas, data.virtualWalls, data.zones],
  )

  const selectedEntity = useMemo(
    () =>
      findSelectedEntity(
        selected,
        data.map,
        data.zones,
        data.noGoAreas,
        data.virtualWalls,
      ),
    [data.map, data.noGoAreas, data.virtualWalls, data.zones, selected],
  )
  const selectedZoneEntity =
    selectedEntity && selectedEntity.kind === 'zone' ? selectedEntity : null
  const selectedNoGoAreaEntity =
    selectedEntity && selectedEntity.kind === 'noGoArea' ? selectedEntity : null
  const selectedVirtualWallEntity =
    selectedEntity && selectedEntity.kind === 'virtualWall' ? selectedEntity : null
  const workspaceMapName = useMemo(() => {
    const mapNameFromMap =
      (data.map?.raw.map_name as string | undefined)?.trim() || data.map?.name?.trim()

    if (mapNameFromMap) {
      return mapNameFromMap
    }

    for (const entity of [...data.zones, ...data.noGoAreas, ...data.virtualWalls]) {
      const rawMapName = entity.raw.map_name
      if (typeof rawMapName === 'string' && rawMapName.trim().length > 0) {
        return rawMapName.trim()
      }
    }

    return ''
  }, [data.map, data.noGoAreas, data.virtualWalls, data.zones])
  const hasWorkspaceContext = hasMap || workspaceMapName.length > 0
  const hasDrawableLayers =
    data.zones.length > 0 || data.noGoAreas.length > 0 || data.virtualWalls.length > 0
  const useDrawerPanels =
    (isTouchCapable || isCoarsePointer) && isTabletDrawerViewport
  const selectedZoneAlignmentVersion =
    getTrimmedRawString(selectedZoneEntity, 'alignment_version') ||
    effectiveAlignment?.alignmentVersion ||
    ''
  const selectedZonePlanProfileName = getTrimmedRawString(
    selectedZoneEntity,
    'plan_profile_name',
  )
  const selectedZonePathQuery = useQuery({
    queryKey: [
      'workbench',
      'zone-plan-path',
      workspaceMapName || 'no-map',
      selectedZoneEntity?.id ?? 'none',
      selectedZoneAlignmentVersion || 'default-alignment',
      selectedZonePlanProfileName || 'default-profile',
      snapshot.url,
      snapshot.sessionId,
    ],
    queryFn: () =>
      fetchZonePlanPath({
        map: data.map,
        mapName: workspaceMapName,
        zoneId: selectedZoneEntity?.id ?? '',
        alignmentVersion: selectedZoneAlignmentVersion,
        planProfileName: selectedZonePlanProfileName,
      }),
    enabled:
      servicesReady &&
      showSelectedZonePath &&
      Boolean(selectedZoneEntity?.id) &&
      workspaceMapName.length > 0,
    retry: false,
    staleTime: 15_000,
  })
  const selectedZonePathResult: ZonePlanPathResult | null =
    showSelectedZonePath &&
    selectedZoneEntity &&
    selectedZonePathQuery.data &&
    selectedZonePathQuery.data.zoneId === selectedZoneEntity.id
      ? selectedZonePathQuery.data
      : null
  const visibleZones = useMemo(() => {
    if (showSelectedZoneOnly) {
      return selectedZoneEntity ? [selectedZoneEntity] : []
    }

    return layerVisibility.zone ? data.zones : []
  }, [data.zones, layerVisibility.zone, selectedZoneEntity, showSelectedZoneOnly])
  const isZoneListLoading =
    hasMap &&
    data.zones.length === 0 &&
    !zonesError &&
    (zonesQueryStatus === 'pending' || zonesQueryFetchStatus === 'fetching')
  const planProfileCatalog = useProfileCatalog({
    profileKind: 'plan',
    mapName: workspaceMapName,
    selectedProfileNames: [
      profileName,
      inferredZoneProfileName,
      editingZone?.profileName ?? null,
    ],
  })
  const defaultPlanProfileName =
    planProfileCatalog.defaultEntry?.profileName ?? inferredZoneProfileName
  const effectiveProfileName = profileName.trim() || defaultPlanProfileName
  const { previewRectZone, isPreviewingRect } = useZoneRectPreview(
    data.map,
    effectiveAlignment,
    workspaceMapName,
  )
  const { previewZone, isPreviewingZone } = useZonePreview(
    data.map,
    effectiveAlignment,
    workspaceMapName,
  )
  const { commitZone, isCommittingZone } = useZoneCommit(
    data.map,
    effectiveAlignment,
    workspaceMapName,
  )
  const zoneEditableCorners = useMemo(
    () =>
      zoneMode === 'editing-zone'
        ? getRectCorners(
            zoneDraftDisplayRegion ?? zoneDraftRect?.displayRegion ?? null,
          )
        : [],
    [zoneDraftDisplayRegion, zoneDraftRect?.displayRegion, zoneMode],
  )
  const noGoEditableCorners = useMemo(
    () =>
      constraintMode === 'editing-no-go'
        ? getRectCorners(
            noGoDraftDisplayRegion ?? noGoDraftRect?.displayRegion ?? null,
          )
        : [],
    [constraintMode, noGoDraftDisplayRegion, noGoDraftRect?.displayRegion],
  )
  const wallEditableEndpoints = useMemo(
    () =>
      constraintMode === 'editing-wall'
        ? getWallEndpoints(draftWallPath ?? draftWall?.displayPath ?? null)
        : [],
    [constraintMode, draftWall?.displayPath, draftWallPath],
  )
  const canvasMode: WorkbenchEditorMode =
    zoneMode !== 'idle'
      ? zoneMode
      : constraintMode !== 'idle'
        ? constraintMode
        : 'idle'
  const canvasDraftRectPoints =
    zoneMode !== 'idle'
      ? zoneDraftRectPoints
      : constraintMode === 'creating-no-go' || constraintMode === 'editing-no-go'
        ? noGoDraftRectPoints
        : []
  const canvasDraftDisplayRegion =
    zoneMode !== 'idle'
      ? zoneDraftDisplayRegion
      : constraintMode === 'creating-no-go' || constraintMode === 'editing-no-go'
        ? noGoDraftDisplayRegion
        : null
  const canvasEditableCorners =
    zoneMode === 'editing-zone'
      ? zoneEditableCorners
      : constraintMode === 'editing-no-go'
        ? noGoEditableCorners
        : []
  const canvasDraftWallPoints = constraintMode === 'creating-wall' ? draftWallPoints : []
  const canvasDraftWallPath =
    constraintMode === 'creating-wall' || constraintMode === 'editing-wall'
      ? draftWallPath ?? draftWall?.displayPath ?? null
      : null
  const isAnyEditorActive = zoneMode !== 'idle' || constraintMode !== 'idle'
  const activeEditorSummary = useMemo(() => {
    if (zoneMode === 'creating-zone') {
      return {
        title: '正在新建覆盖区',
        description: '当前覆盖区草稿尚未提交，退出后会丢失本次草稿和预览结果。',
      }
    }

    if (zoneMode === 'editing-zone') {
      return {
        title: '正在编辑覆盖区',
        description: '当前覆盖区修改尚未保存，退出后会丢失本次几何和参数调整。',
      }
    }

    if (constraintMode === 'creating-no-go') {
      return {
        title: '正在新建禁入区',
        description: '当前禁入区草稿尚未保存，退出后会丢失本次矩形草稿。',
      }
    }

    if (constraintMode === 'editing-no-go') {
      return {
        title: '正在编辑禁入区',
        description: '当前禁入区修改尚未保存，退出后会丢失本次边界调整。',
      }
    }

    if (constraintMode === 'creating-wall') {
      return {
        title: '正在新建虚拟墙',
        description: '当前虚拟墙草稿尚未保存，退出后会丢失本次端点和缓冲距离设置。',
      }
    }

    if (constraintMode === 'editing-wall') {
      return {
        title: '正在编辑虚拟墙',
        description: '当前虚拟墙修改尚未保存，退出后会丢失本次路径和缓冲距离调整。',
      }
    }

    return null
  }, [constraintMode, zoneMode])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(
      '(max-width: 1366px) and (min-width: 901px) and (orientation: landscape)',
    )

    const handleChange = () => {
      setIsTabletDrawerViewport(mediaQuery.matches)
    }

    handleChange()
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    if (!useDrawerPanels) {
      setIsToolsDrawerOpen(false)
      setIsDetailsDrawerOpen(false)
    }
  }, [useDrawerPanels])

  const closeWorkbenchDrawers = () => {
    setIsToolsDrawerOpen(false)
    setIsDetailsDrawerOpen(false)
  }

  const confirmDiscardEditing = (options: {
    title: string
    description: string
    onConfirm: () => void
  }) => {
    Modal.confirm({
      title: options.title,
      content: options.description,
      okText: '放弃变更',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: options.onConfirm,
    })
  }

  const handleCancelZoneEditing = () => {
    if (zoneMode === 'idle') {
      cancelZoneMode()
      return
    }

    confirmDiscardEditing({
      title: zoneMode === 'editing-zone' ? '放弃本次覆盖区修改？' : '放弃当前覆盖区草稿？',
      description:
        zoneMode === 'editing-zone'
          ? '当前覆盖区还有未保存的修改。确认退出后，本次几何和参数调整都会丢失。'
          : '当前覆盖区草稿和路径预览还没有提交。确认退出后，需要重新开始编辑。',
      onConfirm: () => {
        setZonePreviewFeedback(null)
        cancelZoneMode()
      },
    })
  }

  const handleCancelConstraintEditing = () => {
    if (constraintMode === 'idle') {
      cancelConstraintMode()
      return
    }

    const description =
      constraintMode === 'editing-no-go'
        ? '当前禁入区还有未保存的修改。确认退出后，本次边界调整会丢失。'
        : constraintMode === 'creating-no-go'
          ? '当前禁入区草稿还没有保存。确认退出后，需要重新开始绘制。'
          : constraintMode === 'editing-wall'
            ? '当前虚拟墙还有未保存的修改。确认退出后，本次路径和缓冲设置会丢失。'
            : '当前虚拟墙草稿还没有保存。确认退出后，需要重新开始绘制。'

    confirmDiscardEditing({
      title: '放弃当前编辑？',
      description,
      onConfirm: () => {
        cancelConstraintMode()
      },
    })
  }

  const canRenderCanvas =
    hasMap ||
    data.zones.length > 0 ||
    data.noGoAreas.length > 0 ||
    data.virtualWalls.length > 0 ||
    canvasDraftRectPoints.length > 0 ||
    (canvasDraftDisplayRegion?.length ?? 0) > 0 ||
    canvasDraftWallPoints.length > 0 ||
    (canvasDraftWallPath?.length ?? 0) > 0

  useEffect(() => {
    if (!selected && entityList.length > 0) {
      select({ kind: entityList[0].kind, id: entityList[0].id })
      return
    }

    if (selected && !selectedEntity && entityList.length > 0) {
      select({ kind: entityList[0].kind, id: entityList[0].id })
    }
  }, [entityList, select, selected, selectedEntity])

  useEffect(() => {
    setActiveAlignment(data.alignment)
  }, [data.alignment, setActiveAlignment])

  useEffect(() => {
    setSelectedZoneId(selected?.kind === 'zone' ? selected.id : null)
  }, [selected, setSelectedZoneId])

  useEffect(() => {
    if (
      !selectedZoneEntity &&
      data.zones.length === 1 &&
      (showSelectedZoneOnly || showSelectedZonePath)
    ) {
      select({ kind: 'zone', id: data.zones[0].id })
    }
  }, [
    data.zones,
    select,
    selectedZoneEntity,
    showSelectedZoneOnly,
    showSelectedZonePath,
  ])

  useEffect(() => {
    setSelectedNoGoAreaId(selected?.kind === 'noGoArea' ? selected.id : null)
  }, [selected, setSelectedNoGoAreaId])

  useEffect(() => {
    setSelectedWallId(selected?.kind === 'virtualWall' ? selected.id : null)
  }, [selected, setSelectedWallId])

  const refetchWorkbenchData = async () => {
    await queryClient.refetchQueries({
      queryKey: ['workbench'],
      type: 'active',
    })
  }

  const refreshMapCatalog = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['map-catalog'],
    })
    await queryClient.refetchQueries({
      queryKey: ['map-catalog'],
      type: 'active',
    })
  }

  const handleReconnect = async (url?: string) => {
    await connect((url ?? snapshot.url) || defaultUrl)
    await refetchWorkbenchData()
  }

  const handleImportCurrentMapAsset = async () => {
    const values = await mapImportForm.validateFields().catch(() => null)

    if (!values) {
      return
    }

    setMapImportFeedback(null)
    setIsCheckingMapImport(true)

    try {
      const preflight = await checkMapImportPreflight(values.mapName)

      if (!preflight.canImport) {
        setMapImportFeedback(formatMapImportBlockedFeedback(preflight))
        return
      }
    } catch (error) {
      setMapImportFeedback(formatMapImportFailureFeedback(error, 'preflight'))
      return
    } finally {
      setIsCheckingMapImport(false)
    }

    setIsImportingMapAsset(true)

    try {
      const result = await importCurrentMapAsset({
        mapName: values.mapName,
        description: values.description,
        setActive: values.setActive,
      })

      select(null)
      await refreshMapCatalog()
      await refetchWorkbenchData()
      mapImportForm.resetFields()
      setMapImportFeedback({
        type: 'success',
        message: result.message,
      })
    } catch (error) {
      setMapImportFeedback(formatMapImportFailureFeedback(error, 'import'))
    } finally {
      setIsImportingMapAsset(false)
    }
  }

  const resolveDisplayFrameId = (area?: AreaEntity | null) =>
    area?.displayFrame?.frameId ??
    (typeof area?.raw.display_frame === 'string'
      ? area.raw.display_frame
      : undefined) ??
    effectiveAlignment?.alignedFrame ??
    data.map?.displayFrame?.frameId ??
    'map'

  const handleZoneRectPointPick = (point: Point2D) => {
    if (zoneMode !== 'creating-zone' || isPreviewingRect) {
      return
    }

    const nextPoints =
      zoneDraftRectPoints.length === 1 ? [zoneDraftRectPoints[0], point] : [point]

    setZoneLastError(null)
    setZoneDraftRectPoints(nextPoints)

    if (nextPoints.length === 1) {
      setZoneDraftRect(null)
      setZoneDraftDisplayRegion(null)
      setDraftPreview(null)
      return
    }

    setZoneDraftRect(null)
    setZoneDraftDisplayRegion(null)
    setDraftPreview(null)
    void previewRectZone([nextPoints[0], nextPoints[1]]).catch(() => undefined)
  }

  const handleNoGoRectPointPick = (point: Point2D) => {
    if (constraintMode !== 'creating-no-go' || constraintSaveLoading) {
      return
    }

    const nextPoints =
      noGoDraftRectPoints.length === 1 ? [noGoDraftRectPoints[0], point] : [point]

    setConstraintLastError(null)
    setNoGoDraftRectPoints(nextPoints)

    if (nextPoints.length === 1) {
      setNoGoDraftRect(null)
      setNoGoDraftDisplayRegion(null)
      return
    }

    const nextDraft = createRectDraftFromRegion({
      region: buildRectRegionFromDiagonal(nextPoints[0], nextPoints[1]),
      frameId: resolveDisplayFrameId(selectedNoGoAreaEntity),
    })

    if (!nextDraft) {
      setConstraintLastError('The no-go rectangle draft is not valid yet.')
      return
    }

    setNoGoDraftRect(nextDraft)
    setNoGoDraftDisplayRegion(nextDraft.displayRegion)
  }

  const handleWallPointPick = (point: Point2D) => {
    if (constraintMode !== 'creating-wall' || constraintSaveLoading) {
      return
    }

    const nextPoints = draftWallPoints.length === 1 ? [draftWallPoints[0], point] : [point]

    setConstraintLastError(null)
    setDraftWallPoints(nextPoints)

    if (nextPoints.length === 1) {
      setDraftWallPath(null)
      setDraftWall(null)
      return
    }

    const nextDraft = createWallDraftFromPath({
      path: [nextPoints],
      frameId: resolveDisplayFrameId(selectedVirtualWallEntity),
      bufferM: draftWallBufferM,
    })

    if (!nextDraft) {
      setConstraintLastError('The virtual wall draft is not valid yet.')
      return
    }

    setDraftWallPath(nextDraft.displayPath)
    setDraftWall(nextDraft)
  }

  const handleCanvasPointPick = (point: Point2D) => {
    if (zoneMode === 'creating-zone') {
      handleZoneRectPointPick(point)
      return
    }

    if (constraintMode === 'creating-no-go') {
      handleNoGoRectPointPick(point)
      return
    }

    if (constraintMode === 'creating-wall') {
      handleWallPointPick(point)
    }
  }

  const handleStartCreatingZone = () => {
    closeWorkbenchDrawers()
    setDraftDisplayName(buildDefaultZoneName())
    setProfileName(defaultPlanProfileName)
    setZoneCommitFeedback(null)
    setZonePreviewFeedback(null)
    startCreatingZone()
  }

  const handleStartCreatingNoGo = () => {
    closeWorkbenchDrawers()
    setDraftNoGoName(buildDefaultNoGoName())
    setZonePreviewFeedback(null)
    startCreatingNoGo()
  }

  const handleStartCreatingWall = () => {
    closeWorkbenchDrawers()
    setDraftWallName(buildDefaultWallName())
    setDraftWallEnabled(true)
    setDraftWallBufferM(0.2)
    setZonePreviewFeedback(null)
    startCreatingWall()
  }

  const handleStartEditingZone = async () => {
    if (!selectedZoneEntity || !hasWorkspaceContext) {
      setZoneLastError('请先选择一个覆盖区，再执行编辑。')
      return
    }

    closeWorkbenchDrawers()
    setIsLoadingZoneDetail(true)
    setZoneLastError(null)
    setZoneActionFeedback(null)
    setZoneCommitFeedback(null)
    setZonePreviewFeedback(null)

    try {
      const detail = await fetchCoverageZoneDetail({
        map: data.map,
        mapName: workspaceMapName,
        zoneId: selectedZoneEntity.id,
        profileName:
          typeof selectedZoneEntity.raw.plan_profile_name === 'string'
            ? selectedZoneEntity.raw.plan_profile_name
            : '',
      })

      if (!detail) {
        throw new Error('当前所选覆盖区详情暂不可用。')
      }

      const frameId =
        detail.displayFrame?.frameId ??
        (detail.raw.display_frame as string | undefined) ??
        effectiveAlignment?.alignedFrame ??
        'map'

      const draft = createRectDraftFromRegion({
        region: detail.displayRegion,
        frameId,
      })

      if (!draft) {
        throw new Error('当前版本只支持矩形覆盖区编辑。')
      }

      const nextProfileName =
        typeof detail.raw.plan_profile_name === 'string' &&
        detail.raw.plan_profile_name.trim().length > 0
          ? detail.raw.plan_profile_name.trim()
          : defaultPlanProfileName

      setDraftDisplayName(detail.name)
      setProfileName(nextProfileName)
      startEditingZone(
        {
          zoneId: detail.id,
          zoneVersion: toOptionalNumber(detail.raw.zone_version),
          displayName: detail.name,
          profileName: nextProfileName,
        },
        draft,
      )
      select({ kind: 'zone', id: detail.id })
    } catch (error) {
      setZoneLastError(
        error instanceof Error ? error.message : '覆盖区详情加载失败。',
      )
    } finally {
      setIsLoadingZoneDetail(false)
    }
  }

  const handleStartEditingNoGo = async () => {
    if (!selectedNoGoAreaEntity || !hasWorkspaceContext) {
      setConstraintLastError('请先选择一个禁入区，再执行编辑。')
      return
    }

    closeWorkbenchDrawers()
    setIsLoadingNoGoDetail(true)
    setConstraintLastError(null)
    setZonePreviewFeedback(null)

    try {
      const detail = await fetchNoGoAreaDetail({
        map: data.map,
        mapName: workspaceMapName,
        areaId: selectedNoGoAreaEntity.id,
      })

      if (!detail) {
        throw new Error('当前所选禁入区详情暂不可用。')
      }

      const frameId = resolveDisplayFrameId(detail)
      const draft = createRectDraftFromRegion({
        region: detail.displayRegion,
        frameId,
      })

      if (!draft) {
        throw new Error('当前版本只支持矩形禁入区编辑。')
      }

      setDraftNoGoName(detail.name)
      startEditingNoGo(
        {
          areaId: detail.id,
          displayName: detail.name,
          enabled: toBoolean(detail.raw.enabled) ?? true,
          frameId,
        } satisfies NoGoEditSession,
        draft,
      )
      select({ kind: 'noGoArea', id: detail.id })
    } catch (error) {
      setConstraintLastError(
        error instanceof Error ? error.message : '禁入区详情加载失败。',
      )
    } finally {
      setIsLoadingNoGoDetail(false)
    }
  }

  const handleStartEditingWall = async () => {
    if (!selectedVirtualWallEntity || !hasWorkspaceContext) {
      setConstraintLastError('请先选择一条虚拟墙，再执行编辑。')
      return
    }

    closeWorkbenchDrawers()
    setIsLoadingWallDetail(true)
    setConstraintLastError(null)
    setZonePreviewFeedback(null)

    try {
      const detail = await fetchVirtualWallDetail({
        map: data.map,
        mapName: workspaceMapName,
        wallId: selectedVirtualWallEntity.id,
      })

      if (!detail) {
        throw new Error('当前所选虚拟墙详情暂不可用。')
      }

      const frameId = resolveDisplayFrameId(detail)
      const bufferM = toOptionalNumber(detail.raw.buffer_m)
      const warnings = Array.isArray(detail.raw.warnings)
        ? detail.raw.warnings.filter(
            (warning): warning is string =>
              typeof warning === 'string' && warning.trim().length > 0,
          )
        : []
      const draft = createWallDraftFromPath({
        path: detail.displayPath,
        frameId,
        bufferM,
        warnings,
      })

      if (!draft) {
        throw new Error('当前版本只支持两点式虚拟墙编辑。')
      }

      setDraftWallName(detail.name)
      setDraftWallEnabled(toBoolean(detail.raw.enabled) ?? true)
      setDraftWallBufferM(bufferM ?? 0.2)
      startEditingWall(
        {
          wallId: detail.id,
          displayName: detail.name,
          enabled: toBoolean(detail.raw.enabled) ?? true,
          frameId,
          bufferM,
        } satisfies VirtualWallEditSession,
        draft,
      )
      select({ kind: 'virtualWall', id: detail.id })
    } catch (error) {
      setConstraintLastError(
        error instanceof Error ? error.message : '虚拟墙详情加载失败。',
      )
    } finally {
      setIsLoadingWallDetail(false)
    }
  }

  const handleZoneEditableCornerChange = (
    cornerIndex: number,
    point: Point2D,
  ) => {
    if (zoneMode !== 'editing-zone' || !zoneDraftRect) {
      return
    }

    const nextRegion = updateRectRegionFromDraggedCorner(
      zoneDraftDisplayRegion ?? zoneDraftRect.displayRegion,
      cornerIndex,
      point,
    )

    const nextDraft = createRectDraftFromRegion({
      region: nextRegion,
      frameId:
        zoneDraftRect.displayFrame?.frameId ??
        effectiveAlignment?.alignedFrame ??
        'map',
    })

    if (!nextDraft) {
      return
    }

    setZoneLastError(null)
    setDraftPreview(null)
    setZoneDraftDisplayRegion(nextDraft.displayRegion)
    setZoneDraftRect(nextDraft)
  }

  const handleNoGoEditableCornerChange = (
    cornerIndex: number,
    point: Point2D,
  ) => {
    if (constraintMode !== 'editing-no-go' || !noGoDraftRect) {
      return
    }

    const nextRegion = updateRectRegionFromDraggedCorner(
      noGoDraftDisplayRegion ?? noGoDraftRect.displayRegion,
      cornerIndex,
      point,
    )

    const nextDraft = createRectDraftFromRegion({
      region: nextRegion,
      frameId:
        noGoDraftRect.displayFrame?.frameId ??
        editingNoGo?.frameId ??
        resolveDisplayFrameId(selectedNoGoAreaEntity),
    })

    if (!nextDraft) {
      return
    }

    setConstraintLastError(null)
    setNoGoDraftDisplayRegion(nextDraft.displayRegion)
    setNoGoDraftRect(nextDraft)
  }

  const handleWallEndpointChange = (endpointIndex: number, point: Point2D) => {
    if (constraintMode !== 'editing-wall' || !draftWall) {
      return
    }

    const nextPath = updateWallPathEndpoint(
      draftWallPath ?? draftWall.displayPath,
      endpointIndex,
      point,
    )
    const nextDraft = createWallDraftFromPath({
      path: nextPath,
      frameId:
        draftWall.displayFrame?.frameId ??
        editingWall?.frameId ??
        resolveDisplayFrameId(selectedVirtualWallEntity),
      bufferM: draftWallBufferM ?? draftWall.bufferM,
      warnings: draftWall.warnings,
    })

    if (!nextDraft) {
      return
    }

    setConstraintLastError(null)
    setDraftWallPath(nextDraft.displayPath)
    setDraftWall(nextDraft)
  }

  const handleCanvasEditableCornerChange = (
    cornerIndex: number,
    point: Point2D,
  ) => {
    if (zoneMode === 'editing-zone') {
      handleZoneEditableCornerChange(cornerIndex, point)
      return
    }

    if (constraintMode === 'editing-no-go') {
      handleNoGoEditableCornerChange(cornerIndex, point)
    }
  }

  const handleCanvasEditableWallEndpointChange = (
    endpointIndex: number,
    point: Point2D,
  ) => {
    if (constraintMode === 'editing-wall') {
      handleWallEndpointChange(endpointIndex, point)
    }
  }

  const resolveZoneDraftRegionRequest = () => {
    const region = zoneDraftRect?.raw.display_region

    return typeof region === 'object' && region !== null
      ? (region as RosServiceRequest)
      : null
  }

  const resolveNoGoDraftRegionRequest = () => {
    const region = noGoDraftRect?.raw.display_region

    return typeof region === 'object' && region !== null
      ? (region as RosServiceRequest)
      : null
  }

  const resolveWallDraftPathRequest = () =>
    buildWallPathRequest(draftWallPath ?? draftWall?.displayPath ?? null)

  const handlePreviewPlan = () => {
    const region = resolveZoneDraftRegionRequest()

    if (!zoneDraftRect || !region) {
      setZoneLastError(
        zoneMode === 'editing-zone'
          ? 'The edited zone geometry is not ready for coverage preview.'
          : 'The rectangle draft is not ready for coverage preview.',
      )
      return
    }

    setZonePreviewFeedback(null)
    void previewZone({
      region,
      profileName: effectiveProfileName,
    })
      .then((preview) => {
        setZonePreviewFeedback({
          type: preview.valid === false ? 'warning' : 'success',
          message: buildZonePreviewFeedbackMessage({
            estimatedLengthM: preview.estimatedLengthM,
            estimatedDurationS: preview.estimatedDurationS,
            areaM2: zoneDraftRect.areaM2,
          }),
        })
      })
      .catch(() => undefined)
  }

  const handleCommitZone = async () => {
    const region = resolveZoneDraftRegionRequest()

    if (!zoneDraftRect || !region) {
      setZoneLastError(
        zoneMode === 'editing-zone'
          ? 'The edited zone geometry is not ready for save.'
          : 'The rectangle draft is not ready for commit.',
      )
      return
    }

    if (draftPreview?.valid !== true) {
      setZoneLastError(
        zoneMode === 'editing-zone'
          ? 'Please run Preview Plan successfully before saving changes.'
          : 'Please run Preview Plan successfully before commit.',
      )
      return
    }

    try {
      const result = await commitZone({
        region,
        displayName: draftDisplayName,
        profileName: effectiveProfileName,
        zoneId: editingZone?.zoneId,
        baseZoneVersion: editingZone?.zoneVersion,
      })

      await refetchWorkbenchData()

      setZoneCommitFeedback({
        mode: editingZone ? 'edit' : 'create',
        zoneId: result.zoneId,
        zoneVersion: result.zoneVersion,
        planId: result.planId,
        warnings: result.warnings,
      })
      setZonePreviewFeedback({
        type: 'success',
        message: [
          `zone_id：${result.zoneId}`,
          `version：${result.zoneVersion ?? '--'}`,
          `plan_id：${result.planId ?? '--'}`,
        ].join(' | '),
      })
      select({ kind: 'zone', id: result.zoneId })
      cancelZoneMode()
    } catch (error) {
      const maybeError =
        typeof error === 'object' && error !== null
          ? (error as { code?: string })
          : null

      if (maybeError?.code === 'ZONE_VERSION_CONFLICT') {
        await refetchWorkbenchData()
      }
    }
  }

  const handleSaveNoGo = async () => {
    if (!hasWorkspaceContext) {
      setConstraintLastError('A workspace map context is required before saving a no-go area.')
      return
    }

    const region = resolveNoGoDraftRegionRequest()

    if (!noGoDraftRect || !region) {
      setConstraintLastError('The no-go rectangle draft is not ready yet.')
      return
    }

    const displayFrame =
      noGoDraftRect.displayFrame?.frameId ??
      editingNoGo?.frameId ??
      resolveDisplayFrameId(selectedNoGoAreaEntity)
    const requestedAreaId = editingNoGo?.areaId ?? `nogo_${Date.now()}`

    setConstraintLastError(null)
    setConstraintSaveLoading(true)

    try {
      if (constraintMode === 'editing-no-go' && editingNoGo) {
        const sourceArea =
          data.noGoAreas.find((area) => area.id === editingNoGo.areaId) ??
          (await fetchNoGoAreaDetail({
            map: data.map,
            mapName: workspaceMapName,
            areaId: editingNoGo.areaId,
          }))

        if (!sourceArea) {
          throw new Error('The selected no-go area is no longer available.')
        }

        const result = await modifyNoGoArea({
          map: data.map,
          mapName: workspaceMapName,
          alignment: effectiveAlignment,
          area: sourceArea,
          displayName: draftNoGoName,
          enabled: editingNoGo.enabled,
          displayRegion: region,
          displayFrame,
        })

        await refetchWorkbenchData()
        select({ kind: 'noGoArea', id: result.area?.id ?? editingNoGo.areaId })
      } else {
        const result = await addNoGoArea({
          map: data.map,
          mapName: workspaceMapName,
          alignment: effectiveAlignment,
          areaId: requestedAreaId,
          displayName: draftNoGoName,
          enabled: true,
          displayRegion: region,
          displayFrame,
        })

        await refetchWorkbenchData()
        select({ kind: 'noGoArea', id: result.area?.id ?? requestedAreaId })
      }

      cancelConstraintMode()
    } catch (error) {
      setConstraintLastError(
        error instanceof Error ? error.message : 'No-go save failed.',
      )
    } finally {
      setConstraintSaveLoading(false)
    }
  }

  const handleSaveWall = async () => {
    if (!hasWorkspaceContext) {
      setConstraintLastError('A workspace map context is required before saving a virtual wall.')
      return
    }

    const displayPath = resolveWallDraftPathRequest()

    if (!draftWall || !displayPath) {
      setConstraintLastError('The virtual wall draft is not ready yet.')
      return
    }

    const displayFrame =
      draftWall.displayFrame?.frameId ??
      editingWall?.frameId ??
      resolveDisplayFrameId(selectedVirtualWallEntity)
    const requestedWallId = editingWall?.wallId ?? `wall_${Date.now()}`
    const bufferM = draftWallBufferM ?? draftWall.bufferM

    if (bufferM === null || bufferM < 0) {
      setConstraintLastError('buffer_m must be zero or greater before saving.')
      return
    }

    setConstraintLastError(null)
    setConstraintSaveLoading(true)

    try {
      if (constraintMode === 'editing-wall' && editingWall) {
        const sourceWall =
          data.virtualWalls.find((wall) => wall.id === editingWall.wallId) ??
          (await fetchVirtualWallDetail({
            map: data.map,
            mapName: workspaceMapName,
            wallId: editingWall.wallId,
          }))

        if (!sourceWall) {
          throw new Error('The selected virtual wall is no longer available.')
        }

        const result = await modifyVirtualWall({
          map: data.map,
          mapName: workspaceMapName,
          alignment: effectiveAlignment,
          wall: sourceWall,
          displayName: draftWallName,
          enabled: draftWallEnabled,
          displayPath,
          displayFrame,
          bufferM,
        })

        await refetchWorkbenchData()
        select({ kind: 'virtualWall', id: result.wall?.id ?? editingWall.wallId })
      } else {
        const result = await addVirtualWall({
          map: data.map,
          mapName: workspaceMapName,
          alignment: effectiveAlignment,
          wallId: requestedWallId,
          displayName: draftWallName,
          enabled: draftWallEnabled,
          displayPath,
          displayFrame,
          bufferM,
        })

        await refetchWorkbenchData()
        select({ kind: 'virtualWall', id: result.wall?.id ?? requestedWallId })
      }

      cancelConstraintMode()
    } catch (error) {
      setConstraintLastError(
        error instanceof Error ? error.message : 'Virtual wall save failed.',
      )
    } finally {
      setConstraintSaveLoading(false)
    }
  }

  const handleDeleteNoGo = async () => {
    if (!selectedNoGoAreaEntity || !hasWorkspaceContext) {
      setConstraintLastError('请先选择一个禁入区，再执行删除。')
      return
    }

    setConstraintLastError(null)
    setConstraintDeleteLoading(true)

    try {
      await deleteNoGoArea({
        map: data.map,
        mapName: workspaceMapName,
        areaId: selectedNoGoAreaEntity.id,
      })

      await refetchWorkbenchData()
      cancelConstraintMode()
      if (data.map) {
        select({ kind: 'map', id: data.map.id })
      } else {
        select(null)
      }
    } catch (error) {
      setConstraintLastError(
        error instanceof Error ? error.message : 'No-go delete failed.',
      )
    } finally {
      setConstraintDeleteLoading(false)
    }
  }

  const handleDeleteZone = async () => {
    if (!selectedZoneEntity || !hasWorkspaceContext) {
      setZoneActionFeedback({
        type: 'error',
        message: '请先选择一个覆盖区，再执行删除。',
      })
      return
    }

    const deletedZoneId = selectedZoneEntity.id

    setZoneActionFeedback(null)
    setIsDeletingZone(true)

    try {
      const result = await deleteCoverageZone({
        map: data.map,
        mapName: workspaceMapName,
        zoneId: deletedZoneId,
      })

      cancelZoneMode()

      if (selected?.kind === 'zone' && selected.id === deletedZoneId) {
        if (data.map) {
          select({ kind: 'map', id: data.map.id })
        } else {
          select(null)
        }
      }

      await refetchWorkbenchData()
      setZoneActionFeedback({
        type: 'success',
        message: result.message,
      })
    } catch (error) {
      setZoneActionFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : '覆盖区删除失败。',
      })
    } finally {
      setIsDeletingZone(false)
    }
  }

  const handleDeleteWall = async () => {
    if (!selectedVirtualWallEntity || !hasWorkspaceContext) {
      setConstraintLastError('请先选择一条虚拟墙，再执行删除。')
      return
    }

    setConstraintLastError(null)
    setConstraintDeleteLoading(true)

    try {
      await deleteVirtualWall({
        map: data.map,
        mapName: workspaceMapName,
        wallId: selectedVirtualWallEntity.id,
      })

      await refetchWorkbenchData()
      cancelConstraintMode()
      if (data.map) {
        select({ kind: 'map', id: data.map.id })
      } else {
        select(null)
      }
    } catch (error) {
      setConstraintLastError(
        error instanceof Error ? error.message : 'Virtual wall delete failed.',
      )
    } finally {
      setConstraintDeleteLoading(false)
    }
  }

  const connectionTag = getConnectionTag(snapshot.status)
  const mapDataLength = data.map?.occupancyGrid?.data.length ?? 0
  const hasOpenWorkbenchDrawer = isToolsDrawerOpen || isDetailsDrawerOpen
  const drawerSummaryText = selectedEntity
    ? `${kindLabelMap[selectedEntity.kind]}: ${selectedEntity.name}`
    : 'Select an object to inspect details without shrinking the canvas.'
  const handleSelectEntityFromList = (entity: WorkbenchEntity) => {
    select({ kind: entity.kind, id: entity.id })

    if (useDrawerPanels) {
      setIsToolsDrawerOpen(false)
      setIsDetailsDrawerOpen(true)
    }
  }

  return (
    <div className="workbench-page">
      <header className="workbench-header">
        <div>
          <Typography.Title level={2}>地图工作台</Typography.Title>
          <Typography.Paragraph>
            这里用于地图、覆盖区域、禁行区和虚拟墙的现场配置与校核。默认给售后与工程师使用，普通运维不直接暴露该工作台。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color="gold">地图配置</Tag>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          <RosbridgeEndpointControl
            snapshot={snapshot}
            defaultUrl={defaultUrl}
            onConnect={handleReconnect}
          />
        </Space>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <AppFeedbackBanner
          tone="error"
          title="站点网关 ROS 连接失败"
          description={snapshot.lastError}
          className="workbench-banner"
        />
      ) : null}

      {snapshot.status === 'mock' ? (
        <AppFeedbackBanner
          tone="info"
          title="当前页面正在使用本地 Mock 数据"
          description="在 .env.development 中设置 VITE_USE_MOCK_DATA=false 后，可切回 live 后端。"
          className="workbench-banner"
        />
      ) : null}

      {mapError && !hasDrawableLayers ? (
        <AppFeedbackBanner
          tone="error"
          title="当前地图加载失败"
          description={mapError.message}
          className="workbench-banner"
        />
      ) : null}

      {mapError && hasDrawableLayers ? (
        <AppFeedbackBanner
          tone="warning"
          title="底图元数据暂不可用"
          description="页面已自动降级为图层模式，当前仍可继续查看和编辑已返回的业务图层。"
          className="workbench-banner"
        />
      ) : null}

      {activeEditorSummary ? (
        <AppFeedbackBanner
          tone="warning"
          title={activeEditorSummary.title}
          description={activeEditorSummary.description}
          className="workbench-banner"
        />
      ) : null}

      {zonePreviewFeedback ? (
        <AppFeedbackBanner
          closable
          tone={zonePreviewFeedback.type}
          title={
            zonePreviewFeedback.type === 'success' ? '覆盖区反馈已更新' : '覆盖区预览需要调整'
          }
          description={zonePreviewFeedback.message}
          className="workbench-banner"
          onClose={() => setZonePreviewFeedback(null)}
        />
      ) : null}

      <div className={`workbench-grid ${useDrawerPanels ? 'workbench-grid-drawer' : ''}`}>
        <aside
          className={`workbench-column workbench-side-panel workbench-side-panel-tools ${
            useDrawerPanels ? 'is-drawer-mode' : ''
          } ${isToolsDrawerOpen ? 'is-open' : ''}`}
        >
          <ZoneEditorToolbar
            hasMap={hasWorkspaceContext}
            hasAlignment={hasAlignment}
            mode={zoneMode}
            rectPoints={zoneDraftRectPoints}
            isPreviewing={isPreviewingRect}
            lastError={zoneLastError}
            disableStart={constraintMode !== 'idle'}
            onStart={handleStartCreatingZone}
            onCancel={handleCancelZoneEditing}
          />

          <NoGoEditorToolbar
            hasMap={hasWorkspaceContext}
            mode={constraintMode}
            rectPoints={noGoDraftRectPoints}
            isBusy={constraintSaveLoading || isLoadingNoGoDetail}
            lastError={constraintLastError}
            disableStart={zoneMode !== 'idle' || constraintMode !== 'idle'}
            onStart={handleStartCreatingNoGo}
            onCancel={handleCancelConstraintEditing}
          />

          <VirtualWallEditorToolbar
            hasMap={hasWorkspaceContext}
            mode={constraintMode}
            points={draftWallPoints}
            isBusy={constraintSaveLoading || isLoadingWallDetail}
            lastError={constraintLastError}
            disableStart={zoneMode !== 'idle' || constraintMode !== 'idle'}
            onStart={handleStartCreatingWall}
            onCancel={handleCancelConstraintEditing}
          />

          <Card title="当前地图" className="workbench-card" extra={<ApartmentOutlined />}>
            {data.map ? (
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="名称">{data.map.name}</Descriptions.Item>
                <Descriptions.Item label="ID">{data.map.id}</Descriptions.Item>
                <Descriptions.Item label="分辨率">
                  {formatNumber(data.map.resolution, 4)}
                </Descriptions.Item>
                <Descriptions.Item label="栅格尺寸">
                  {data.map.occupancyGrid?.width ?? '--'} x{' '}
                  {data.map.occupancyGrid?.height ?? '--'}
                </Descriptions.Item>
                <Descriptions.Item label="显示坐标系">
                  {data.map.displayFrame?.frameId ?? '--'}
                </Descriptions.Item>
              </Descriptions>
            ) : hasWorkspaceContext ? (
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="名称">
                    {workspaceMapName || '当前地图'}
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color="warning">图层降级模式</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="显示坐标系">
                    {effectiveAlignment?.alignedFrame ??
                      data.zones[0]?.displayFrame?.frameId ??
                      data.noGoAreas[0]?.displayFrame?.frameId ??
                      data.virtualWalls[0]?.displayFrame?.frameId ??
                      '--'}
                  </Descriptions.Item>
                </Descriptions>
                <Typography.Paragraph className="workbench-footnote">
                  当前暂时拿不到底图元数据，但实时后端返回的工作区图层仍然可用，页面已自动降级为图层模式。
                </Typography.Paragraph>
              </Space>
            ) : isInitialLoading ? (
              <AppLoadingState message="正在加载当前地图元数据..." />
            ) : (
              <AppEmptyState description={mapError?.message ?? '当前还没有可用的活动地图。'} />
            )}
          </Card>

          <Card
            title="导入当前地图资产"
            className="workbench-card"
            extra={<Tag color="cyan">手动</Tag>}
          >
            {mapImportFeedback ? (
              <AppFeedbackBanner
                closable
                tone={mapImportFeedback.type}
                title={
                  mapImportFeedback.type === 'success'
                    ? '地图资产导入完成'
                    : mapImportFeedback.type === 'warning'
                      ? '地图资产导入前置检查未通过'
                    : '地图资产导入失败'
                }
                description={mapImportFeedback.message}
                className="workbench-inline-alert"
                onClose={() => setMapImportFeedback(null)}
              />
            ) : null}

            <Typography.Paragraph className="workbench-footnote map-import-note">
              这里会把当前 Cartographer 保存的文件{' '}
              <code>/opt/carto/map/&lt;map_name&gt;.pbstream</code>{' '}
              导入到受管地图资产目录。请填写与操作员保存 pbstream 时完全一致的地图名称。
            </Typography.Paragraph>

            <Form<MapAssetImportFormValues>
              form={mapImportForm}
              layout="vertical"
              initialValues={{
                mapName: '',
                description: '',
                setActive: true,
              }}
              className="map-import-form"
            >
              <Form.Item
                name="mapName"
                label="地图名称"
                rules={[{ required: true, message: '请输入已保存的 pbstream 地图名称' }]}
              >
                <Input
                  placeholder="请输入保存 pbstream 时使用的同名 map_name"
                  disabled={!servicesReady || isAnyEditorActive}
                />
              </Form.Item>

              <Form.Item
                name="description"
                label="备注"
              >
                <Input
                  placeholder="可选，填写现场说明"
                  disabled={!servicesReady || isAnyEditorActive}
                />
              </Form.Item>

              <Form.Item
                name="setActive"
                label="导入后设为当前地图"
                valuePropName="checked"
              >
                <Switch
                  checkedChildren="设为当前"
                  unCheckedChildren="保持现状"
                  disabled={!servicesReady || isAnyEditorActive}
                />
              </Form.Item>

              <Space wrap>
                <Button
                  type="primary"
                  loading={isCheckingMapImport || isImportingMapAsset}
                  disabled={!servicesReady || isAnyEditorActive}
                  onClick={() => void handleImportCurrentMapAsset()}
                >
                  {isCheckingMapImport ? '正在检查导入前置条件' : '导入当前地图资产'}
                </Button>
                <Button
                  disabled={isImportingMapAsset}
                  onClick={() => {
                    mapImportForm.resetFields()
                    setMapImportFeedback(null)
                  }}
                >
                  重置
                </Button>
              </Space>
            </Form>

            {isAnyEditorActive ? (
              <Typography.Paragraph className="workbench-footnote map-import-note">
                请先完成当前覆盖区或约束编辑，再切换地图资产。
              </Typography.Paragraph>
            ) : null}
          </Card>

          <Card title="图层显示" className="workbench-card" extra={<ClusterOutlined />}>
            <div className="layer-toggle-list">
              {(
                [
                  ['map', '栅格底图'],
                  ['zone', '显示全部覆盖区'],
                  ['noGoArea', '禁入区'],
                  ['virtualWall', '虚拟墙'],
                ] satisfies Array<[LayerKey, string]>
              ).map(([key, label]) => (
                <div key={key} className="layer-toggle-row">
                  <Typography.Text>{label}</Typography.Text>
                  <Switch
                    checked={layerVisibility[key]}
                    onChange={(checked) => setLayerVisibility(key, checked)}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card title="覆盖区聚焦" className="workbench-card" extra={<Tag color="green">覆盖区</Tag>}>
            <div className="layer-toggle-list">
              <div className="layer-toggle-row">
                <Typography.Text>仅显示当前覆盖区</Typography.Text>
                <Switch
                  checked={showSelectedZoneOnly}
                  onChange={setShowSelectedZoneOnly}
                />
              </div>
              <div className="layer-toggle-row">
                <Typography.Text>显示当前覆盖区路径</Typography.Text>
                <Switch
                  checked={showSelectedZonePath}
                  onChange={setShowSelectedZonePath}
                />
              </div>
            </div>

            <Typography.Paragraph className="workbench-footnote">
              覆盖区轮廓仍然来自 `/database_server/site/coverage_zone_service getAll`。当前覆盖区的活动路径只会在选中后按需加载。“仅显示当前覆盖区”会优先于“显示全部覆盖区”。
            </Typography.Paragraph>

            {isZoneListLoading ? (
              <Typography.Paragraph className="workbench-footnote zone-focus-note">
                覆盖区列表仍在加载中。加载完成后，若当前地图只有 1 个覆盖区，页面会自动把它设为当前覆盖区。
              </Typography.Paragraph>
            ) : null}

            {showSelectedZoneOnly && !selectedZoneEntity ? (
              <Typography.Paragraph className="workbench-footnote zone-focus-note">
                请先在对象列表中选中一个覆盖区，再单独聚焦显示。
              </Typography.Paragraph>
            ) : null}

            {showSelectedZonePath && !selectedZoneEntity ? (
              <Typography.Paragraph className="workbench-footnote zone-focus-note">
                请先选中一个覆盖区，工作台才会去请求它的活动路径。
              </Typography.Paragraph>
            ) : null}
          </Card>

          <Card title="对象列表" className="workbench-card" extra={entityList.length}>
            <div className="object-group-list">
              {entityGroups.map((group) => (
                <section key={group.key} className="object-group">
                  <div className="object-group-header">
                    <Typography.Text strong>{group.title}</Typography.Text>
                    <Tag color={kindColorMap[group.key]}>{group.entities.length}</Tag>
                  </div>

                  {group.entities.length > 0 ? (
                    <div className="object-group-items">
                      {group.entities.map((entity) => (
                        <button
                          key={`${entity.kind}:${entity.id}`}
                          type="button"
                          className={`object-list-item ${
                            selectedEntity?.id === entity.id &&
                            selectedEntity.kind === entity.kind
                              ? 'is-selected'
                              : ''
                          }`}
                          onClick={() => handleSelectEntityFromList(entity)}
                        >
                          <span className="object-list-main">
                            <Tag color={kindColorMap[entity.kind]}>
                              {kindLabelMap[entity.kind]}
                            </Tag>
                            <span>{entity.name}</span>
                          </span>
                          <span className="object-list-subtle">{entity.id}</span>
                        </button>
                      ))}
                    </div>
                  ) : group.key === 'zone' && isZoneListLoading ? (
                    <AppLoadingState
                      compact
                      className="workbench-loading workbench-loading-compact"
                      message="正在加载覆盖区列表..."
                    />
                  ) : (
                    <Typography.Paragraph className="workbench-footnote object-group-empty">
                      {group.emptyText}
                    </Typography.Paragraph>
                  )}
                </section>
              ))}
            </div>
          </Card>

          <Card
            title="诊断信息"
            className="workbench-card"
            extra={
              <Space size="small" wrap>
                <Tag color="default">工程诊断</Tag>
                <Button
                  size="small"
                  type="text"
                  icon={<RadarChartOutlined />}
                  onClick={() => setShowDiagnostics((value) => !value)}
                >
                  {showDiagnostics ? '收起' : '展开'}
                </Button>
              </Space>
            }
          >
            {showDiagnostics ? (
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="最近 ROS 事件">
                  <Typography.Text ellipsis>
                    {rosDebug.lastEvent}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="当前 map_name">
                  {getMapName(data.map)}
                </Descriptions.Item>
                <Descriptions.Item label="map_data.info.width">
                  {data.map?.occupancyGrid?.width ?? '--'}
                </Descriptions.Item>
                <Descriptions.Item label="map_data.info.height">
                  {data.map?.occupancyGrid?.height ?? '--'}
                </Descriptions.Item>
                <Descriptions.Item label="map_data.info.resolution">
                  {formatNumber(data.map?.occupancyGrid?.resolution, 4)}
                </Descriptions.Item>
                <Descriptions.Item label="map_data.data.length">
                  {mapDataLength || '--'}
                </Descriptions.Item>
                <Descriptions.Item label="覆盖区数量">
                  {data.zones.length}
                </Descriptions.Item>
                <Descriptions.Item label="禁入区数量">
                  {data.noGoAreas.length}
                </Descriptions.Item>
                <Descriptions.Item label="虚拟墙数量">
                  {data.virtualWalls.length}
                </Descriptions.Item>
                <Descriptions.Item label="站点网关 ROS 状态">
                  <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="地图查询状态">
                  {mapQueryStatus}
                </Descriptions.Item>
                <Descriptions.Item label="地图抓取状态">
                  {mapQueryFetchStatus}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Typography.Paragraph className="workbench-footnote diagnostics-card-copy">
                诊断信息默认保持折叠，这样现场编辑界面会更聚焦。
              </Typography.Paragraph>
            )}
          </Card>
        </aside>

        <main className={`workbench-center ${useDrawerPanels ? 'is-drawer-mode' : ''}`}>
          {useDrawerPanels ? (
            <div className="workbench-tablet-actions">
              <Space wrap className="workbench-tablet-action-buttons">
                <Button
                  icon={<MenuOutlined />}
                  onClick={() => {
                    setIsDetailsDrawerOpen(false)
                    setIsToolsDrawerOpen(true)
                  }}
                >
                  工具
                </Button>
                <Button
                  icon={<ProfileOutlined />}
                  onClick={() => {
                    setIsToolsDrawerOpen(false)
                    setIsDetailsDrawerOpen(true)
                  }}
                >
                  详情
                </Button>
              </Space>
              <Typography.Text className="workbench-tablet-summary">
                平板模式会优先保留画布视图，工具和详情会放到侧滑面板中。{drawerSummaryText}
              </Typography.Text>
            </div>
          ) : null}

          <Card
            title="地图画布"
            className="workbench-card workbench-canvas-card"
            extra={
              <Space size="small" wrap>
                <Tag color="green">覆盖区 {data.zones.length}</Tag>
                <Tag color="orange">禁入区 {data.noGoAreas.length}</Tag>
                <Tag color="blue">虚拟墙 {data.virtualWalls.length}</Tag>
              </Space>
            }
          >
            {canRenderCanvas ? (
              <MapCanvas
                map={data.map}
                zones={visibleZones}
                noGoAreas={data.noGoAreas}
                virtualWalls={data.virtualWalls}
                layerVisibility={layerVisibility}
                mode={canvasMode}
                draftRectPoints={canvasDraftRectPoints}
                draftDisplayRegion={canvasDraftDisplayRegion}
                draftWallPoints={canvasDraftWallPoints}
                draftWallPath={canvasDraftWallPath}
                draftPreview={draftPreview}
                selectedZonePath={selectedZonePathResult}
                editableCorners={canvasEditableCorners}
                editableWallEndpoints={wallEditableEndpoints}
                selected={selected}
                onCanvasPointPick={handleCanvasPointPick}
                onEditableCornerChange={handleCanvasEditableCornerChange}
                onEditableWallEndpointChange={
                  handleCanvasEditableWallEndpointChange
                }
                onSelect={select}
              />
            ) : isInitialLoading ? (
              <AppLoadingState className="workbench-loading" message="正在等待站点网关加载当前地图快照..." />
            ) : mapError ? (
              <AppFeedbackBanner
                tone="error"
                title="当前地图或可绘制图层加载失败"
                description={mapError.message}
              />
            ) : (
              <AppEmptyState description="当前还没有可用的活动地图。" />
            )}
          </Card>
        </main>

        <aside
          className={`workbench-column workbench-side-panel workbench-side-panel-details ${
            useDrawerPanels ? 'is-drawer-mode' : ''
          } ${isDetailsDrawerOpen ? 'is-open' : ''}`}
        >
          <ZonePreviewPanel
            mode={zoneMode}
            hasAlignment={hasAlignment}
            rectPoints={zoneDraftRectPoints}
            draftRect={zoneDraftRect}
            draftPreview={draftPreview}
            editingZoneId={editingZone?.zoneId ?? null}
            editingZoneVersion={editingZone?.zoneVersion ?? null}
            displayName={draftDisplayName}
            profileName={effectiveProfileName}
            profileOptions={planProfileCatalog.selectOptions}
            profileCatalogError={planProfileCatalog.error?.message ?? null}
            isLoadingProfiles={planProfileCatalog.isLoading || planProfileCatalog.isFetching}
            isPreviewingRect={isPreviewingRect}
            isPreviewingPlan={isPreviewingZone}
            isCommitting={isCommittingZone}
            lastError={zoneLastError}
            hasUnsavedChanges={zoneMode !== 'idle'}
            lastCommitSummary={zoneCommitFeedback}
            onDisplayNameChange={setDraftDisplayName}
            onProfileNameChange={setProfileName}
            onPreviewPlan={handlePreviewPlan}
            onCommitZone={handleCommitZone}
            onCancel={handleCancelZoneEditing}
          />

          <NoGoEditorPanel
            mode={constraintMode}
            draftRect={noGoDraftRect}
            editingAreaId={editingNoGo?.areaId ?? null}
            displayName={draftNoGoName}
            isSaving={constraintSaveLoading}
            lastError={constraintLastError}
            onDisplayNameChange={setDraftNoGoName}
            onSave={handleSaveNoGo}
            onCancel={handleCancelConstraintEditing}
          />

          <VirtualWallEditorPanel
            mode={constraintMode}
            draftWall={draftWall}
            editingWallId={editingWall?.wallId ?? null}
            displayName={draftWallName}
            enabled={draftWallEnabled}
            bufferM={draftWallBufferM}
            isSaving={constraintSaveLoading}
            lastError={constraintLastError}
            onDisplayNameChange={setDraftWallName}
            onEnabledChange={setDraftWallEnabled}
            onBufferChange={setDraftWallBufferM}
            onSave={handleSaveWall}
            onCancel={handleCancelConstraintEditing}
          />

          {selectedNoGoAreaEntity ? (
            <NoGoDetailsPanel
              area={selectedNoGoAreaEntity}
              extra={
                <Space size="small" wrap>
                  <Button
                    size="small"
                    onClick={() => void handleStartEditingNoGo()}
                    loading={isLoadingNoGoDetail}
                    disabled={isAnyEditorActive && constraintMode !== 'editing-no-go'}
                  >
                    编辑禁入区
                  </Button>
                  <Popconfirm
                    title="删除禁入区"
                    description="该操作会把当前所选禁入区从后端删除。"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => void handleDeleteNoGo()}
                    okButtonProps={{ danger: true, loading: constraintDeleteLoading }}
                    disabled={isAnyEditorActive}
                  >
                    <Button
                      size="small"
                      danger
                      loading={constraintDeleteLoading}
                      disabled={isAnyEditorActive}
                    >
                      删除禁入区
                    </Button>
                  </Popconfirm>
                </Space>
              }
            />
          ) : selectedVirtualWallEntity ? (
            <VirtualWallDetailsPanel
              wall={selectedVirtualWallEntity}
              extra={
                <Space size="small" wrap>
                  <Button
                    size="small"
                    onClick={() => void handleStartEditingWall()}
                    loading={isLoadingWallDetail}
                    disabled={isAnyEditorActive && constraintMode !== 'editing-wall'}
                  >
                    编辑虚拟墙
                  </Button>
                  <Popconfirm
                    title="删除虚拟墙"
                    description="该操作会把当前所选虚拟墙从后端删除。"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => void handleDeleteWall()}
                    okButtonProps={{ danger: true, loading: constraintDeleteLoading }}
                    disabled={isAnyEditorActive}
                  >
                    <Button
                      size="small"
                      danger
                      loading={constraintDeleteLoading}
                      disabled={isAnyEditorActive}
                    >
                      删除虚拟墙
                    </Button>
                  </Popconfirm>
                </Space>
              }
            />
          ) : (
            <Card
              title="当前对象"
              className="workbench-card"
              extra={
                selectedZoneEntity ? (
                  <Space size="small" wrap>
                    <Button
                      size="small"
                      onClick={() => void handleStartEditingZone()}
                      loading={isLoadingZoneDetail}
                      disabled={isAnyEditorActive}
                    >
                      编辑覆盖区
                    </Button>
                    <Popconfirm
                      title="删除覆盖区"
                      description="删除后，当前覆盖区会在默认工作台列表中隐藏。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => void handleDeleteZone()}
                      okButtonProps={{ danger: true, loading: isDeletingZone }}
                      disabled={isAnyEditorActive}
                    >
                      <Button
                        size="small"
                        danger
                        loading={isDeletingZone}
                        disabled={isAnyEditorActive}
                      >
                        删除覆盖区
                      </Button>
                    </Popconfirm>
                  </Space>
                ) : null
              }
            >
              {zoneActionFeedback ? (
                <AppFeedbackBanner
                  closable
                  tone={zoneActionFeedback.type}
                  title={zoneActionFeedback.type === 'success' ? '覆盖区删除完成' : '覆盖区删除失败'}
                  description={zoneActionFeedback.message}
                  className="workbench-inline-alert"
                  onClose={() => setZoneActionFeedback(null)}
                />
              ) : null}

              {selectedZoneEntity && showSelectedZonePath && selectedZonePathQuery.isLoading ? (
                <AppLoadingState
                  compact
                  className="workbench-loading workbench-loading-compact"
                  message="正在加载当前覆盖区的活动路径..."
                />
              ) : null}

              {selectedZoneEntity &&
              showSelectedZonePath &&
              selectedZonePathQuery.error instanceof Error ? (
                <AppFeedbackBanner
                  tone="warning"
                  title="当前覆盖区路径暂不可用"
                  description={selectedZonePathQuery.error.message}
                  className="workbench-inline-alert"
                />
              ) : null}

              {selectedEntity ? (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="类型">
                      <Tag color={kindColorMap[selectedEntity.kind]}>
                        {kindLabelMap[selectedEntity.kind]}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="名称">
                      {selectedEntity.name}
                    </Descriptions.Item>
                    <Descriptions.Item label="ID">{selectedEntity.id}</Descriptions.Item>
                    <Descriptions.Item label="显示坐标系">
                      {selectedEntity.displayFrame?.frameId ?? '--'}
                    </Descriptions.Item>
                    <Descriptions.Item label="区域数量">
                      {selectedEntity.displayRegion.length}
                    </Descriptions.Item>
                    <Descriptions.Item label="路径数量">
                      {selectedEntity.displayPath.length}
                    </Descriptions.Item>
                    {selectedEntity.kind === 'map' ? (
                      <Descriptions.Item label="栅格数据长度">
                        {selectedEntity.occupancyGrid?.data.length ?? '--'}
                      </Descriptions.Item>
                    ) : null}
                  </Descriptions>

                  {selectedZoneEntity && selectedZonePathResult ? (
                    <>
                      <Descriptions column={1} size="small" colon={false}>
                        <Descriptions.Item label="活动路径 ID">
                          {selectedZonePathResult.activePlanId ?? '--'}
                        </Descriptions.Item>
                        <Descriptions.Item label="路径规划档位">
                          {selectedZonePathResult.planProfileName || '--'}
                        </Descriptions.Item>
                        <Descriptions.Item label="路径显示坐标系">
                          {selectedZonePathResult.displayFrame?.frameId ?? '--'}
                        </Descriptions.Item>
                        <Descriptions.Item label="路径长度">
                          {selectedZonePathResult.estimatedLengthM !== null
                            ? `${formatNumber(selectedZonePathResult.estimatedLengthM, 1)} m`
                            : '--'}
                        </Descriptions.Item>
                        <Descriptions.Item label="路径时长">
                          {selectedZonePathResult.estimatedDurationS !== null
                            ? `${formatNumber(selectedZonePathResult.estimatedDurationS, 0)} s`
                            : '--'}
                        </Descriptions.Item>
                      </Descriptions>

                      {selectedZonePathResult.warnings.length > 0 ? (
                        <ul className="constraint-warning-list">
                          {selectedZonePathResult.warnings.map((warning, index) => (
                            <li key={`${warning}-${index}`}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </Space>
              ) : (
                <AppEmptyState
                  description={
                    hasMap
                      ? '请选择一个地图对象查看详情。'
                      : '地图加载完成后，这里会显示对象详情。'
                  }
                />
              )}
            </Card>
          )}

          <Card title="元数据" className="workbench-card">
            {selectedEntity ? (
              <Descriptions column={1} size="small" colon={false}>
                {getMetadataEntries(selectedEntity).map(([key, value]) => (
                  <Descriptions.Item key={key} label={key}>
                    <Typography.Text ellipsis>
                      {typeof value === 'string'
                        ? value
                        : JSON.stringify(value)}
                    </Typography.Text>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            ) : (
              <AppEmptyState description="当前还没有可显示的元数据。" />
            )}
          </Card>

          <Card title="告警与提示" className="workbench-card">
            {data.warnings.length > 0 ? (
              <ul className="constraint-warning-list">
                {data.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            ) : (
              <AppEmptyState
                description={
                  mapError
                    ? '地图加载失败，请查看上方错误提示。'
                    : '当前没有激活的告警或提示。'
                }
              />
            )}

            {(zonesError || noGoAreasError || virtualWallsError) && (
              <Typography.Paragraph className="workbench-footnote">
                即使局部图层加载失败，整页仍保持可打开。当前页面会自动降级为只读展示，方便现场继续定位问题。
              </Typography.Paragraph>
            )}
          </Card>
        </aside>
      </div>

      {useDrawerPanels ? (
        <button
          type="button"
          className={`workbench-drawer-backdrop ${
            hasOpenWorkbenchDrawer ? 'is-visible' : ''
          }`}
          onClick={closeWorkbenchDrawers}
          aria-label="关闭工作台面板"
        />
      ) : null}
    </div>
  )
}


