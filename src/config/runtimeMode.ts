// Mock mode is only for local development and smoke tests. Production builds
// must always use the authenticated Site Gateway path.
export const USE_MOCK_DATA =
  import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === 'true'
