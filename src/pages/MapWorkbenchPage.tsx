import { useEffect, useMemo, useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Modal,
  Space,
  Typography,
} from 'antd'
import {
  MenuOutlined,
  ProfileOutlined,
} from '@ant-design/icons'

import { MapCanvas } from '../components/canvas/MapCanvas'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { AppLoadingState } from '../components/feedback/AppLoadingState'
import { MapAssetPanel } from '../components/map-workbench/MapAssetPanel'
import { MapWorkbenchDetailsPanel } from '../components/map-workbench/MapWorkbenchDetailsPanel'
import {
  CurrentMapCard,
  LayerVisibilityCard,
  ZoneFocusCard,
} from '../components/map-workbench/MapWorkbenchSideCards'
import { ObjectListCard } from '../components/map-workbench/ObjectListCard'
import { NoGoEditorPanel } from '../components/constraint-editor/NoGoEditorPanel'
import { NoGoEditorToolbar } from '../components/constraint-editor/NoGoEditorToolbar'
import { VirtualWallEditorPanel } from '../components/wall-editor/VirtualWallEditorPanel'
import { VirtualWallEditorToolbar } from '../components/wall-editor/VirtualWallEditorToolbar'
import { ZoneEditorToolbar } from '../components/zone-editor/ZoneEditorToolbar'
import { ZonePreviewPanel } from '../components/zone-editor/ZonePreviewPanel'
import { useInputCapabilities } from '../hooks/useInputCapabilities'
import { useMapCatalog } from '../hooks/useMapCatalog'
import { useMapWorkbenchData } from '../hooks/useMapWorkbenchData'
import { useProfileCatalog } from '../hooks/useProfileCatalog'
import { useRosConnection } from '../hooks/useRosConnection'
import { useSlamWorkflowState } from '../hooks/useSlamWorkflowState'
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
  cleanupDisabledMapAssets,
  hardDeleteMapAsset,
  importCurrentMapAsset,
  modifyNoGoArea,
  modifyVirtualWall,
  softDeleteMapAsset,
} from '../api/gateway/mapWorkbenchGateway'
import { useConstraintEditorStore } from '../stores/constraintEditorStore'
import { useMapWorkbenchStore } from '../stores/mapWorkbenchStore'
import { useZoneEditorStore } from '../stores/zoneEditorStore'
import type {
  MapCatalogEntry,
} from '../types/mapCatalog'
import type {
  AreaEntity,
  NoGoEditSession,
  Point2D,
  Pose2D,
  ZonePlanPathResult,
  VirtualWallEditSession,
  WorkbenchEditorMode,
} from '../types/map-editor'
import type { GatewayPayload } from '../types/gateway'
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
import {
  buildDefaultNoGoName,
  buildDefaultWallName,
  buildDefaultZoneName,
  buildZonePreviewFeedbackMessage,
  detectWorkbenchDrawerViewport,
  findSelectedEntity,
  formatBlockedReasons,
  formatBytes,
  formatMapImportBlockedFeedback,
  formatMapImportFailureFeedback,
  getEntityGroups,
  getEntityList,
  getMapRevisionId,
  getTrimmedRawString,
  toBoolean,
  toOptionalNumber,
  type MapAssetFeedbackState,
  type MapAssetImportFormValues,
  type MapImportFeedbackState,
  type WorkbenchEntity,
} from '../utils/mapWorkbenchPage'
import './MapWorkbenchPage.css'

export function MapWorkbenchPage() {
  const [mapImportForm] = Form.useForm<MapAssetImportFormValues>()
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
  const [, setZonePreviewFeedback] = useState<{
    type: 'success' | 'warning'
    message: string
  } | null>(null)
  const [isImportingMapAsset, setIsImportingMapAsset] = useState(false)
  const [isCheckingMapImport, setIsCheckingMapImport] = useState(false)
  const [mapImportFeedback, setMapImportFeedback] = useState<MapImportFeedbackState | null>(null)
  const [mapAssetFeedback, setMapAssetFeedback] = useState<MapAssetFeedbackState | null>(null)
  const [softDeletingRevisionId, setSoftDeletingRevisionId] = useState('')
  const [hardDeletingRevisionId, setHardDeletingRevisionId] = useState('')
  const [isCleanupDryRunning, setIsCleanupDryRunning] = useState(false)
  const [isCleanupExecuting, setIsCleanupExecuting] = useState(false)
  const [isToolsDrawerOpen, setIsToolsDrawerOpen] = useState(false)
  const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false)
  const [isTabletDrawerViewport, setIsTabletDrawerViewport] = useState(
    detectWorkbenchDrawerViewport,
  )
  const queryClient = useQueryClient()
  const { isTouchCapable, isCoarsePointer } = useInputCapabilities()
  const { snapshot } = useRosConnection()
  const servicesReady = snapshot.status !== 'connecting'
  const mapCatalog = useMapCatalog()
  const {
    data,
    isInitialLoading,
    mapError,
    zonesQueryFetchStatus,
    zonesQueryStatus,
    zonesError,
  } = useMapWorkbenchData(snapshot)
  const slamWorkflow = useSlamWorkflowState(snapshot)

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
  const enabledMapAssets = useMemo(
    () => mapCatalog.entries.filter((entry) => entry.enabled),
    [mapCatalog.entries],
  )
  const disabledMapAssets = useMemo(
    () => mapCatalog.entries.filter((entry) => !entry.enabled),
    [mapCatalog.entries],
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
  const robotPose = useMemo<Pose2D | null>(() => {
    const state = slamWorkflow.effectiveState
    if (!state || state.trackedPoseFresh !== true) {
      return null
    }

    if (state.trackedPoseFrame.trim().toLowerCase() !== 'map') {
      return null
    }

    const x = state.trackedPoseX
    const y = state.trackedPoseY
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null
    }

    const poseMapName = (state.runtimeMapName || state.activeMapName).trim()
    const canvasMapName = workspaceMapName.trim()
    if (poseMapName && canvasMapName && poseMapName !== canvasMapName) {
      return null
    }

    const theta = state.trackedPoseTheta
    return {
      x,
      y,
      theta: theta !== null && Number.isFinite(theta) ? theta : null,
    }
  }, [slamWorkflow.effectiveState, workspaceMapName])
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
    await mapCatalog.refetch()
    await queryClient.refetchQueries({
      queryKey: ['map-catalog'],
      type: 'active',
    })
  }

  const refreshMapAssetRelatedData = async () => {
    await Promise.all([
      refreshMapCatalog(),
      refetchWorkbenchData(),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['schedule-management'] }),
      queryClient.invalidateQueries({ queryKey: ['coverage-zone-catalog'] }),
    ])

    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['tasks'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['schedule-management'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['coverage-zone-catalog'], type: 'active' }),
    ])
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

  const handleSoftDeleteMapAsset = async (entry: MapCatalogEntry) => {
    const revisionId = getMapRevisionId(entry)
    const loadingKey = revisionId || entry.mapName

    setMapAssetFeedback(null)
    setSoftDeletingRevisionId(loadingKey)

    try {
      const result = await softDeleteMapAsset({
        mapName: entry.mapName,
        mapRevisionId: revisionId,
      })

      if (!result.success) {
        setMapAssetFeedback({
          type: 'warning',
          title: '地图未移入回收站',
          message:
            formatBlockedReasons(result.blockedReasons) ||
            result.message ||
            '后端拒绝了本次删除请求。',
        })
        return
      }

      await refreshMapCatalog()
      await refetchWorkbenchData()
      setMapAssetFeedback({
        type: 'success',
        title: '地图已移入回收站',
        message: result.message || `${entry.displayName} 已禁用，可在回收站释放磁盘空间。`,
      })
    } catch (error) {
      setMapAssetFeedback({
        type: 'error',
        title: '地图删除失败',
        message: error instanceof Error ? error.message : '地图删除失败。',
      })
    } finally {
      setSoftDeletingRevisionId('')
    }
  }

  const handleHardDeleteMapAsset = async (entry: MapCatalogEntry) => {
    const revisionId = getMapRevisionId(entry)

    if (!revisionId) {
      setMapAssetFeedback({
        type: 'warning',
        title: '缺少 revision id',
        message: '后端没有返回该地图资产的 revision id，暂不能释放磁盘空间。',
      })
      return
    }

    setMapAssetFeedback(null)
    setHardDeletingRevisionId(revisionId)

    try {
      const dryRunResult = await hardDeleteMapAsset({
        mapName: entry.mapName,
        mapRevisionId: revisionId,
        dryRun: true,
        cascade: true,
        confirmToken: '',
      })

      if (!dryRunResult.success) {
        setMapAssetFeedback({
          type: 'warning',
          title: '地图资产删除被阻止',
          message:
            formatBlockedReasons(dryRunResult.blockedReasons) ||
            dryRunResult.message ||
            '后端阻止了该地图资产的物理删除。',
        })
        return
      }

      if (!dryRunResult.confirmToken) {
        setMapAssetFeedback({
          type: 'error',
          title: '地图资产删除失败',
          message: '后端 dry-run 未返回 confirm_token，前端不会绕过预检直接永久删除。',
        })
        return
      }

      Modal.confirm({
        title: '确认删除地图资产',
        okText: '确认删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        content: (
          <div className="map-asset-confirm">
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="地图">{entry.displayName}</Descriptions.Item>
            </Descriptions>
            {dryRunResult.blockedReasons.length > 0 ? (
              <Typography.Text type="warning">
                {formatBlockedReasons(dryRunResult.blockedReasons)}
              </Typography.Text>
            ) : null}
          </div>
        ),
        onOk: async () => {
          const executeResult = await hardDeleteMapAsset({
            mapName: entry.mapName,
            mapRevisionId: revisionId,
            dryRun: false,
            cascade: true,
            confirmToken: dryRunResult.confirmToken,
          })

          if (!executeResult.success) {
            setMapAssetFeedback({
              type: 'warning',
              title: '地图资产删除被阻止',
              message:
                formatBlockedReasons(executeResult.blockedReasons) ||
                executeResult.message ||
                '后端阻止了该地图资产的物理删除。',
            })
            return
          }

          await refreshMapAssetRelatedData()
          setMapAssetFeedback({
            type: 'success',
            title: '地图资产已删除',
          })
        },
      })
    } catch (error) {
      setMapAssetFeedback({
        type: 'error',
        title: '地图资产删除失败',
        message: error instanceof Error ? error.message : '地图资产删除失败。',
      })
    } finally {
      setHardDeletingRevisionId('')
    }
  }

  const handleCleanupDisabledMapAssets = async () => {
    setMapAssetFeedback(null)
    setIsCleanupDryRunning(true)

    try {
      const dryRunResult = await cleanupDisabledMapAssets({
        dryRun: true,
        minAgeDays: 0,
        maxReclaimBytes: 0,
        confirmToken: '',
      })

      if (!dryRunResult.success) {
        setMapAssetFeedback({
          type: 'warning',
          title: '批量清理被阻止',
          message:
            formatBlockedReasons(dryRunResult.blockedReasons) ||
            dryRunResult.message ||
            '后端阻止了批量清理。',
        })
        return
      }

      Modal.confirm({
        title: '确认清理已禁用地图资产',
        okText: '确认清理',
        cancelText: '取消',
        okButtonProps: { danger: true },
        content: (
          <div className="map-asset-confirm">
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="候选数量">
                {dryRunResult.candidateCount}
              </Descriptions.Item>
              <Descriptions.Item label="可释放空间">
                {formatBytes(dryRunResult.reclaimableBytes)}
              </Descriptions.Item>
            </Descriptions>
            {dryRunResult.blockedReasons.length > 0 ? (
              <Typography.Text type="warning">
                {formatBlockedReasons(dryRunResult.blockedReasons)}
              </Typography.Text>
            ) : null}
            <Typography.Text type="danger">物理删除后不可恢复。</Typography.Text>
          </div>
        ),
        onOk: async () => {
          setIsCleanupExecuting(true)
          try {
            const executeResult = await cleanupDisabledMapAssets({
              dryRun: false,
              minAgeDays: 0,
              maxReclaimBytes: 0,
              confirmToken: 'CLEANUP_DISABLED',
            })

            if (!executeResult.success) {
              setMapAssetFeedback({
                type: 'warning',
                title: '批量清理被阻止',
                message:
                  formatBlockedReasons(executeResult.blockedReasons) ||
                  executeResult.message ||
                  '后端阻止了批量清理。',
              })
              return
            }

            await refreshMapAssetRelatedData()
            setMapAssetFeedback({
              type: 'success',
              title: '已清理地图资产',
            })
          } finally {
            setIsCleanupExecuting(false)
          }
        },
      })
    } catch (error) {
      setMapAssetFeedback({
        type: 'error',
        title: '批量清理失败',
        message: error instanceof Error ? error.message : '批量清理失败。',
      })
    } finally {
      setIsCleanupDryRunning(false)
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
      ? (region as GatewayPayload)
      : null
  }

  const resolveNoGoDraftRegionRequest = () => {
    const region = noGoDraftRect?.raw.display_region

    return typeof region === 'object' && region !== null
      ? (region as GatewayPayload)
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

  const hasOpenWorkbenchDrawer = isToolsDrawerOpen || isDetailsDrawerOpen
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
        </div>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <AppFeedbackBanner
          tone="error"
          title="站点网关 ROS 连接失败"
          description={snapshot.lastError}
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

          <ObjectListCard
            entityGroups={entityGroups}
            selectedEntity={selectedEntity}
            isZoneListLoading={isZoneListLoading}
            onSelect={handleSelectEntityFromList}
          />

          <CurrentMapCard
            data={data}
            hasWorkspaceContext={hasWorkspaceContext}
            workspaceMapName={workspaceMapName}
            effectiveAlignment={effectiveAlignment}
            isInitialLoading={isInitialLoading}
            mapError={mapError}
          />

          <MapAssetPanel
            enabledMapAssets={enabledMapAssets}
            disabledMapAssets={disabledMapAssets}
            mapCatalogError={mapCatalog.error ?? null}
            mapAssetFeedback={mapAssetFeedback}
            mapImportFeedback={mapImportFeedback}
            mapImportForm={mapImportForm}
            servicesReady={servicesReady}
            isAnyEditorActive={isAnyEditorActive}
            isCleanupDryRunning={isCleanupDryRunning}
            isCleanupExecuting={isCleanupExecuting}
            isCheckingMapImport={isCheckingMapImport}
            isImportingMapAsset={isImportingMapAsset}
            softDeletingRevisionId={softDeletingRevisionId}
            hardDeletingRevisionId={hardDeletingRevisionId}
            onClearAssetFeedback={() => setMapAssetFeedback(null)}
            onClearImportFeedback={() => setMapImportFeedback(null)}
            onImportCurrentMapAsset={() => void handleImportCurrentMapAsset()}
            onSoftDeleteMapAsset={(entry) => void handleSoftDeleteMapAsset(entry)}
            onHardDeleteMapAsset={(entry) => void handleHardDeleteMapAsset(entry)}
            onCleanupDisabledMapAssets={() => void handleCleanupDisabledMapAssets()}
          />

          <LayerVisibilityCard
            layerVisibility={layerVisibility}
            onLayerVisibilityChange={setLayerVisibility}
          />

          <ZoneFocusCard
            showSelectedZoneOnly={showSelectedZoneOnly}
            showSelectedZonePath={showSelectedZonePath}
            onShowSelectedZoneOnlyChange={setShowSelectedZoneOnly}
            onShowSelectedZonePathChange={setShowSelectedZonePath}
          />

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
            </div>
          ) : null}

          <Card
            title="地图画布"
            className="workbench-card workbench-canvas-card"
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
                robotPose={robotPose}
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

          <MapWorkbenchDetailsPanel
            selectedEntity={selectedEntity}
            selectedZoneEntity={selectedZoneEntity}
            selectedNoGoAreaEntity={selectedNoGoAreaEntity}
            selectedVirtualWallEntity={selectedVirtualWallEntity}
            selectedZonePathResult={selectedZonePathResult}
            selectedZonePathLoading={selectedZonePathQuery.isLoading}
            selectedZonePathError={
              selectedZonePathQuery.error instanceof Error
                ? selectedZonePathQuery.error
                : null
            }
            showSelectedZonePath={showSelectedZonePath}
            hasMap={hasMap}
            zoneActionFeedback={zoneActionFeedback}
            isLoadingZoneDetail={isLoadingZoneDetail}
            isLoadingNoGoDetail={isLoadingNoGoDetail}
            isLoadingWallDetail={isLoadingWallDetail}
            isAnyEditorActive={isAnyEditorActive}
            constraintMode={constraintMode}
            constraintDeleteLoading={constraintDeleteLoading}
            isDeletingZone={isDeletingZone}
            onClearZoneActionFeedback={() => setZoneActionFeedback(null)}
            onStartEditingZone={handleStartEditingZone}
            onStartEditingNoGo={handleStartEditingNoGo}
            onStartEditingWall={handleStartEditingWall}
            onDeleteZone={handleDeleteZone}
            onDeleteNoGo={handleDeleteNoGo}
            onDeleteWall={handleDeleteWall}
          />
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


