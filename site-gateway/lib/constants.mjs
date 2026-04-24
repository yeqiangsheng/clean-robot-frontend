import {
  ODOMETRY_STATUS_SERVICE_DEPENDENCY,
  PROFILE_CATALOG_SERVICE_DEPENDENCY,
  SLAM_JOB_SERVICE_DEPENDENCY,
  SLAM_STATUS_SERVICE_DEPENDENCY,
  SYSTEM_READINESS_SERVICE_DEPENDENCY,
} from './read-query-contracts.mjs'

export const USER_ROLES = ['operator', 'service', 'engineer', 'admin']

export const APP_MODULE_KEYS = [
  'overview',
  'workbench',
  'tasks',
  'schedules',
  'execution',
  'slam',
  'runtime',
  'actuator-control',
]

export const CAPABILITY_FLAGS = [
  'overview',
  'mapWorkbench',
  'taskManagement',
  'scheduleManagement',
  'executionControl',
  'slamWorkbench',
  'runtimeMonitoring',
  'actuatorControl',
  'chargingControl',
  'profileCatalog',
  'systemReadiness',
]

export const MODULE_CAPABILITY_MAP = {
  overview: ['overview'],
  workbench: ['mapWorkbench'],
  tasks: ['taskManagement'],
  schedules: ['scheduleManagement'],
  execution: ['executionControl'],
  slam: ['slamWorkbench'],
  runtime: ['runtimeMonitoring'],
  'actuator-control': ['actuatorControl', 'chargingControl'],
}

export const DEFAULT_ENABLED_MODULES = {
  overview: true,
  workbench: true,
  tasks: true,
  schedules: true,
  execution: true,
  slam: true,
  runtime: true,
  'actuator-control': true,
}

export const DEFAULT_ROLE_POLICY = {
  operator: [
    'overview',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'profileCatalog',
    'systemReadiness',
  ],
  service: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'runtimeMonitoring',
    'profileCatalog',
    'systemReadiness',
  ],
  engineer: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'slamWorkbench',
    'runtimeMonitoring',
    'actuatorControl',
    'chargingControl',
    'profileCatalog',
    'systemReadiness',
  ],
  admin: [...CAPABILITY_FLAGS],
}

export const CAPABILITY_TITLES = {
  overview: '系统总览',
  mapWorkbench: '地图工作台',
  taskManagement: '任务管理',
  scheduleManagement: '调度管理',
  executionControl: '执行控制',
  slamWorkbench: 'SLAM 工程台',
  runtimeMonitoring: '运行监控',
  actuatorControl: '执行机构调试',
  chargingControl: '充电控制',
  profileCatalog: '档位目录',
  systemReadiness: '系统就绪检查',
}

function createServiceDependencyGroup(
  canonicalServiceName,
  deprecatedFallbackProbeNames = [],
) {
  return {
    label: canonicalServiceName,
    probeNames: [canonicalServiceName, ...deprecatedFallbackProbeNames],
    preferredServiceName: canonicalServiceName,
  }
}

export function flattenServiceDependencyLabels(groups = []) {
  return groups.map((group) => group.label)
}

export const SERVICE_DEPENDENCIES = {
  mapWorkbench: [
    createServiceDependencyGroup('/clean_robot_server/app/map_server', [
      '/clean_robot_server/map_server',
    ]),
    createServiceDependencyGroup('/database_server/site/map_alignment_service', [
      '/database_server/map_alignment_service',
    ]),
    createServiceDependencyGroup('/database_server/site/coverage_zone_service', [
      '/database_server/coverage_zone_service',
    ]),
    createServiceDependencyGroup('/database_server/site/no_go_area_service', [
      '/database_server/no_go_area_service',
    ]),
    createServiceDependencyGroup('/database_server/site/virtual_wall_service', [
      '/database_server/virtual_wall_service',
    ]),
  ],
  taskManagement: [
    createServiceDependencyGroup('/database_server/app/clean_task_service', [
      '/database_server/clean_task_service',
    ]),
  ],
  scheduleManagement: [
    createServiceDependencyGroup('/database_server/app/clean_schedule_service', [
      '/database_server/clean_schedule_service',
    ]),
  ],
  executionControl: [
    createServiceDependencyGroup('/coverage_task_manager/app/exe_task_server', [
      '/exe_task_server',
    ]),
    SYSTEM_READINESS_SERVICE_DEPENDENCY,
  ],
  slamWorkbench: [
    SLAM_STATUS_SERVICE_DEPENDENCY,
    createServiceDependencyGroup('/clean_robot_server/app/submit_slam_command', [
      '/clean_robot_server/submit_slam_command',
      '/clean_robot_server/slam_command_service',
    ]),
    SLAM_JOB_SERVICE_DEPENDENCY,
    ODOMETRY_STATUS_SERVICE_DEPENDENCY,
  ],
  profileCatalog: [PROFILE_CATALOG_SERVICE_DEPENDENCY],
  systemReadiness: [SYSTEM_READINESS_SERVICE_DEPENDENCY],
}

export const TOPIC_DEPENDENCIES = {
  runtimeMonitoring: ['/battery_state', '/combined_status', '/station_status'],
  actuatorControl: ['/combined_status', '/battery_state', '/station_status'],
  chargingControl: ['/battery_state', '/station_status'],
}

export const RUNTIME_TOPIC_CONFIGS = [
  {
    key: 'taskState',
    label: 'Task State',
    topicName: '/coverage_task_manager/state',
    staleAfterMs: 120000,
  },
  {
    key: 'taskEvent',
    label: 'Task Event',
    topicName: '/coverage_task_manager/event',
    staleAfterMs: 120000,
  },
  {
    key: 'executorState',
    label: 'Executor State',
    topicName: '/coverage_executor/state',
    staleAfterMs: 120000,
  },
  {
    key: 'runProgress',
    label: 'Run Progress',
    topicName: '/coverage_executor/run_progress',
    staleAfterMs: 5000,
  },
  {
    key: 'dockSupplyState',
    label: 'Dock / Supply State',
    topicName: '/dock_supply/state',
    staleAfterMs: 30000,
  },
  {
    key: 'batteryState',
    label: 'Battery State',
    topicName: '/battery_state',
    staleAfterMs: 30000,
  },
  {
    key: 'combinedStatus',
    label: 'Combined Status',
    topicName: '/combined_status',
    staleAfterMs: 30000,
  },
  {
    key: 'stationStatus',
    label: 'Station Status',
    topicName: '/station_status',
    staleAfterMs: 30000,
  },
]

export const ACTUATOR_LEVEL_MIN = 0
export const ACTUATOR_LEVEL_MAX = 64
export const ACTUATOR_SEQUENCE_DELAY_MS = 150

export const ACTUATOR_CONTROL_TOPICS = {
  waterTap: {
    name: '/mcore/control_water_tap',
    type: 'my_msg_srv/ControlWaterTap',
  },
  motor: {
    name: '/mcore/control_motor',
    type: 'my_msg_srv/ControlMotor',
  },
  cleanTools: {
    name: '/mcore/control_clean_tools',
    type: 'my_msg_srv/ControlCleanTools',
  },
  stationControl: {
    name: '/station/control',
    type: 'my_msg_srv/ControlStation',
  },
  chargeEnable: {
    name: '/mcore/charge_enable',
    type: 'std_msgs/Bool',
  },
}

export const TASK_SERVICE_NAME = '/database_server/app/clean_task_service'
export const SCHEDULE_SERVICE_NAME = '/database_server/app/clean_schedule_service'
export const EXECUTION_SERVICE_NAME = '/coverage_task_manager/app/exe_task_server'
export const SLAM_SUBMIT_SERVICE_NAME = '/clean_robot_server/app/submit_slam_command'
export const TASK_SERVICE_FALLBACK_NAME = '/database_server/clean_task_service'
export const SCHEDULE_SERVICE_FALLBACK_NAME = '/database_server/clean_schedule_service'
export const EXECUTION_SERVICE_FALLBACK_NAME = '/exe_task_server'
export const SLAM_SUBMIT_SERVICE_FALLBACK_NAME =
  '/clean_robot_server/submit_slam_command'
export const SLAM_SWITCH_MAP_FALLBACK_SERVICE_NAME =
  '/clean_robot_server/slam_command_service'
export const MAP_SERVICE_NAME = '/clean_robot_server/app/map_server'
export const MAP_SERVICE_FALLBACK_NAME = '/clean_robot_server/map_server'
export const SITE_ALIGNMENT_SERVICE_NAME = '/database_server/site/map_alignment_service'
export const SITE_ALIGNMENT_SERVICE_FALLBACK_NAME =
  '/database_server/map_alignment_service'
export const SITE_ALIGNMENT_BY_POINTS_SERVICE_NAME =
  '/database_server/site/map_alignment_by_points_service'
export const SITE_ALIGNMENT_BY_POINTS_SERVICE_FALLBACK_NAME =
  '/database_server/map_alignment_by_points_service'
export const SITE_RECT_ZONE_PREVIEW_SERVICE_NAME =
  '/database_server/site/rect_zone_preview_service'
export const SITE_RECT_ZONE_PREVIEW_SERVICE_FALLBACK_NAME =
  '/database_server/rect_zone_preview_service'
export const SITE_COVERAGE_ZONE_SERVICE_NAME =
  '/database_server/site/coverage_zone_service'
export const SITE_COVERAGE_ZONE_SERVICE_FALLBACK_NAME =
  '/database_server/coverage_zone_service'
export const SITE_ZONE_PLAN_PATH_SERVICE_NAME =
  '/database_server/site/zone_plan_path_service'
export const SITE_ZONE_PLAN_PATH_SERVICE_FALLBACK_NAME =
  '/database_server/zone_plan_path_service'
export const SITE_COVERAGE_PREVIEW_SERVICE_NAME =
  '/database_server/site/coverage_preview_service'
export const SITE_COVERAGE_PREVIEW_SERVICE_FALLBACK_NAME =
  '/database_server/coverage_preview_service'
export const SITE_COVERAGE_COMMIT_SERVICE_NAME =
  '/database_server/site/coverage_commit_service'
export const APP_COVERAGE_COMMIT_SERVICE_NAME =
  '/database_server/app/coverage_commit_service'
export const SITE_NO_GO_AREA_SERVICE_NAME = '/database_server/site/no_go_area_service'
export const SITE_NO_GO_AREA_SERVICE_FALLBACK_NAME =
  '/database_server/no_go_area_service'
export const SITE_VIRTUAL_WALL_SERVICE_NAME =
  '/database_server/site/virtual_wall_service'
export const SITE_VIRTUAL_WALL_SERVICE_FALLBACK_NAME =
  '/database_server/virtual_wall_service'

const CANONICAL_MIGRATED_WRITE_SERVICE_NAMES = [
  TASK_SERVICE_NAME,
  SCHEDULE_SERVICE_NAME,
  EXECUTION_SERVICE_NAME,
  SLAM_SUBMIT_SERVICE_NAME,
  MAP_SERVICE_NAME,
  SITE_ALIGNMENT_SERVICE_NAME,
  SITE_ALIGNMENT_BY_POINTS_SERVICE_NAME,
  SITE_RECT_ZONE_PREVIEW_SERVICE_NAME,
  SITE_COVERAGE_ZONE_SERVICE_NAME,
  SITE_ZONE_PLAN_PATH_SERVICE_NAME,
  SITE_COVERAGE_PREVIEW_SERVICE_NAME,
  SITE_COVERAGE_COMMIT_SERVICE_NAME,
  APP_COVERAGE_COMMIT_SERVICE_NAME,
  SITE_NO_GO_AREA_SERVICE_NAME,
  SITE_VIRTUAL_WALL_SERVICE_NAME,
]

const DEPRECATED_FALLBACK_WRITE_SERVICE_NAMES = [
  TASK_SERVICE_FALLBACK_NAME,
  SCHEDULE_SERVICE_FALLBACK_NAME,
  EXECUTION_SERVICE_FALLBACK_NAME,
  SLAM_SUBMIT_SERVICE_FALLBACK_NAME,
  SLAM_SWITCH_MAP_FALLBACK_SERVICE_NAME,
  MAP_SERVICE_FALLBACK_NAME,
  SITE_ALIGNMENT_SERVICE_FALLBACK_NAME,
  SITE_ALIGNMENT_BY_POINTS_SERVICE_FALLBACK_NAME,
  SITE_RECT_ZONE_PREVIEW_SERVICE_FALLBACK_NAME,
  SITE_COVERAGE_ZONE_SERVICE_FALLBACK_NAME,
  SITE_ZONE_PLAN_PATH_SERVICE_FALLBACK_NAME,
  SITE_COVERAGE_PREVIEW_SERVICE_FALLBACK_NAME,
  SITE_NO_GO_AREA_SERVICE_FALLBACK_NAME,
  SITE_VIRTUAL_WALL_SERVICE_FALLBACK_NAME,
]

export const MIGRATED_WRITE_SERVICE_NAMES = new Set([
  ...CANONICAL_MIGRATED_WRITE_SERVICE_NAMES,
  ...DEPRECATED_FALLBACK_WRITE_SERVICE_NAMES,
])

export const SESSION_COOKIE_NAME = 'clean_robot_site_session'
