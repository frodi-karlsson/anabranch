#!/usr/bin/env node
/**
 * A simple static file server to serve the notebook example in this directory.
 *
 * Usage:
 *   deno run -A packages/storage-browser/examples/notebook/serve.js
 *
 * Then open http://localhost:3000 in your browser to view the notebook example.
 * Yep, it's pretty much ye olde todo-list example
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 3000
const STATIC_DIR = path.join(__dirname)

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

const server = http.createServer((req, res) => {
  const filePath = path.join(
    STATIC_DIR,
    req.url === '/' ? 'index.html' : req.url,
  )

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404)
        res.end('Not Found')
      } else {
        res.writeHead(500)
        res.end('Server Error')
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content)
    }
  })
})

server.listen(PORT, () => {
  console.log(`Serving http://localhost:${PORT}`)
})
