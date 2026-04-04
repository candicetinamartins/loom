import * as http from 'http'
import { GraphService } from '@loom/graph'

interface ServerContext {
  graph: GraphService | null
}

export async function createServer(port: number): Promise<http.Server> {
  const context: ServerContext = {
    graph: null
  }

  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://localhost:${port}`)

    // Health check endpoint
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        service: 'opencode',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }))
      return
    }

    // Graph query endpoint
    if (url.pathname === '/graph/query' && req.method === 'POST') {
      handleGraphQuery(req, res, context)
      return
    }

    // 404 for unknown paths
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(`OpenCode server running on http://localhost:${port}`)
      resolve(server)
    })

    server.on('error', reject)
  })
}

async function handleGraphQuery(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  context: ServerContext
): Promise<void> {
  let body = ''
  
  req.on('data', chunk => {
    body += chunk.toString()
  })

  req.on('end', async () => {
    try {
      const { query, parameters } = JSON.parse(body)
      
      // Placeholder - real implementation would use GraphService
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        data: [],
        executionTime: 0
      }))
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
    }
  })
}

// CLI entry point
if (require.main === module) {
  const port = parseInt(process.argv.find(arg => arg.startsWith('--port'))?.split('=')[1] || '57321', 10)
  
  createServer(port).catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}
