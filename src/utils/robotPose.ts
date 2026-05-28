import type { Pose2D } from '../types/map-editor'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return value
  }
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function pickValue(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return undefined
}

function normalizeAngle(value: number | null) {
  if (value === null) {
    return null
  }

  return Math.abs(value) > Math.PI * 2 && Math.abs(value) <= 360
    ? (value * Math.PI) / 180
    : value
}

function yawFromQuaternion(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const qx = toNumber(value.x) ?? 0
  const qy = toNumber(value.y) ?? 0
  const qz = toNumber(value.z) ?? 0
  const qw = toNumber(value.w) ?? 1

  return Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz))
}

function extractTheta(record: JsonRecord) {
  const degreeValue = toNumber(
    pickValue(record, ['theta_deg', 'thetaDeg', 'yaw_deg', 'yawDeg', 'heading_deg', 'headingDeg']),
  )

  if (degreeValue !== null) {
    return (degreeValue * Math.PI) / 180
  }

  const directValue = toNumber(
    pickValue(record, [
      'theta',
      'yaw',
      'angle',
      'heading',
      'yaw_rad',
      'yawRad',
      'tracked_pose_theta',
      'trackedPoseTheta',
    ]),
  )

  if (directValue !== null) {
    return normalizeAngle(directValue)
  }

  return yawFromQuaternion(pickValue(record, ['orientation', 'quaternion']))
}

function poseFromRecord(record: JsonRecord): Pose2D | null {
  const directX = toNumber(
    pickValue(record, [
      'x',
      'map_x',
      'mapX',
      'pose_x',
      'poseX',
      'position_x',
      'positionX',
      'tracked_pose_x',
      'trackedPoseX',
    ]),
  )
  const directY = toNumber(
    pickValue(record, [
      'y',
      'map_y',
      'mapY',
      'pose_y',
      'poseY',
      'position_y',
      'positionY',
      'tracked_pose_y',
      'trackedPoseY',
    ]),
  )

  if (directX !== null && directY !== null) {
    return {
      x: directX,
      y: directY,
      theta: extractTheta(record),
    }
  }

  const position = pickValue(record, ['position', 'translation', 'point'])
  if (isRecord(position)) {
    const nestedX = toNumber(pickValue(position, ['x']))
    const nestedY = toNumber(pickValue(position, ['y']))

    if (nestedX !== null && nestedY !== null) {
      return {
        x: nestedX,
        y: nestedY,
        theta: extractTheta(record),
      }
    }
  }

  return null
}

export function extractRobotPose(value: unknown): Pose2D | null {
  const parsed = parseMaybeJson(value)

  if (Array.isArray(parsed) && parsed.length >= 2) {
    const x = toNumber(parsed[0])
    const y = toNumber(parsed[1])
    if (x !== null && y !== null) {
      return {
        x,
        y,
        theta: normalizeAngle(toNumber(parsed[2])),
      }
    }
  }

  if (!isRecord(parsed)) {
    return null
  }

  const directPose = poseFromRecord(parsed)
  if (directPose) {
    return directPose
  }

  const nestedKeys = [
    'tracked_pose',
    'trackedPose',
    'robot_pose',
    'robotPose',
    'map_pose',
    'mapPose',
    'current_pose',
    'currentPose',
    'localized_pose',
    'localizedPose',
    'base_pose',
    'basePose',
    'pose2d',
    'pose2D',
  ]

  for (const key of nestedKeys) {
    const nestedPose = extractRobotPose(parsed[key])
    if (nestedPose) {
      return nestedPose
    }
  }

  const poseValue = parsed.pose
  if (isRecord(poseValue)) {
    const rosPose = isRecord(poseValue.pose) ? poseValue.pose : poseValue
    const nestedPose = extractRobotPose(rosPose)
    if (nestedPose) {
      return nestedPose
    }
  }

  return null
}

export function formatPoseCoordinate(value: number) {
  return value.toFixed(2)
}

export function formatPoseHeading(theta: number | null) {
  if (theta === null) {
    return '--'
  }

  return `${((theta * 180) / Math.PI).toFixed(0)}°`
}
