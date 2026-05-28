export const EXECUTION_SERVICE = {
  canonicalName: '/coverage_task_manager/app/exe_task_server',
} as const

export const TASK_SERVICE = {
  canonicalName: '/database_server/app/clean_task_service',
} as const

export const SCHEDULE_SERVICE = {
  canonicalName: '/database_server/app/clean_schedule_service',
} as const

export const MAP_CATALOG_SERVICE = {
  canonicalName: '/clean_robot_server/app/map_server',
} as const

export const SLAM_SUBMIT_SERVICE = {
  canonicalName: '/clean_robot_server/app/submit_slam_command',
} as const

export const DOCK_CALIBRATION_STATUS_SERVICE = {
  canonicalName: '/clean_robot_server/app/get_dock_calibration_status',
  serviceType: 'cleanrobot_app_msgs/GetDockCalibrationStatus',
} as const

export const DOCK_CALIBRATION_COMMAND_SERVICE = {
  canonicalName: '/clean_robot_server/app/dock_calibration_command',
  serviceType: 'cleanrobot_app_msgs/OperateDockCalibration',
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
  noGoArea: '/database_server/site/no_go_area_service',
  virtualWall: '/database_server/site/virtual_wall_service',
} as const
