export interface Point2D {
  x: number
  y: number
}

export interface Pose2D extends Point2D {
  theta: number | null
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export interface DisplayFrame {
  frameId?: string
  rotationDeg: number | null
  scale: number | null
  origin: Point2D | null
  raw: Record<string, unknown> | null
}

export interface OccupancyGrid {
  width: number
  height: number
  resolution: number
  origin: Point2D
  data: readonly number[] | Int16Array
}

export type RegionSet = Point2D[][]
export type PathSet = Point2D[][]
export type LayerKey = 'map' | 'zone' | 'noGoArea' | 'virtualWall'

export interface WorkbenchEntityBase {
  id: string
  name: string
  kind: LayerKey
  displayRegion: RegionSet
  displayPath: PathSet
  displayFrame: DisplayFrame | null
  metadata: Record<string, unknown>
  raw: Record<string, unknown>
}

export interface MapEntity extends WorkbenchEntityBase {
  kind: 'map'
  resolution: number | null
  rasterImageUrl: string | null
  occupancyGrid: OccupancyGrid | null
  size: {
    width: number | null
    height: number | null
  }
}

export interface AreaEntity extends WorkbenchEntityBase {
  kind: 'zone' | 'noGoArea' | 'virtualWall'
  color: string
}

export interface MapAlignment {
  id: string
  name: string
  status: string
  alignmentVersion: string | null
  rawFrame: string | null
  alignedFrame: string | null
  active: boolean
  displayFrame: DisplayFrame | null
  rotationDeg: number | null
  pivot: Point2D | null
  metadata: Record<string, unknown>
  raw: Record<string, unknown>
}

export interface ZoneRectDraft {
  displayRegion: RegionSet
  displayFrame: DisplayFrame | null
  mapRegion: RegionSet | null
  widthM: number | null
  heightM: number | null
  areaM2: number | null
  warnings: string[]
  raw: Record<string, unknown>
}

export interface VirtualWallDraft {
  displayPath: PathSet
  displayFrame: DisplayFrame | null
  mapPath: PathSet | null
  bufferM: number | null
  warnings: string[]
  raw: Record<string, unknown>
}

export type ZoneEditorMode =
  | 'idle'
  | 'aligning'
  | 'creating-zone'
  | 'editing-zone'
  | 'previewing'

export type ConstraintEditorMode =
  | 'idle'
  | 'creating-no-go'
  | 'editing-no-go'
  | 'creating-wall'
  | 'editing-wall'

export type WorkbenchEditorMode = ZoneEditorMode | Exclude<ConstraintEditorMode, 'idle'>

export interface ZoneDraftPreview {
  displayPreviewPath: PathSet
  displayEntryPose: Pose2D | null
  estimatedLengthM: number | null
  estimatedDurationS: number | null
  warnings: string[]
  valid: boolean | null
}

export interface ZonePlanPathResult {
  zoneId: string
  activePlanId: string | null
  planProfileName: string
  alignmentVersion: string | null
  displayFrame: DisplayFrame | null
  storageFrame: string | null
  displayPath: PathSet
  mapPath: PathSet
  displayEntryPose: Pose2D | null
  entryPose: Pose2D | null
  estimatedLengthM: number | null
  estimatedDurationS: number | null
  warnings: string[]
  raw: Record<string, unknown>
}

export interface ZoneEditSession {
  zoneId: string
  zoneVersion: number | null
  displayName: string
  profileName: string
}

export interface NoGoEditSession {
  areaId: string
  displayName: string
  enabled: boolean
  frameId: string | null
}

export interface VirtualWallEditSession {
  wallId: string
  displayName: string
  enabled: boolean
  frameId: string | null
  bufferM: number | null
}

export interface ZoneCommitResult {
  zoneId: string
  zoneVersion: number | null
  planId: string | null
  warnings: string[]
  raw: Record<string, unknown>
}

export type WorkbenchSelection =
  | {
      kind: LayerKey
      id: string
    }
  | null

export interface LayerVisibility {
  map: boolean
  zone: boolean
  noGoArea: boolean
  virtualWall: boolean
}

export interface MapWorkbenchData {
  map: MapEntity | null
  alignment: MapAlignment | null
  zones: AreaEntity[]
  noGoAreas: AreaEntity[]
  virtualWalls: AreaEntity[]
  warnings: string[]
}

export interface ViewportTransform {
  scale: number
  offsetX: number
  offsetY: number
  padding: number
}
