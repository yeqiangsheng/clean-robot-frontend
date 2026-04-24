export const EXECUTION_SERVICE = {
  canonicalName: '/coverage_task_manager/app/exe_task_server',
  deprecatedFallbackName: '/exe_task_server',
  serviceType: 'my_msg_srv/ExeTask',
} as const

export const TASK_SERVICE = {
  canonicalName: '/database_server/app/clean_task_service',
  deprecatedFallbackName: '/database_server/clean_task_service',
  serviceType: 'my_msg_srv/OperateTask',
} as const

export const SCHEDULE_SERVICE = {
  canonicalName: '/database_server/app/clean_schedule_service',
  deprecatedFallbackName: '/database_server/clean_schedule_service',
  serviceType: 'my_msg_srv/OperateSchedule',
} as const

export const MAP_CATALOG_SERVICE = {
  canonicalName: '/clean_robot_server/app/map_server',
  deprecatedFallbackName: '/clean_robot_server/map_server',
  serviceType: 'my_msg_srv/OperateMap',
} as const

export const SLAM_SUBMIT_SERVICE = {
  canonicalName: '/clean_robot_server/app/submit_slam_command',
  deprecatedFallbackName: '/clean_robot_server/submit_slam_command',
  serviceType: 'my_msg_srv/SubmitSlamCommand',
} as const

export const SLAM_SWITCH_MAP_FALLBACK_SERVICE = {
  serviceName: '/clean_robot_server/slam_command_service',
  serviceType: 'my_msg_srv/OperateSlam',
} as const

export const SITE_SERVICE_NAMES = {
  map: MAP_CATALOG_SERVICE.canonicalName,
  alignment: '/database_server/site/map_alignment_service',
  alignmentByPoints: '/database_server/site/map_alignment_by_points_service',
  rectZonePreview: '/database_server/site/rect_zone_preview_service',
  zone: '/database_server/site/coverage_zone_service',
  zonePlanPath: '/database_server/site/zone_plan_path_service',
  coveragePreview: '/database_server/site/coverage_preview_service',
  coverageCommit: '/database_server/site/coverage_commit_service',
  coverageCommitApp: '/database_server/app/coverage_commit_service',
  noGoArea: '/database_server/site/no_go_area_service',
  virtualWall: '/database_server/site/virtual_wall_service',
} as const

export const SITE_SERVICE_DEPRECATED_FALLBACKS = {
  [SITE_SERVICE_NAMES.map]: MAP_CATALOG_SERVICE.deprecatedFallbackName,
  [SITE_SERVICE_NAMES.alignment]: '/database_server/map_alignment_service',
  [SITE_SERVICE_NAMES.alignmentByPoints]:
    '/database_server/map_alignment_by_points_service',
  [SITE_SERVICE_NAMES.rectZonePreview]: '/database_server/rect_zone_preview_service',
  [SITE_SERVICE_NAMES.zone]: '/database_server/coverage_zone_service',
  [SITE_SERVICE_NAMES.zonePlanPath]: '/database_server/zone_plan_path_service',
  [SITE_SERVICE_NAMES.coveragePreview]: '/database_server/coverage_preview_service',
  [SITE_SERVICE_NAMES.noGoArea]: '/database_server/no_go_area_service',
  [SITE_SERVICE_NAMES.virtualWall]: '/database_server/virtual_wall_service',
} as const
