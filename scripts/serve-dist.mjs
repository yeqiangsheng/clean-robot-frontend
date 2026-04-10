import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function parseArgs(argv) {
  const args = { host: '127.0.0.1', port: 4173 }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]

    if (token === '--host' && next) {
      args.host = next
      index += 1
      continue
    }

    if (token === '--port' && next) {
      const parsed = Number(next)
      if (Number.isFinite(parsed) && parsed > 0) {
        args.port = Math.floor(parsed)
      }
      index += 1
    }
  }

  return args
}

function resolveRequestPath(distDir, pathname) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname
  const candidate = resolve(distDir, `.${normalizedPath}`)

  if (!candidate.startsWith(distDir)) {
    return null
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate
  }

  if (!extname(normalizedPath)) {
    return resolve(distDir, 'index.html')
  }

  return null
}

function sendFile(filePath, response) {
  const extension = extname(filePath)
  const isHtml = extension === '.html'

  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    'Cache-Control': isHtml ? 'no-store' : 'public, max-age=31536000, immutable',
  })

  createReadStream(filePath).pipe(response)
}

const { host, port } = parseArgs(process.argv.slice(2))
const distDir = resolve(process.cwd(), 'dist')

if (!existsSync(distDir)) {
  console.error(`Missing dist directory: ${distDir}`)
  process.exit(1)
}

const server = createServer((request, response) => {
  const origin = `http://${request.headers.host ?? `${host}:${port}`}`
  const url = new URL(request.url ?? '/', origin)
  const targetPath = resolveRequestPath(distDir, url.pathname)

  if (!targetPath) {
    response.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    response.end('Not Found')
    return
  }

  sendFile(targetPath, response)
})

server.listen(port, host, () => {
  console.log(`Serving dist from ${distDir}`)
  console.log(`Listening on http://${host}:${port}`)
})
