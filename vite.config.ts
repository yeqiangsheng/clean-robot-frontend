import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const buildTime = new Date().toLocaleString('zh-CN', { hour12: false })
const appVersion = process.env.npm_package_version ?? '0.0.0'

function isDependency(moduleId: string, packagePattern: RegExp) {
  return packagePattern.test(moduleId.replaceAll('\\', '/'))
}

function isAntdEcosystemDependency(moduleId: string) {
  const normalizedId = moduleId.replaceAll('\\', '/')

  return (
    /node_modules\/antd\//.test(normalizedId) ||
    /node_modules\/@ant-design\//.test(normalizedId) ||
    /node_modules\/rc-[^/]+\//.test(normalizedId) ||
    /node_modules\/rc-util\//.test(normalizedId) ||
    /node_modules\/@rc-component\//.test(normalizedId) ||
    /node_modules\/classnames\//.test(normalizedId) ||
    /node_modules\/dayjs\//.test(normalizedId)
  )
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gatewayTarget = env.VITE_SITE_GATEWAY_TARGET || 'http://127.0.0.1:4180'

  return {
    plugins: [react()],
    define: {
      __APP_BUILD_TIME__: JSON.stringify(buildTime),
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: gatewayTarget,
          changeOrigin: false,
        },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
    build: {
      chunkSizeWarningLimit: 750,
      rolldownOptions: {
        output: {
          codeSplitting: {
            includeDependenciesRecursively: false,
            groups: [
              {
                name: 'vendor-react',
                test: (moduleId) =>
                  isDependency(moduleId, /node_modules\/(react|react-dom|scheduler)\//),
                priority: 30,
              },
              {
                name: 'vendor-antd',
                test: isAntdEcosystemDependency,
                priority: 25,
              },
              {
                name: 'vendor-canvas',
                test: (moduleId) =>
                  isDependency(moduleId, /node_modules\/(konva|react-konva)\//),
                priority: 15,
              },
              {
                name: 'vendor-query',
                test: (moduleId) =>
                  isDependency(moduleId, /node_modules\/@tanstack\/react-query\//),
                priority: 15,
              },
              {
                name: 'vendor',
                test: (moduleId) => isDependency(moduleId, /node_modules\//),
                priority: 1,
                maxSize: 240 * 1024,
              },
            ],
          },
        },
      },
    },
  }
})
