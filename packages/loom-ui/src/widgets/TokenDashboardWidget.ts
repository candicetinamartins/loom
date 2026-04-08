import { injectable } from 'inversify'
import { LoomBaseWidget } from './LoomBaseWidget'
import type { AgentMetrics, TurnMetrics } from '@loom/core'

export interface TokenDashboardOptions {
  id?: string
  title?: string
}

/**
 * TokenDashboardWidget - Real-time token usage metrics visualization
 * 
 * Displays:
 * - Per-agent token usage (input/output/total)
 * - Turn-by-turn breakdown
 * - Protocol compliance rate
 * - Violation tracking
 * - Cost estimation
 */
@injectable()
export class TokenDashboardWidget extends LoomBaseWidget {
  private metrics: AgentMetrics[] = []
  private contentDiv: HTMLDivElement
  private updateInterval: number | null = null

  constructor(options: TokenDashboardOptions = {}) {
    super({
      id: options.id || 'loom-token-dashboard',
      title: options.title || 'Token Metrics',
      cssClass: 'loom-token-dashboard',
    })

    this.contentDiv = document.createElement('div')
    this.contentDiv.className = 'token-dashboard-content'
    this.node.appendChild(this.contentDiv)

    this.addStyles()
  }

  /**
   * Update displayed metrics
   */
  setMetrics(metrics: AgentMetrics[]): void {
    this.metrics = metrics
    this.updateContent()
  }

  /**
   * Add or update a single agent's metrics
   */
  updateAgentMetrics(metrics: AgentMetrics): void {
    const existingIndex = this.metrics.findIndex(m => m.agentName === metrics.agentName)
    if (existingIndex >= 0) {
      this.metrics[existingIndex] = metrics
    } else {
      this.metrics.push(metrics)
    }
    this.updateContent()
  }

  /**
   * Start auto-refresh (optional polling)
   */
  startAutoRefresh(intervalMs: number = 5000): void {
    this.stopAutoRefresh()
    this.updateInterval = window.setInterval(() => {
      this.safeUpdate()
    }, intervalMs)
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }

  /**
   * Get total tokens across all agents
   */
  getTotalTokens(): number {
    return this.metrics.reduce((sum, m) => sum + m.totalTokens, 0)
  }

  /**
   * Get average compliance rate
   */
  getAverageCompliance(): number {
    if (this.metrics.length === 0) return 1.0
    const total = this.metrics.reduce((sum, m) => sum + m.complianceRate, 0)
    return total / this.metrics.length
  }

  protected updateContent(): void {
    if (this.metrics.length === 0) {
      this.contentDiv.innerHTML = '<div class="no-data">No token data available</div>'
      return
    }

    const totalTokens = this.getTotalTokens()
    const avgCompliance = this.getAverageCompliance()
    const totalViolations = this.metrics.reduce((sum, m) => sum + m.protocolViolations, 0)

    this.contentDiv.innerHTML = `
      <div class="dashboard-header">
        <div class="summary-card">
          <span class="summary-label">Total Tokens</span>
          <span class="summary-value">${totalTokens.toLocaleString()}</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">Compliance</span>
          <span class="summary-value ${avgCompliance >= 0.95 ? 'good' : avgCompliance >= 0.8 ? 'warning' : 'bad'}">
            ${(avgCompliance * 100).toFixed(1)}%
          </span>
        </div>
        <div class="summary-card">
          <span class="summary-label">Violations</span>
          <span class="summary-value ${totalViolations === 0 ? 'good' : 'bad'}">${totalViolations}</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">Agents</span>
          <span class="summary-value">${this.metrics.length}</span>
        </div>
      </div>
      <div class="agents-list">
        ${this.metrics.map(agent => this.renderAgentCard(agent)).join('')}
      </div>
    `
  }

  private renderAgentCard(agent: AgentMetrics): string {
    const complianceClass = agent.complianceRate >= 0.95 ? 'good' : 
                           agent.complianceRate >= 0.8 ? 'warning' : 'bad'
    
    return `
      <div class="agent-card">
        <div class="agent-header">
          <span class="agent-name">${agent.agentName}</span>
          <span class="agent-compliance ${complianceClass}">
            ${(agent.complianceRate * 100).toFixed(0)}%
          </span>
        </div>
        <div class="agent-stats">
          <div class="stat">
            <span class="stat-label">Input</span>
            <span class="stat-value">${agent.totalInputTokens.toLocaleString()}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Output</span>
            <span class="stat-value">${agent.totalOutputTokens.toLocaleString()}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Total</span>
            <span class="stat-value">${agent.totalTokens.toLocaleString()}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Turns</span>
            <span class="stat-value">${agent.totalTurns}</span>
          </div>
        </div>
        ${agent.turns.length > 0 ? `
          <div class="turns-preview">
            <div class="turns-label">Recent Turns</div>
            <div class="turns-list">
              ${agent.turns.slice(-3).map(turn => this.renderTurn(turn)).join('')}
            </div>
          </div>
        ` : ''}
        ${agent.protocolViolations > 0 ? `
          <div class="violations-badge">${agent.protocolViolations} violations</div>
        ` : ''}
      </div>
    `
  }

  private renderTurn(turn: TurnMetrics): string {
    const violationClass = turn.protocolViolations > 0 ? 'has-violations' : ''
    const narrationIcon = turn.hasNarration ? ' 📝' : ''
    
    return `
      <div class="turn-item ${violationClass}">
        <span class="turn-number">#${turn.turnNumber}</span>
        <span class="turn-tokens">${turn.totalTokens.toLocaleString()} tokens${narrationIcon}</span>
        ${turn.protocolViolations > 0 ? `<span class="turn-violations">⚠️ ${turn.protocolViolations}</span>` : ''}
      </div>
    `
  }

  private addStyles(): void {
    const style = document.createElement('style')
    style.textContent = `
      .loom-token-dashboard {
        background: var(--theia-editor-background, #1e1e1e);
        color: var(--theia-editor-foreground, #d4d4d4);
        font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
        overflow-y: auto;
      }
      
      .token-dashboard-content {
        padding: 16px;
      }
      
      .no-data {
        text-align: center;
        padding: 40px;
        color: var(--theia-descriptionForeground, #717171);
        font-style: italic;
      }
      
      .dashboard-header {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }
      
      .summary-card {
        background: var(--theia-input-background, #3c3c3c);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
        border: 1px solid var(--theia-panel-border, #3c3c3c);
      }
      
      .summary-label {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--theia-descriptionForeground, #717171);
        margin-bottom: 4px;
      }
      
      .summary-value {
        display: block;
        font-size: 20px;
        font-weight: 600;
        font-family: var(--theia-monospace-font-family, monospace);
      }
      
      .summary-value.good { color: #4ec9b0; }
      .summary-value.warning { color: #dcdcaa; }
      .summary-value.bad { color: #f48771; }
      
      .agents-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .agent-card {
        background: var(--theia-input-background, #3c3c3c);
        border-radius: 8px;
        padding: 12px;
        border: 1px solid var(--theia-panel-border, #3c3c3c);
      }
      
      .agent-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--theia-panel-border, #3c3c3c);
      }
      
      .agent-name {
        font-weight: 600;
        font-size: 14px;
        color: var(--theia-editor-foreground, #d4d4d4);
      }
      
      .agent-compliance {
        font-size: 12px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 12px;
        background: var(--theia-badge-background, #3c3c3c);
      }
      
      .agent-compliance.good { background: #4ec9b030; color: #4ec9b0; }
      .agent-compliance.warning { background: #dcdcaa30; color: #dcdcaa; }
      .agent-compliance.bad { background: #f4877130; color: #f48771; }
      
      .agent-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-bottom: 12px;
      }
      
      .stat {
        text-align: center;
      }
      
      .stat-label {
        display: block;
        font-size: 10px;
        text-transform: uppercase;
        color: var(--theia-descriptionForeground, #717171);
        margin-bottom: 2px;
      }
      
      .stat-value {
        display: block;
        font-size: 13px;
        font-weight: 500;
        font-family: var(--theia-monospace-font-family, monospace);
        color: var(--theia-editor-foreground, #d4d4d4);
      }
      
      .turns-preview {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--theia-panel-border, #3c3c3c);
      }
      
      .turns-label {
        font-size: 10px;
        text-transform: uppercase;
        color: var(--theia-descriptionForeground, #717171);
        margin-bottom: 6px;
      }
      
      .turns-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .turn-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: var(--theia-editor-background, #1e1e1e);
        border-radius: 4px;
        font-size: 12px;
      }
      
      .turn-item.has-violations {
        border-left: 2px solid #f48771;
      }
      
      .turn-number {
        color: var(--theia-descriptionForeground, #717171);
        font-family: var(--theia-monospace-font-family, monospace);
      }
      
      .turn-tokens {
        color: var(--theia-editor-foreground, #d4d4d4);
      }
      
      .turn-violations {
        color: #f48771;
        font-size: 11px;
      }
      
      .violations-badge {
        display: inline-block;
        margin-top: 8px;
        padding: 2px 8px;
        background: #f4877130;
        color: #f48771;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
      }
    `
    document.head.appendChild(style)
  }

  dispose(): void {
    this.stopAutoRefresh()
    super.dispose()
  }
}
