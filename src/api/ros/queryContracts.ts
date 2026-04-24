export interface RosReadServiceDefinition {
  serviceName: string
  serviceType: string
}

export interface RosReadQueryContract<Key extends string = string> {
  key: Key
  canonical: RosReadServiceDefinition
}

export interface ServiceDependencyAlternativeGroup {
  label: string
  probeNames: string[]
  preferredServiceName: string
}

function createReadQueryDependencyGroup(
  contract: RosReadQueryContract,
): ServiceDependencyAlternativeGroup {
  const deprecatedFallback = getDeprecatedReadQueryFallback(contract)

  return {
    label: contract.canonical.serviceName,
    probeNames: [
      contract.canonical.serviceName,
      ...(deprecatedFallback ? [deprecatedFallback.serviceName] : []),
    ],
    preferredServiceName: contract.canonical.serviceName,
  }
}

export const SLAM_STATUS_QUERY_CONTRACT = {
  key: 'slam-status',
  canonical: {
    serviceName: '/clean_robot_server/app/get_slam_status',
    serviceType: 'cleanrobot_app_msgs/GetSlamStatus',
  },
} as const satisfies RosReadQueryContract<'slam-status'>

export const SLAM_JOB_QUERY_CONTRACT = {
  key: 'slam-job',
  canonical: {
    serviceName: '/clean_robot_server/app/get_slam_job',
    serviceType: 'cleanrobot_app_msgs/GetSlamJob',
  },
} as const satisfies RosReadQueryContract<'slam-job'>

export const ODOMETRY_STATUS_QUERY_CONTRACT = {
  key: 'odometry-status',
  canonical: {
    serviceName: '/clean_robot_server/app/get_odometry_status',
    serviceType: 'cleanrobot_app_msgs/GetOdometryStatus',
  },
} as const satisfies RosReadQueryContract<'odometry-status'>

export const SYSTEM_READINESS_QUERY_CONTRACT = {
  key: 'system-readiness',
  canonical: {
    serviceName: '/coverage_task_manager/app/get_system_readiness',
    serviceType: 'cleanrobot_app_msgs/GetSystemReadiness',
  },
} as const satisfies RosReadQueryContract<'system-readiness'>

export const PROFILE_CATALOG_QUERY_CONTRACT = {
  key: 'profile-catalog',
  canonical: {
    serviceName: '/database_server/app/profile_catalog_service',
    serviceType: 'cleanrobot_app_msgs/GetProfileCatalog',
  },
} as const satisfies RosReadQueryContract<'profile-catalog'>

const DEPRECATED_READ_QUERY_FALLBACKS = {
  'slam-status': {
    serviceName: '/clean_robot_server/get_slam_status',
    serviceType: 'my_msg_srv/GetSlamStatus',
  },
  'slam-job': {
    serviceName: '/clean_robot_server/get_slam_job',
    serviceType: 'my_msg_srv/GetSlamJob',
  },
  'odometry-status': {
    serviceName: '/clean_robot_server/get_odometry_status',
    serviceType: 'my_msg_srv/GetOdometryStatus',
  },
  'system-readiness': {
    serviceName: '/coverage_task_manager/get_system_readiness',
    serviceType: 'my_msg_srv/GetSystemReadiness',
  },
  'profile-catalog': {
    serviceName: '/database_server/profile_catalog_service',
    serviceType: 'my_msg_srv/GetProfileCatalog',
  },
} as const satisfies Partial<Record<string, RosReadServiceDefinition>>

export function getDeprecatedReadQueryFallback(
  contractOrKey: RosReadQueryContract | string,
) {
  const key = typeof contractOrKey === 'string' ? contractOrKey : contractOrKey.key

  if (!(key in DEPRECATED_READ_QUERY_FALLBACKS)) {
    return null
  }

  return DEPRECATED_READ_QUERY_FALLBACKS[
    key as keyof typeof DEPRECATED_READ_QUERY_FALLBACKS
  ]
}

export const SLAM_STATUS_SERVICE_DEPENDENCY =
  createReadQueryDependencyGroup(SLAM_STATUS_QUERY_CONTRACT)
export const SLAM_JOB_SERVICE_DEPENDENCY =
  createReadQueryDependencyGroup(SLAM_JOB_QUERY_CONTRACT)
export const ODOMETRY_STATUS_SERVICE_DEPENDENCY =
  createReadQueryDependencyGroup(ODOMETRY_STATUS_QUERY_CONTRACT)
export const SYSTEM_READINESS_SERVICE_DEPENDENCY =
  createReadQueryDependencyGroup(SYSTEM_READINESS_QUERY_CONTRACT)
export const PROFILE_CATALOG_SERVICE_DEPENDENCY =
  createReadQueryDependencyGroup(PROFILE_CATALOG_QUERY_CONTRACT)

export const SLAM_WORKFLOW_STATE_TOPIC_NAME = '/clean_robot_server/slam_state'
export const SLAM_WORKFLOW_STATE_TOPIC_TYPE = 'cleanrobot_app_msgs/SlamState'
export const SLAM_WORKFLOW_JOB_TOPIC_NAME = '/clean_robot_server/slam_job_state'
export const SLAM_WORKFLOW_JOB_TOPIC_TYPE = 'cleanrobot_app_msgs/SlamJobState'
export const ODOMETRY_STATE_TOPIC_NAME = '/clean_robot_server/odometry_state'
export const ODOMETRY_STATE_TOPIC_TYPE = 'cleanrobot_app_msgs/OdometryState'
export const SYSTEM_READINESS_TOPIC_NAME =
  '/coverage_task_manager/system_readiness'
export const SYSTEM_READINESS_TOPIC_TYPE =
  'cleanrobot_app_msgs/SystemReadiness'
