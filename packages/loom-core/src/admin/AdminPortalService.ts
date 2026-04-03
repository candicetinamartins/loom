import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Phase 8 — Admin Portal & System Configuration
 * 
 * Admin portal for team management with:
 * - MCP whitelist/blocklist
 * - System TOML deployment
 * - User management
 * 
 * System TOML location: `/Library/Application Support/loom/system.toml` (macOS)
 *                     `%ProgramData%/Loom/system.toml` (Windows)
 *                     `/etc/loom/system.toml` (Linux)
 */

export interface AdminConfig {
  mcp: {
    whitelist: string[] // Allowed MCP server URLs/patterns
    blacklist: string[] // Blocked MCP server URLs/patterns
    requireApproval: boolean // Require admin approval for new MCPs
  }
  powers: {
    allowedPowers: string[] // Power names that can be installed
    blockedPowers: string[] // Power names that are blocked
    allowCustomPowers: boolean // Allow custom power installations
  }
  agents: {
    allowedAgents: string[] // Which agents can be used
    maxConcurrentAgents: number // Max agents per user
    thinkingBudgetMax: number // Max thinking budget
  }
  costs: {
    dailyBudgetPerUser: number
    monthlyBudgetPerUser: number
    requireApprovalAbove: number // Require approval for expensive operations
  }
  users: {
    requireSSO: boolean
    allowedDomains: string[] // Email domains allowed
    adminEmails: string[] // Admin users
  }
}

export interface SystemTOMLConfig {
  organization: string
  admin: {
    contact: string
    enforcePolicies: boolean
  }
  mcp: {
    mode: 'whitelist' | 'blacklist' | 'open'
    whitelist: string[]
    blacklist: string[]
    requireApproval: boolean
  }
  powers: {
    mode: 'whitelist' | 'blacklist' | 'open'
    allowed: string[]
    blocked: string[]
  }
  agents: {
    maxConcurrent: number
    thinkingBudget: number
    allowed: string[]
  }
  costs: {
    dailyBudget: number
    monthlyBudget: number
  }
  sso?: {
    provider: 'saml' | 'oidc'
    entryPoint?: string // SAML
    issuer?: string // SAML
    clientId?: string // OIDC
    clientSecret?: string // OIDC
    authorizationEndpoint?: string // OIDC
    tokenEndpoint?: string // OIDC
  }
}

@injectable()
export class AdminPortalService {
  private config: AdminConfig
  private systemConfigPath: string

  constructor(
    @inject('PLATFORM') private platform: 'darwin' | 'win32' | 'linux',
  ) {
    this.config = this.getDefaultConfig()
    this.systemConfigPath = this.getSystemConfigPath()
  }

  async initialize(): Promise<void> {
    await this.loadSystemConfig()
    console.log('[AdminPortalService] Initialized')
  }

  /**
   * Get admin configuration
   */
  getConfig(): AdminConfig {
    return { ...this.config }
  }

  /**
   * Update admin configuration
   */
  async updateConfig(updates: Partial<AdminConfig>): Promise<void> {
    this.config = { ...this.config, ...updates }
    await this.persistSystemConfig()
  }

  /**
   * Check if MCP server is allowed
   */
  isMcpAllowed(serverUrl: string): boolean {
    const { mcp } = this.config

    // Check blacklist first
    if (mcp.blacklist.some(pattern => this.matchesPattern(serverUrl, pattern))) {
      return false
    }

    // If whitelist is empty, allow all (except blacklist)
    if (mcp.whitelist.length === 0) {
      return true
    }

    // Check whitelist
    return mcp.whitelist.some(pattern => this.matchesPattern(serverUrl, pattern))
  }

  /**
   * Check if power is allowed
   */
  isPowerAllowed(powerName: string): boolean {
    const { powers } = this.config

    // Check blocked
    if (powers.blockedPowers.includes(powerName)) {
      return false
    }

    // If allowed list is empty, allow all (except blocked)
    if (powers.allowedPowers.length === 0) {
      return true
    }

    return powers.allowedPowers.includes(powerName)
  }

  /**
   * Check if agent is allowed
   */
  isAgentAllowed(agentName: string): boolean {
    const { agents } = this.config

    if (agents.allowedAgents.length === 0) {
      return true
    }

    return agents.allowedAgents.includes(agentName)
  }

  /**
   * Check if user is admin
   */
  isAdmin(email: string): boolean {
    return this.config.users.adminEmails.includes(email)
  }

  /**
   * Check if email domain is allowed
   */
  isDomainAllowed(email: string): boolean {
    if (this.config.users.allowedDomains.length === 0) {
      return true
    }

    const domain = email.split('@')[1]
    return this.config.users.allowedDomains.includes(domain)
  }

  /**
   * Generate system TOML content
   */
  generateSystemTOML(): string {
    const config: SystemTOMLConfig = {
      organization: 'My Organization',
      admin: {
        contact: 'admin@example.com',
        enforcePolicies: true,
      },
      mcp: {
        mode: this.config.mcp.whitelist.length > 0 ? 'whitelist' : 'open',
        whitelist: this.config.mcp.whitelist,
        blacklist: this.config.mcp.blacklist,
        requireApproval: this.config.mcp.requireApproval,
      },
      powers: {
        mode: this.config.powers.allowedPowers.length > 0 ? 'whitelist' : 'open',
        allowed: this.config.powers.allowedPowers,
        blocked: this.config.powers.blockedPowers,
      },
      agents: {
        maxConcurrent: this.config.agents.maxConcurrentAgents,
        thinkingBudget: this.config.agents.thinkingBudgetMax,
        allowed: this.config.agents.allowedAgents,
      },
      costs: {
        dailyBudget: this.config.costs.dailyBudgetPerUser,
        monthlyBudget: this.config.costs.monthlyBudgetPerUser,
      },
    }

    return this.renderTOML(config)
  }

  /**
   * Deploy system TOML
   */
  async deploySystemTOML(): Promise<string> {
    const tomlContent = this.generateSystemTOML()
    
    // Ensure directory exists
    const configDir = path.dirname(this.systemConfigPath)
    await fs.mkdir(configDir, { recursive: true })
    
    // Write config
    await fs.writeFile(this.systemConfigPath, tomlContent, 'utf-8')
    
    console.log(`[AdminPortalService] Deployed system TOML to ${this.systemConfigPath}`)
    return this.systemConfigPath
  }

  /**
   * Get dashboard data
   */
  async getDashboard(): Promise<{
    mcpStatus: {
      mode: string
      allowed: number
      blocked: number
    }
    agentStatus: {
      allowed: number
      maxConcurrent: number
    }
    costStatus: {
      dailyBudget: number
      monthlyBudget: number
    }
    userStatus: {
      requireSSO: boolean
      allowedDomains: number
      adminCount: number
    }
  }> {
    return {
      mcpStatus: {
        mode: this.config.mcp.whitelist.length > 0 ? 'whitelist' : 'open',
        allowed: this.config.mcp.whitelist.length,
        blocked: this.config.mcp.blacklist.length,
      },
      agentStatus: {
        allowed: this.config.agents.allowedAgents.length,
        maxConcurrent: this.config.agents.maxConcurrentAgents,
      },
      costStatus: {
        dailyBudget: this.config.costs.dailyBudgetPerUser,
        monthlyBudget: this.config.costs.monthlyBudgetPerUser,
      },
      userStatus: {
        requireSSO: this.config.users.requireSSO,
        allowedDomains: this.config.users.allowedDomains.length,
        adminCount: this.config.users.adminEmails.length,
      },
    }
  }

  private getDefaultConfig(): AdminConfig {
    return {
      mcp: {
        whitelist: [],
        blacklist: [],
        requireApproval: false,
      },
      powers: {
        allowedPowers: [],
        blockedPowers: [],
        allowCustomPowers: true,
      },
      agents: {
        allowedAgents: [],
        maxConcurrentAgents: 12,
        thinkingBudgetMax: 8000,
      },
      costs: {
        dailyBudgetPerUser: 50,
        monthlyBudgetPerUser: 500,
        requireApprovalAbove: 10,
      },
      users: {
        requireSSO: false,
        allowedDomains: [],
        adminEmails: [],
      },
    }
  }

  private getSystemConfigPath(): string {
    switch (this.platform) {
      case 'darwin':
        return '/Library/Application Support/loom/system.toml'
      case 'win32':
        return path.join(process.env.ProgramData || 'C:\\ProgramData', 'Loom', 'system.toml')
      case 'linux':
        return '/etc/loom/system.toml'
      default:
        return '/etc/loom/system.toml'
    }
  }

  private async loadSystemConfig(): Promise<void> {
    try {
      const content = await fs.readFile(this.systemConfigPath, 'utf-8')
      const parsed = this.parseTOML(content)
      
      // Merge with defaults
      this.config = {
        mcp: { ...this.config.mcp, ...parsed.mcp },
        powers: { ...this.config.powers, ...parsed.powers },
        agents: { ...this.config.agents, ...parsed.agents },
        costs: { ...this.config.costs, ...parsed.costs },
        users: { ...this.config.users, ...parsed.users },
      }
    } catch {
      // Use defaults
    }
  }

  private async persistSystemConfig(): Promise<void> {
    const tomlContent = this.generateSystemTOML()
    await fs.writeFile(this.systemConfigPath, tomlContent, 'utf-8')
  }

  private matchesPattern(value: string, pattern: string): boolean {
    // Simple pattern matching - supports wildcards
    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return regex.test(value)
  }

  private renderTOML(config: SystemTOMLConfig): string {
    // Simple TOML rendering
    const lines: string[] = []
    
    lines.push(`# Loom System Configuration`)
    lines.push(`# Deployed by Admin Portal`)
    lines.push(``)
    lines.push(`organization = "${config.organization}"`)
    lines.push(``)
    lines.push(`[admin]`)
    lines.push(`contact = "${config.admin.contact}"`)
    lines.push(`enforce_policies = ${config.admin.enforcePolicies}`)
    lines.push(``)
    lines.push(`[mcp]`)
    lines.push(`mode = "${config.mcp.mode}"`)
    lines.push(`require_approval = ${config.mcp.requireApproval}`)
    lines.push(`whitelist = [${config.mcp.whitelist.map(s => `"${s}"`).join(', ')}]`)
    lines.push(`blacklist = [${config.mcp.blacklist.map(s => `"${s}"`).join(', ')}]`)
    lines.push(``)
    lines.push(`[powers]`)
    lines.push(`mode = "${config.powers.mode}"`)
    lines.push(`allowed = [${config.powers.allowed.map(s => `"${s}"`).join(', ')}]`)
    lines.push(`blocked = [${config.powers.blocked.map(s => `"${s}"`).join(', ')}]`)
    lines.push(``)
    lines.push(`[agents]`)
    lines.push(`max_concurrent = ${config.agents.maxConcurrent}`)
    lines.push(`thinking_budget = ${config.agents.thinkingBudget}`)
    lines.push(`allowed = [${config.agents.allowed.map(s => `"${s}"`).join(', ')}]`)
    lines.push(``)
    lines.push(`[costs]`)
    lines.push(`daily_budget = ${config.costs.dailyBudget}`)
    lines.push(`monthly_budget = ${config.costs.monthlyBudget}`)
    
    if (config.sso) {
      lines.push(``)
      lines.push(`[sso]`)
      lines.push(`provider = "${config.sso.provider}"`)
      if (config.sso.entryPoint) lines.push(`entry_point = "${config.sso.entryPoint}"`)
      if (config.sso.issuer) lines.push(`issuer = "${config.sso.issuer}"`)
      if (config.sso.clientId) lines.push(`client_id = "${config.sso.clientId}"`)
    }
    
    return lines.join('\n')
  }

  private parseTOML(content: string): Partial<AdminConfig> {
    // Simple TOML parsing - in production use a proper TOML parser
    const result: Partial<AdminConfig> = {}
    const lines = content.split('\n')
    let currentSection = ''
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') continue
      
      // Section headers
      const sectionMatch = trimmed.match(/^\[(\w+)\]$/)
      if (sectionMatch) {
        currentSection = sectionMatch[1]
        continue
      }
      
      // Key-value pairs
      const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/)
      if (kvMatch) {
        const [, key, value] = kvMatch
        // Parse value
        const cleanValue = value.replace(/"/g, '').replace(/'/g, '')
        
        // Build nested structure based on section
        if (currentSection === 'mcp') {
          if (!result.mcp) result.mcp = { whitelist: [], blacklist: [], requireApproval: false }
          if (key === 'whitelist') result.mcp.whitelist = this.parseArray(value)
          if (key === 'blacklist') result.mcp.blacklist = this.parseArray(value)
          if (key === 'require_approval') result.mcp.requireApproval = cleanValue === 'true'
        }
        if (currentSection === 'agents') {
          if (!result.agents) result.agents = { allowedAgents: [], maxConcurrentAgents: 12, thinkingBudgetMax: 8000 }
          if (key === 'allowed') result.agents.allowedAgents = this.parseArray(value)
          if (key === 'max_concurrent') result.agents.maxConcurrentAgents = parseInt(cleanValue)
          if (key === 'thinking_budget') result.agents.thinkingBudgetMax = parseInt(cleanValue)
        }
        if (currentSection === 'costs') {
          if (!result.costs) result.costs = { dailyBudgetPerUser: 50, monthlyBudgetPerUser: 500, requireApprovalAbove: 10 }
          if (key === 'daily_budget') result.costs.dailyBudgetPerUser = parseFloat(cleanValue)
          if (key === 'monthly_budget') result.costs.monthlyBudgetPerUser = parseFloat(cleanValue)
        }
      }
    }
    
    return result
  }

  private parseArray(value: string): string[] {
    // Parse ["item1", "item2"] format
    const match = value.match(/\[(.*)\]/)
    if (!match) return []
    
    return match[1]
      .split(',')
      .map(s => s.trim().replace(/"/g, '').replace(/'/g, ''))
      .filter(s => s.length > 0)
  }
}
