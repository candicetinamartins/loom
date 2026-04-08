import { injectable, inject } from 'inversify'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export interface MCPServerConfig {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface MCPConnection {
  name: string
  client: Client
  transport: StdioClientTransport
  connected: boolean
  tools: any[]
}

/**
 * MCPClientPool — Model Context Protocol client pool
 * 
 * Features:
 * - Connect to multiple MCP servers
 * - Tool discovery and execution
 * - Connection pooling with health checks
 */
@injectable()
export class MCPClientPool {
  private connections: Map<string, MCPConnection> = new Map()
  private configs: Map<string, MCPServerConfig> = new Map()

  constructor(
    @inject('MCP_SERVER_CONFIGS') private serverConfigs: MCPServerConfig[] = []
  ) {}

  async initialize(): Promise<void> {
    for (const config of this.serverConfigs) {
      this.configs.set(config.name, config)
    }
    console.log(`[MCPClientPool] Configured ${this.serverConfigs.length} MCP servers`)
  }

  /**
   * Connect to an MCP server
   */
  async connect(serverName: string): Promise<MCPConnection | null> {
    const config = this.configs.get(serverName)
    if (!config) {
      console.warn(`[MCPClientPool] No config for server: ${serverName}`)
      return null
    }

    // Check existing connection
    const existing = this.connections.get(serverName)
    if (existing?.connected) {
      return existing
    }

    try {
      // Create transport
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env } as Record<string, string>,
      })

      // Create client
      const client = new Client(
        { name: 'loom-mcp-client', version: '1.0.0' },
        { capabilities: {} }
      )

      // Connect
      await client.connect(transport)

      // List available tools
      const toolsResult = await client.listTools()
      const tools = toolsResult.tools || []

      const connection: MCPConnection = {
        name: serverName,
        client,
        transport,
        connected: true,
        tools,
      }

      this.connections.set(serverName, connection)
      console.log(`[MCPClientPool] Connected to ${serverName} with ${tools.length} tools`)

      return connection
    } catch (error) {
      console.error(`[MCPClientPool] Failed to connect to ${serverName}:`, error)
      return null
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnect(serverName: string): Promise<void> {
    const conn = this.connections.get(serverName)
    if (!conn) return

    try {
      await conn.client.close()
      conn.connected = false
      this.connections.delete(serverName)
      console.log(`[MCPClientPool] Disconnected from ${serverName}`)
    } catch (error) {
      console.warn(`[MCPClientPool] Error disconnecting from ${serverName}:`, error)
    }
  }
  

  /**
   * Execute a tool on an MCP server
   */
  async executeTool(
    serverName: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<any> {
    const conn = await this.connect(serverName)
    if (!conn) {
      throw new Error(`Not connected to MCP server: ${serverName}`)
    }

    const tool = conn.tools.find(t => t.name === toolName)
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on ${serverName}`)
    }

    try {
      const result = await conn.client.callTool({
        name: toolName,
        arguments: args,
      })
      return result
    } catch (error) {
      console.error(`[MCPClientPool] Tool execution failed: ${toolName}`, error)
      throw error
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  async getAllTools(): Promise<Array<{ server: string; tool: any }>> {
    const allTools: Array<{ server: string; tool: any }> = []

    for (const [name, conn] of this.connections) {
      if (conn.connected) {
        for (const tool of conn.tools) {
          allTools.push({ server: name, tool })
        }
      }
    }

    return allTools
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverName: string): any[] {
    const conn = this.connections.get(serverName)
    return conn?.connected ? conn.tools : []
  }

  /**
   * Check if connected to a server
   */
  isConnected(serverName: string): boolean {
    return this.connections.get(serverName)?.connected || false
  }

  /**
   * Get connection status for all servers
   */
  getConnectionStatus(): Array<{ name: string; connected: boolean; toolCount: number }> {
    return Array.from(this.configs.keys()).map(name => {
      const conn = this.connections.get(name)
      return {
        name,
        connected: conn?.connected || false,
        toolCount: conn?.tools.length || 0,
      }
    })
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    for (const name of this.connections.keys()) {
      await this.disconnect(name)
    }
  }
}
