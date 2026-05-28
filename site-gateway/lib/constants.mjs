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
  'dock-calibration',
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
  'dockCalibration',
  'profileCatalog',
  'systemReadiness',
]

export const MODULE_CAPABILITY_MAP = {
  overview: ['overview'],
  workbench: ['mapWorkbench'],
  tasks: ['taskManagement'],
  schedules: ['scheduleManagement'],
  execution: ['executionControl'],
  'dock-calibration': ['dockCalibration'],
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
  'dock-calibration': true,
  slam: true,
  runtime: true,
  'actuator-control': true,
}

// Operators intentionally receive only the overview capability. The overview page
// may still send controlled task, return-home, and manual-drive commands through
// explicit overview-allowed routes; management and debug pages require dedicated
// capabilities.
export const DEFAULT_ROLE_POLICY = {
  operator: ['overview'],
  service: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'dockCalibration',
    'runtimeMonitoring',
    'slamWorkbench',
    'profileCatalog',
    'systemReadiness',
  ],
  engineer: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'dockCalibration',
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
  dockCalibration: '充电桩标定',
  profileCatalog: '档位目录',
  systemReadiness: '系统就绪检查',
}

function createServiceDependencyGroup(canonicalServiceName) {
  return {
    label: canonicalServiceName,
    probeNames: [canonicalServiceName],
    preferredServiceName: canonicalServiceName,
  }
}

export function flattenServiceDependencyLabels(groups = []) {
  return groups.map((group) => group.label)
}

export const SERVICE_DEPENDENCIES = {
  mapWorkbench: [
    createServiceDependencyGroup('/clean_robot_server/app/map_server'),
    createServiceDependencyGroup('/database_server/site/map_alignment_service'),
    createServiceDependencyGroup('/database_server/site/coverage_zone_service'),
    createServiceDependencyGroup('/database_server/site/no_go_area_service'),
    createServiceDependencyGroup('/database_server/site/virtual_wall_service'),
  ],
  taskManagement: [createServiceDependencyGroup('/database_server/app/clean_task_service')],
  scheduleManagement: [
    createServiceDependencyGroup('/database_server/app/clean_schedule_service'),
  ],
  executionControl: [
    createServiceDependencyGroup('/coverage_task_manager/app/exe_task_server'),
    SYSTEM_READINESS_SERVICE_DEPENDENCY,
  ],
  dockCalibration: [
    createServiceDependencyGroup('/clean_robot_server/app/get_dock_calibration_status'),
    createServiceDependencyGroup('/clean_robot_server/app/dock_calibration_command'),
  ],
  slamWorkbench: [
    SLAM_STATUS_SERVICE_DEPENDENCY,
    createServiceDependencyGroup('/clean_robot_server/app/submit_slam_command'),
    SLAM_JOB_SERVICE_DEPENDENCY,
    ODOMETRY_STATUS_SERVICE_DEPENDENCY,
  ],
  profileCatalog: [PROFILE_CATALOG_SERVICE_DEPENDENCY],
  systemReadiness: [SYSTEM_READINESS_SERVICE_DEPENDENCY],
}

export const TOPIC_DEPENDENCIES = {
  runtimeMonitoring: ['/battery_state', '/combined_status', '/station_status'],
  actuatorControl: [
    '/combined_status',
    '/mcore_tcp_bridge/connected',
    '/station_tcp_bridge/connected',
    '/dock_supply/state',
    '/station_status',
    '/battery_state',
  ],
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
export const ACTUATOR_LEVEL_MAX = 100
export const ACTUATOR_SEQUENCE_DELAY_MS = 150

export const ACTUATOR_CONTROL_TOPICS = {
  waterTap: {
    name: '/mcore/control_water_tap',
    type: 'robot_platform_msgs/ControlWaterTap',
  },
  motor: {
    name: '/mcore/control_motor',
    type: 'robot_platform_msgs/ControlMotor',
  },
  cleanTools: {
    name: '/mcore/control_clean_tools',
    type: 'robot_platform_msgs/ControlCleanTools',
  },
  stationControl: {
    name: '/station/control',
    type: 'robot_platform_msgs/ControlStation',
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
export const DOCK_CALIBRATION_STATUS_SERVICE_NAME =
  '/clean_robot_server/app/get_dock_calibration_status'
export const DOCK_CALIBRATION_COMMAND_SERVICE_NAME =
  '/clean_robot_server/app/dock_calibration_command'
export const MAP_SERVICE_NAME = '/clean_robot_server/app/map_server'
export const SITE_ALIGNMENT_SERVICE_NAME = '/database_server/site/map_alignment_service'
export const SITE_ALIGNMENT_BY_POINTS_SERVICE_NAME =
  '/database_server/site/map_alignment_by_points_service'
export const SITE_RECT_ZONE_PREVIEW_SERVICE_NAME =
  '/database_server/site/rect_zone_preview_service'
export const SITE_COVERAGE_ZONE_SERVICE_NAME =
  '/database_server/site/coverage_zone_service'
export const SITE_ZONE_PLAN_PATH_SERVICE_NAME =
  '/database_server/site/zone_plan_path_service'
export const SITE_COVERAGE_PREVIEW_SERVICE_NAME =
  '/database_server/site/coverage_preview_service'
export const SITE_COVERAGE_COMMIT_SERVICE_NAME =
  '/database_server/site/coverage_commit_service'
export const SITE_NO_GO_AREA_SERVICE_NAME = '/database_server/site/no_go_area_service'
export const SITE_VIRTUAL_WALL_SERVICE_NAME =
  '/database_server/site/virtual_wall_service'

export const SESSION_COOKIE_NAME = 'clean_robot_site_session'
