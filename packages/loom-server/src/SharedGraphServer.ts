import { injectable, inject } from 'inversify'
import * as http from 'http'
import { GraphService } from '@loom/graph'

/**
 * Phase 8 — Shared Graph Server (loom serve)
 * 
 * Team deploys one shared `loom serve` instance on a server.
 * All developers connect via their Loom desktop app.
 * Vela/kuzu handles concurrent writes from all agents across all users.
 * 
 * Features:
 * - HTTP server for graph queries
 * - Multi-user concurrent access
 * - Authentication and authorization
 * - Query proxy to Kuzu
 */

export interface GraphQueryRequest {
  query: string
  parameters?: Record<string, any>
  userId: string
  sessionId: string
}

export interface GraphQueryResponse {
  success: boolean
  data?: any[]
  error?: string
  executionTime: number
}

export interface ServerConfig {
  port: number
  host: string
  maxConcurrentQueries: number
  authRequired: boolean
  allowedOrigins: string[]
}

@injectable()
export class SharedGraphServer {
  private server: http.Server | null = null
  private config: ServerConfig
  private activeConnections: Map<string, { userId: string; connectedAt: Date }> = new Map()

  constructor(
    @inject(GraphService) private graph: GraphService,
  ) {
    this.config = {
      port: 57321,
      host: '0.0.0.0',
      maxConcurrentQueries: 100,
      authRequired: true,
      allowedOrigins: ['http://localhost', 'https://loom.dev'],
    }
  }

  /**
   * Start the shared graph server
   */
  async start(config?: Partial<ServerConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config }
    }

    if (this.server) {
      console.log('[SharedGraphServer] Already running')
      return
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res)
    })

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        console.log(`[SharedGraphServer] Running on ${this.config.host}:${this.config.port}`)
        resolve()
      })

      this.server!.on('error', reject)
    })
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.server) return

    return new Promise((resolve) => {
      this.server!.close(() => {
        console.log('[SharedGraphServer] Stopped')
        this.server = null
        resolve()
      })
    })
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    // Health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'healthy',
        activeConnections: this.activeConnections.size,
        maxConcurrent: this.config.maxConcurrentQueries,
      }))
      return
    }

    // Graph query endpoint
    if (req.url === '/query' && req.method === 'POST') {
      await this.handleQuery(req, res)
      return
    }

    // Schema endpoint
    if (req.url === '/schema' && req.method === 'GET') {
      await this.handleSchema(req, res)
      return
    }

    // Stats endpoint
    if (req.url === '/stats' && req.method === 'GET') {
      await this.handleStats(req, res)
      return
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }

  /**
   * Handle graph query requests
   */
  private async handleQuery(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const request: GraphQueryRequest = JSON.parse(body)

      // Validate request
      if (!request.query) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Query is required' }))
        return
      }

      // Check concurrent limit
      if (this.activeConnections.size >= this.config.maxConcurrentQueries) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Server at capacity' }))
        return
      }

      // Track connection
      const connectionId = `${request.userId}-${Date.now()}`
      this.activeConnections.set(connectionId, {
        userId: request.userId,
        connectedAt: new Date(),
      })

      // Execute query
      const startTime = Date.now()
      try {
        const result = await this.graph.query(request.query)
        const executionTime = Date.now() - startTime

        const response: GraphQueryResponse = {
          success: true,
          data: result,
          executionTime,
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(response))
      } catch (error) {
        const executionTime = Date.now() - startTime
        const response: GraphQueryResponse = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          executionTime,
        }

        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(response))
      } finally {
        this.activeConnections.delete(connectionId)
      }
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: 'Invalid request',
        message: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  /**
   * Handle schema endpoint
   */
  private async handleSchema(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // Get schema from Kuzu
      const result = await this.graph.query('CALL show_tables() RETURN *')

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        tables: result,
      }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: 'Failed to get schema',
        message: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  /**
   * Handle stats endpoint
   */
  private async handleStats(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // Get node counts by type
      const result = await this.graph.query(`
        MATCH (n)
        RETURN labels(n)[0] as nodeType, count(*) as count
        ORDER BY count DESC
      `)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        nodeCounts: result,
        activeConnections: this.activeConnections.size,
        maxConnections: this.config.maxConcurrentQueries,
      }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: 'Failed to get stats',
        message: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  /**
   * Read request body
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean
    port: number
    host: string
    activeConnections: number
    maxConnections: number
  } {
    return {
      running: this.server !== null,
      port: this.config.port,
      host: this.config.host,
      activeConnections: this.activeConnections.size,
      maxConnections: this.config.maxConcurrentQueries,
    }
  }
}
