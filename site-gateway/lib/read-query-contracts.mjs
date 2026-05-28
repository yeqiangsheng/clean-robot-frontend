export function createReadQueryDependencyGroup(contract) {
  return {
    label: contract.canonical.serviceName,
    probeNames: [contract.canonical.serviceName],
    preferredServiceName: contract.canonical.serviceName,
  }
}

export const SLAM_STATUS_QUERY_CONTRACT = {
  key: 'slam-status',
  canonical: {
    serviceName: '/clean_robot_server/app/get_slam_status',
    serviceType: 'cleanrobot_app_msgs/GetSlamStatus',
  },
}

export const SLAM_JOB_QUERY_CONTRACT = {
  key: 'slam-job',
  canonical: {
    serviceName: '/clean_robot_server/app/get_slam_job',
    serviceType: 'cleanrobot_app_msgs/GetSlamJob',
  },
}

export const ODOMETRY_STATUS_QUERY_CONTRACT = {
  key: 'odometry-status',
  canonical: {
    serviceName: '/clean_robot_server/app/get_odometry_status',
    serviceType: 'cleanrobot_app_msgs/GetOdometryStatus',
  },
}

export const SYSTEM_READINESS_QUERY_CONTRACT = {
  key: 'system-readiness',
  canonical: {
    serviceName: '/coverage_task_manager/app/get_system_readiness',
    serviceType: 'cleanrobot_app_msgs/GetSystemReadiness',
  },
}

export const PROFILE_CATALOG_QUERY_CONTRACT = {
  key: 'profile-catalog',
  canonical: {
    serviceName: '/database_server/app/profile_catalog_service',
    serviceType: 'cleanrobot_app_msgs/GetProfileCatalog',
  },
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

export const SLAM_STATE_TOPIC_NAME = '/clean_robot_server/slam_state'
export const SLAM_STATE_TOPIC_TYPE = 'cleanrobot_app_msgs/SlamState'
export const SLAM_JOB_TOPIC_NAME = '/clean_robot_server/slam_job_state'
export const SLAM_JOB_TOPIC_TYPE = 'cleanrobot_app_msgs/SlamJobState'
export const ODOMETRY_STATE_TOPIC_NAME = '/clean_robot_server/odometry_state'
export const ODOMETRY_STATE_TOPIC_TYPE = 'cleanrobot_app_msgs/OdometryState'
export const SYSTEM_READINESS_TOPIC_NAME =
  '/coverage_task_manager/system_readiness'
export const SYSTEM_READINESS_TOPIC_TYPE =
  'cleanrobot_app_msgs/SystemReadiness'
