import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TOMLParser } from '@loom/core'

/**
 * Phase 5 — Powers & External Knowledge
 * 
 * Powers are optional external capabilities that agents can invoke.
 * They follow the MCP (Model Context Protocol) standard but are integrated
 * into Loom's tool system.
 * 
 * DeepWiki and Context7 are implemented as optional Powers — not load-bearing.
 * Agents always check the local graph first, then optionally use Powers for
 * additional depth.
 */

export type PowerType = 'mcp' | 'http' | 'cli' | 'local'
export type PowerStatus = 'available' | 'unavailable' | 'error' | 'disabled'

export interface PowerTool {
  name: string
  description: string
  parameters: Record<string, any>
}

export interface PowerManifest {
  name: string
  version: string
  description: string
  type: PowerType
  status: PowerStatus
  
  // Activation keywords — when these appear in agent tasks, this Power is offered
  keywords: string[]
  
  // MCP server configuration (for type: 'mcp')
  mcp?: {
    serverUrl: string
    tools: PowerTool[]
    apiKeyRequired?: boolean
  }
  
  // HTTP API configuration (for type: 'http')
  http?: {
    baseUrl: string
    headers?: Record<string, string>
    endpoints: Array<{
      name: string
      path: string
      method: string
    }>
  }
  
  // CLI configuration (for type: 'cli')
  cli?: {
    command: string
    args: string[]
  }
  
  // Local service configuration (for type: 'local')
  local?: {
    serviceName: string
  }
  
  // Agent steering text — appended to system prompt when Power is active
  steering?: string
}

export interface PowerSearchResult {
  power: PowerManifest
  relevance: number
  matchedKeywords: string[]
}

@injectable()
export class MarketplaceService {
  private powers: Map<string, PowerManifest> = new Map()
  private parser = new TOMLParser()
  private activePowers: Set<string> = new Set()

  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string,
  ) {}

  async initialize(): Promise<void> {
    await this.loadLocalPowers()
    await this.loadIndexedPowers()
    console.log(`[MarketplaceService] Loaded ${this.powers.size} powers`)
  }

  /**
   * Load powers from .loom/powers/*.toml
   */
  private async loadLocalPowers(): Promise<void> {
    const powersDir = path.join(this.workspaceRoot, '.loom', 'powers')
    
    try {
      const entries = await fs.readdir(powersDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.toml')) {
          try {
            const power = await this.loadPower(path.join(powersDir, entry.name))
            this.powers.set(power.name, power)
          } catch (error) {
            console.warn(`[MarketplaceService] Failed to load power ${entry.name}:`, error)
          }
        }
      }
    } catch {
      // Powers directory doesn't exist yet
    }
  }

  /**
   * Load powers from the marketplace index
   */
  private async loadIndexedPowers(): Promise<void> {
    // In a real implementation, this would fetch from a Git-hosted index
    // For now, we bundle popular powers
    const bundledPowers = [
      this.createDeepWikiPower(),
      this.createContext7Power(),
    ]
    
    for (const power of bundledPowers) {
      if (!this.powers.has(power.name)) {
        this.powers.set(power.name, power)
      }
    }
  }

  /**
   * Parse a single power TOML file
   */
  private async loadPower(filePath: string): Promise<PowerManifest> {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = this.parser.parseSync(content)

    return {
      name: parsed.name || path.basename(filePath, '.toml'),
      version: parsed.version || '1.0.0',
      description: parsed.description || '',
      type: parsed.type || 'mcp',
      status: parsed.status || 'available',
      keywords: parsed.keywords || [],
      mcp: parsed.mcp,
      http: parsed.http,
      cli: parsed.cli,
      local: parsed.local,
      steering: parsed.steering,
    }
  }

  /**
   * Find relevant powers for a given task description
   * Returns powers ranked by keyword match relevance
   */
  findRelevantPowers(taskDescription: string): PowerSearchResult[] {
    const results: PowerSearchResult[] = []
    const taskLower = taskDescription.toLowerCase()
    
    for (const power of this.powers.values()) {
      if (power.status !== 'available') continue
      
      const matchedKeywords: string[] = []
      let relevance = 0
      
      for (const keyword of power.keywords) {
        const keywordLower = keyword.toLowerCase()
        if (taskLower.includes(keywordLower)) {
          matchedKeywords.push(keyword)
          // Higher relevance for exact matches, lower for partial
          relevance += taskLower.split(keywordLower).length - 1
        }
      }
      
      if (matchedKeywords.length > 0) {
        results.push({
          power,
          relevance,
          matchedKeywords,
        })
      }
    }
    
    // Sort by relevance (highest first)
    return results.sort((a, b) => b.relevance - a.relevance)
  }

  /**
   * Activate a power for the current session
   */
  async activatePower(name: string): Promise<boolean> {
    const power = this.powers.get(name)
    if (!power) {
      console.warn(`[MarketplaceService] Power not found: ${name}`)
      return false
    }
    
    if (power.status !== 'available') {
      console.warn(`[MarketplaceService] Power not available: ${name} (${power.status})`)
      return false
    }
    
    // Check if API key is required
    if (power.mcp?.apiKeyRequired) {
      const hasKey = await this.checkApiKey(name)
      if (!hasKey) {
        console.warn(`[MarketplaceService] API key required for ${name}`)
        return false
      }
    }
    
    this.activePowers.add(name)
    console.log(`[MarketplaceService] Activated power: ${name}`)
    return true
  }

  /**
   * Deactivate a power
   */
  deactivatePower(name: string): void {
    this.activePowers.delete(name)
    console.log(`[MarketplaceService] Deactivated power: ${name}`)
  }

  /**
   * Get all active powers
   */
  getActivePowers(): PowerManifest[] {
    return Array.from(this.activePowers)
      .map(name => this.powers.get(name))
      .filter((p): p is PowerManifest => p !== undefined)
  }

  /**
   * Get steering text for all active powers
   * This is appended to agent system prompts
   */
  getActivePowerSteering(): string {
    const active = this.getActivePowers()
    if (active.length === 0) return ''
    
    const steeringParts = active
      .map(p => p.steering)
      .filter((s): s is string => !!s)
    
    if (steeringParts.length === 0) return ''
    
    return `\n\n[ACTIVE POWERS]\n${steeringParts.join('\n\n')}`
  }

  /**
   * Execute a power tool
   */
  async executeTool(
    powerName: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    const power = this.powers.get(powerName)
    if (!power) {
      throw new Error(`Power not found: ${powerName}`)
    }
    
    if (!this.activePowers.has(powerName)) {
      throw new Error(`Power not active: ${powerName}`)
    }
    
    switch (power.type) {
      case 'mcp':
        return this.executeMcpTool(power, toolName, args)
      case 'http':
        return this.executeHttpTool(power, toolName, args)
      case 'cli':
        return this.executeCliTool(power, toolName, args)
      default:
        throw new Error(`Unsupported power type: ${power.type}`)
    }
  }

  /**
   * Execute MCP tool
   */
  private async executeMcpTool(
    power: PowerManifest,
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    if (!power.mcp) {
      throw new Error(`MCP configuration missing for power: ${power.name}`)
    }
    
    const tool = power.mcp.tools.find(t => t.name === toolName)
    if (!tool) {
      throw new Error(`Tool not found: ${toolName} in power ${power.name}`)
    }
    
    // Call MCP server
    const response = await fetch(`${power.mcp.serverUrl}/tools/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(power.mcp.apiKeyRequired && {
          'Authorization': `Bearer ${await this.getApiKey(power.name)}`,
        }),
      },
      body: JSON.stringify(args),
    })
    
    if (!response.ok) {
      throw new Error(`MCP tool execution failed: ${response.status}`)
    }
    
    return response.json()
  }

  /**
   * Execute HTTP API tool
   */
  private async executeHttpTool(
    power: PowerManifest,
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    if (!power.http) {
      throw new Error(`HTTP configuration missing for power: ${power.name}`)
    }
    
    const endpoint = power.http.endpoints.find(e => e.name === toolName)
    if (!endpoint) {
      throw new Error(`Endpoint not found: ${toolName} in power ${power.name}`)
    }
    
    const url = `${power.http.baseUrl}${endpoint.path}`
    
    const response = await fetch(url, {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        ...power.http.headers,
      },
      ...(endpoint.method !== 'GET' && { body: JSON.stringify(args) }),
    })
    
    if (!response.ok) {
      throw new Error(`HTTP tool execution failed: ${response.status}`)
    }
    
    return response.json()
  }

  /**
   * Execute CLI tool
   */
  private async executeCliTool(
    power: PowerManifest,
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    if (!power.cli) {
      throw new Error(`CLI configuration missing for power: ${power.name}`)
    }
    
    const { spawn } = require('child_process')
    const { promisify } = require('util')
    
    const interpolatedArgs = power.cli.args.map(arg =>
      arg.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => args[key] || '')
    )
    
    return new Promise((resolve, reject) => {
      const proc = spawn(power.cli!.command, [...interpolatedArgs, toolName], {
        cwd: this.workspaceRoot,
      })
      
      let output = ''
      proc.stdout.on('data', (data: Buffer) => output += data.toString())
      proc.stderr.on('data', (data: Buffer) => output += data.toString())
      
      proc.on('close', (code: number) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(output))
          } catch {
            resolve({ output })
          }
        } else {
          reject(new Error(`CLI tool failed with code ${code}: ${output}`))
        }
      })
    })
  }

  /**
   * Install a power from the marketplace
   */
  async installPower(name: string, source?: string): Promise<boolean> {
    const powersDir = path.join(this.workspaceRoot, '.loom', 'powers')
    await fs.mkdir(powersDir, { recursive: true })
    
    if (source) {
      // Install from custom source (Git URL, local path, etc.)
      if (source.startsWith('http')) {
        // Fetch from URL
        const response = await fetch(`${source}/${name}.toml`)
        if (!response.ok) {
          throw new Error(`Failed to fetch power: ${response.status}`)
        }
        const content = await response.text()
        await fs.writeFile(path.join(powersDir, `${name}.toml`), content, 'utf-8')
      } else {
        // Copy from local path
        const content = await fs.readFile(path.join(source, `${name}.toml`), 'utf-8')
        await fs.writeFile(path.join(powersDir, `${name}.toml`), content, 'utf-8')
      }
    } else {
      // Install from bundled powers
      const bundled = this.createBundledPower(name)
      if (!bundled) {
        throw new Error(`Unknown bundled power: ${name}`)
      }
      
      const toml = this.powerToTOML(bundled)
      await fs.writeFile(path.join(powersDir, `${name}.toml`), toml, 'utf-8')
    }
    
    // Reload powers
    await this.loadLocalPowers()
    console.log(`[MarketplaceService] Installed power: ${name}`)
    return true
  }

  /**
   * Uninstall a power
   */
  async uninstallPower(name: string): Promise<void> {
    const powersDir = path.join(this.workspaceRoot, '.loom', 'powers')
    const filePath = path.join(powersDir, `${name}.toml`)
    
    try {
      await fs.unlink(filePath)
      this.powers.delete(name)
      this.activePowers.delete(name)
      console.log(`[MarketplaceService] Uninstalled power: ${name}`)
    } catch {
      // File didn't exist
    }
  }

  /**
   * Check if API key is configured for a power
   */
  private async checkApiKey(powerName: string): Promise<boolean> {
    // In real implementation, check secure storage
    const key = process.env[`${powerName.toUpperCase()}_API_KEY`]
    return !!key
  }

  /**
   * Get API key for a power
   */
  private async getApiKey(powerName: string): Promise<string> {
    // In real implementation, fetch from secure storage
    return process.env[`${powerName.toUpperCase()}_API_KEY`] || ''
  }

  /**
   * Create bundled DeepWiki power
   */
  private createDeepWikiPower(): PowerManifest {
    return {
      name: 'deepwiki',
      version: '1.0.0',
      description: 'AI-generated wiki for architectural depth',
      type: 'mcp',
      status: 'available',
      keywords: ['architecture', 'design', 'patterns', 'wiki', 'documentation', 'overview'],
      mcp: {
        serverUrl: 'https://mcp.deepwiki.com',
        apiKeyRequired: false,
        tools: [
          {
            name: 'ask_question',
            description: 'Ask a question about a topic',
            parameters: {
              topic: { type: 'string', description: 'Topic to ask about' },
              question: { type: 'string', description: 'Question to ask' },
            },
          },
          {
            name: 'read_wiki_contents',
            description: 'Read wiki contents for a topic',
            parameters: {
              topic: { type: 'string', description: 'Topic to read about' },
              depth: { type: 'number', description: 'Reading depth (1-3)' },
            },
          },
        ],
      },
      steering: `DeepWiki Power: You can use the deepwiki power for architectural depth.
When the graph has no docs for a package, consider using DeepWiki for:
- Architecture patterns and design decisions
- High-level system overview
- Technology stack explanations

Always check the local graph first — DeepWiki is supplementary.`,
    }
  }

  /**
   * Create bundled Context7 power
   */
  private createContext7Power(): PowerManifest {
    return {
      name: 'context7',
      version: '1.0.0',
      description: 'Structured documentation for libraries and frameworks',
      type: 'mcp',
      status: 'available',
      keywords: ['library', 'framework', 'api', 'reference', 'docs', 'sdk'],
      mcp: {
        serverUrl: 'https://mcp.context7.com',
        apiKeyRequired: true,
        tools: [
          {
            name: 'resolve_library',
            description: 'Get documentation for a library',
            parameters: {
              name: { type: 'string', description: 'Library name' },
              version: { type: 'string', description: 'Version (optional)' },
            },
          },
          {
            name: 'search_api',
            description: 'Search API documentation',
            parameters: {
              query: { type: 'string', description: 'Search query' },
              library: { type: 'string', description: 'Library to search' },
            },
          },
        ],
      },
      steering: `Context7 Power: You can use the context7 power for library/framework documentation.
Use Context7 when you need:
- API reference details
- Library usage examples
- Framework-specific patterns

Note: Context7 requires an API key. If unavailable, use LoomDocs (local graph) instead.`,
    }
  }

  /**
   * Create bundled power by name
   */
  private createBundledPower(name: string): PowerManifest | null {
    switch (name) {
      case 'deepwiki':
        return this.createDeepWikiPower()
      case 'context7':
        return this.createContext7Power()
      default:
        return null
    }
  }

  /**
   * Convert power manifest to TOML string
   */
  private powerToTOML(power: PowerManifest): string {
    let toml = `# ${power.name} Power Manifest\n`
    toml += `name = "${power.name}"\n`
    toml += `version = "${power.version}"\n`
    toml += `description = "${power.description}"\n`
    toml += `type = "${power.type}"\n`
    toml += `status = "${power.status}"\n\n`
    
    toml += `keywords = [\n`
    toml += power.keywords.map(k => `  "${k}"`).join(',\n')
    toml += `\n]\n\n`
    
    if (power.mcp) {
      toml += `[mcp]\n`
      toml += `server_url = "${power.mcp.serverUrl}"\n`
      toml += `api_key_required = ${power.mcp.apiKeyRequired}\n\n`
      
      for (const tool of power.mcp.tools) {
        toml += `[[mcp.tools]]\n`
        toml += `name = "${tool.name}"\n`
        toml += `description = "${tool.description}"\n\n`
      }
    }
    
    if (power.steering) {
      toml += `steering = """\n${power.steering}\n"""\n`
    }
    
    return toml
  }

  /**
   * Get all available powers
   */
  getAllPowers(): PowerManifest[] {
    return Array.from(this.powers.values())
  }

  /**
   * Get a specific power
   */
  getPower(name: string): PowerManifest | undefined {
    return this.powers.get(name)
  }
}
