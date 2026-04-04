import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { LoomMsgHub, Channel } from '../orchestration/LoomMsgHub'

/**
 * Phase 8 — Agent Analytics & Cost Controls
 * 
 * Per-agent analytics, cost controls, team dashboards.
 * Tracks usage per agent, enforces budget limits.
 * 
 * Features:
 * - Per-agent cost tracking
 * - Budget limits and alerts
 * - Usage analytics and reporting
 * - Team dashboard data
 */

export interface AgentUsageRecord {
  agentName: string
  sessionId: string
  timestamp: Date
  cost: number
  tokensIn: number
  tokensOut: number
  duration: number
  tasksCompleted: number
  tasksFailed: number
}

export interface AgentAnalytics {
  agentName: string
  totalCost: number
  totalTokens: number
  sessionCount: number
  avgCostPerSession: number
  avgDuration: number
  successRate: number
  lastUsed: Date
  trend: 'up' | 'down' | 'stable'
}

export interface BudgetConfig {
  dailyLimit: number
  monthlyLimit: number
  perAgentLimits: Record<string, number>
  alertsEnabled: boolean
  alertThreshold: number // percentage (0-100)
}

export interface BudgetStatus {
  dailyUsed: number
  dailyRemaining: number
  monthlyUsed: number
  monthlyRemaining: number
  perAgentUsage: Record<string, number>
  alertTriggered: boolean
}

@injectable()
export class AgentAnalyticsService {
  private analyticsDir: string
  private usageLog: AgentUsageRecord[] = []
  private budgetConfig: BudgetConfig

  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string,
    @inject(LoomMsgHub) private hub: LoomMsgHub,
  ) {
    this.analyticsDir = path.join(workspaceRoot, '.loom', 'analytics')
    this.budgetConfig = {
      dailyLimit: 50, // $50/day default
      monthlyLimit: 500, // $500/month default
      perAgentLimits: {},
      alertsEnabled: true,
      alertThreshold: 80,
    }
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.analyticsDir, { recursive: true })
    await this.loadBudgetConfig()
    await this.loadUsageHistory()
    console.log('[AgentAnalyticsService] Initialized')
  }

  /**
   * Record agent usage
   */
  async recordUsage(record: Omit<AgentUsageRecord, 'timestamp'>): Promise<void> {
    const fullRecord: AgentUsageRecord = {
      ...record,
      timestamp: new Date(),
    }

    this.usageLog.push(fullRecord)

    // Persist
    await this.persistUsageLog()

    // Check budget
    await this.checkBudgetAlerts(fullRecord)

    // Publish event
    await this.hub.publish(
      LoomMsgHub.msg(Channel.AGENT_USAGE_RECORDED, {
        agentName: record.agentName,
        cost: record.cost,
        sessionId: record.sessionId,
      })
    )
  }

  /**
   * Get analytics for an agent
   */
  async getAgentAnalytics(agentName: string): Promise<AgentAnalytics | null> {
    const agentRecords = this.usageLog.filter(r => r.agentName === agentName)
    
    if (agentRecords.length === 0) {
      return null
    }

    const totalCost = agentRecords.reduce((sum, r) => sum + r.cost, 0)
    const totalTokens = agentRecords.reduce((sum, r) => sum + r.tokensIn + r.tokensOut, 0)
    const totalDuration = agentRecords.reduce((sum, r) => sum + r.duration, 0)
    const totalTasks = agentRecords.reduce((sum, r) => sum + r.tasksCompleted + r.tasksFailed, 0)
    const successfulTasks = agentRecords.reduce((sum, r) => sum + r.tasksCompleted, 0)

    // Calculate trend (compare last 7 days vs previous 7 days)
    const now = Date.now()
    const last7Days = agentRecords.filter(r => now - r.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000)
    const previous7Days = agentRecords.filter(r => {
      const age = now - r.timestamp.getTime()
      return age >= 7 * 24 * 60 * 60 * 1000 && age < 14 * 24 * 60 * 60 * 1000
    })

    const last7DaysCost = last7Days.reduce((sum, r) => sum + r.cost, 0)
    const previous7DaysCost = previous7Days.reduce((sum, r) => sum + r.cost, 0)

    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (previous7DaysCost > 0) {
      const change = (last7DaysCost - previous7DaysCost) / previous7DaysCost
      if (change > 0.1) trend = 'up'
      else if (change < -0.1) trend = 'down'
    }

    return {
      agentName,
      totalCost,
      totalTokens,
      sessionCount: agentRecords.length,
      avgCostPerSession: totalCost / agentRecords.length,
      avgDuration: totalDuration / agentRecords.length,
      successRate: totalTasks > 0 ? successfulTasks / totalTasks : 1,
      lastUsed: agentRecords[agentRecords.length - 1].timestamp,
      trend,
    }
  }

  /**
   * Get all agents analytics
   */
  async getAllAnalytics(): Promise<AgentAnalytics[]> {
    const agentNames = [...new Set(this.usageLog.map(r => r.agentName))]
    const analytics = await Promise.all(
      agentNames.map(name => this.getAgentAnalytics(name))
    )
    return analytics.filter((a): a is AgentAnalytics => a !== null)
  }

  /**
   * Get team dashboard data
   */
  async getTeamDashboard(): Promise<{
    totalCost: number
    totalSessions: number
    activeAgents: number
    topAgents: AgentAnalytics[]
    dailyUsage: { date: string; cost: number }[]
  }> {
    const allAnalytics = await this.getAllAnalytics()
    const totalCost = allAnalytics.reduce((sum, a) => sum + a.totalCost, 0)
    const totalSessions = allAnalytics.reduce((sum, a) => sum + a.sessionCount, 0)
    const activeAgents = allAnalytics.filter(a => a.sessionCount > 0).length

    // Top 5 agents by cost
    const topAgents = allAnalytics
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5)

    // Daily usage for last 30 days
    const dailyUsage: { date: string; cost: number }[] = []
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      
      const dayRecords = this.usageLog.filter(r => 
        r.timestamp.toISOString().startsWith(dateStr)
      )
      const dayCost = dayRecords.reduce((sum, r) => sum + r.cost, 0)
      
      dailyUsage.push({ date: dateStr, cost: dayCost })
    }

    return {
      totalCost,
      totalSessions,
      activeAgents,
      topAgents,
      dailyUsage,
    }
  }

  /**
   * Set budget configuration
   */
  async setBudgetConfig(config: Partial<BudgetConfig>): Promise<void> {
    this.budgetConfig = { ...this.budgetConfig, ...config }
    await this.persistBudgetConfig()
  }

  /**
   * Get budget status
   */
  async getBudgetStatus(): Promise<BudgetStatus> {
    const today = new Date().toISOString().split('T')[0]
    const thisMonth = new Date().toISOString().slice(0, 7)

    const todayRecords = this.usageLog.filter(r =>
      r.timestamp.toISOString().startsWith(today)
    )
    const monthRecords = this.usageLog.filter(r =>
      r.timestamp.toISOString().startsWith(thisMonth)
    )

    const dailyUsed = todayRecords.reduce((sum, r) => sum + r.cost, 0)
    const monthlyUsed = monthRecords.reduce((sum, r) => sum + r.cost, 0)

    // Per-agent usage
    const perAgentUsage: Record<string, number> = {}
    for (const record of todayRecords) {
      perAgentUsage[record.agentName] = (perAgentUsage[record.agentName] || 0) + record.cost
    }

    // Check alert threshold
    const dailyPercent = (dailyUsed / this.budgetConfig.dailyLimit) * 100
    const monthlyPercent = (monthlyUsed / this.budgetConfig.monthlyLimit) * 100
    const alertTriggered = this.budgetConfig.alertsEnabled &&
      (dailyPercent >= this.budgetConfig.alertThreshold ||
       monthlyPercent >= this.budgetConfig.alertThreshold)

    return {
      dailyUsed,
      dailyRemaining: this.budgetConfig.dailyLimit - dailyUsed,
      monthlyUsed,
      monthlyRemaining: this.budgetConfig.monthlyLimit - monthlyUsed,
      perAgentUsage,
      alertTriggered,
    }
  }

  /**
   * Check if agent can proceed with a task (cost control)
   */
  async canProceed(agentName: string, estimatedCost: number): Promise<{
    allowed: boolean
    reason?: string
  }> {
    const budgetStatus = await this.getBudgetStatus()

    // Check daily limit
    if (budgetStatus.dailyUsed + estimatedCost > this.budgetConfig.dailyLimit) {
      return { allowed: false, reason: 'Daily budget limit would be exceeded' }
    }

    // Check monthly limit
    if (budgetStatus.monthlyUsed + estimatedCost > this.budgetConfig.monthlyLimit) {
      return { allowed: false, reason: 'Monthly budget limit would be exceeded' }
    }

    // Check per-agent limit
    const agentLimit = this.budgetConfig.perAgentLimits[agentName]
    if (agentLimit) {
      const agentTodayCost = budgetStatus.perAgentUsage[agentName] || 0
      if (agentTodayCost + estimatedCost > agentLimit) {
        return { allowed: false, reason: `Daily limit for ${agentName} would be exceeded` }
      }
    }

    return { allowed: true }
  }

  private async checkBudgetAlerts(record: AgentUsageRecord): Promise<void> {
    if (!this.budgetConfig.alertsEnabled) return

    const status = await this.getBudgetStatus()
    
    if (status.alertTriggered) {
      await this.hub.publish(
        LoomMsgHub.msg(Channel.BUDGET_ALERT, {
          dailyUsed: status.dailyUsed,
          dailyLimit: this.budgetConfig.dailyLimit,
          monthlyUsed: status.monthlyUsed,
          monthlyLimit: this.budgetConfig.monthlyLimit,
        })
      )
    }
  }

  private async loadBudgetConfig(): Promise<void> {
    try {
      const configPath = path.join(this.analyticsDir, 'budget.json')
      const content = await fs.readFile(configPath, 'utf-8')
      const loaded = JSON.parse(content)
      this.budgetConfig = { ...this.budgetConfig, ...loaded }
    } catch {
      // Use defaults
    }
  }

  private async persistBudgetConfig(): Promise<void> {
    const configPath = path.join(this.analyticsDir, 'budget.json')
    await fs.writeFile(configPath, JSON.stringify(this.budgetConfig, null, 2), 'utf-8')
  }

  private async loadUsageHistory(): Promise<void> {
    try {
      const logPath = path.join(this.analyticsDir, 'usage.json')
      const content = await fs.readFile(logPath, 'utf-8')
      const loaded = JSON.parse(content)
      this.usageLog = loaded.map((r: any) => ({
        ...r,
        timestamp: new Date(r.timestamp),
      }))
    } catch {
      this.usageLog = []
    }
  }

  private async persistUsageLog(): Promise<void> {
    const logPath = path.join(this.analyticsDir, 'usage.json')
    // Keep only last 90 days in active memory
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    this.usageLog = this.usageLog.filter(r => r.timestamp > cutoff)
    await fs.writeFile(logPath, JSON.stringify(this.usageLog, null, 2), 'utf-8')
  }
}

// Extend ChannelMap for analytics events
declare global {
  interface ChannelMap {
    AGENT_USAGE_RECORDED: { agentName: string; cost: number; sessionId: string }
    BUDGET_ALERT: { dailyUsed: number; dailyLimit: number; monthlyUsed: number; monthlyLimit: number }
  }
}
