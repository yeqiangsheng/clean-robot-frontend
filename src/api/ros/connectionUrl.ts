import { getRosbridgeProxyPath } from '../../config/appConfig'

export function getDefaultRosbridgeUrl() {
  if (typeof window === 'undefined') {
    return `ws://127.0.0.1:4173${getRosbridgeProxyPath()}`
  }

  const current = new URL(window.location.href)
  current.protocol = current.protocol === 'https:' ? 'wss:' : 'ws:'
  current.pathname = getRosbridgeProxyPath()
  current.search = ''
  current.hash = ''
  return current.toString()
}
