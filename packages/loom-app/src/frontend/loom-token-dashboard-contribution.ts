import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell } from '@theia/core/lib/browser'
import { TokenDashboardWidget } from '@loom/ui'
import { TokenUsageTracker } from '@loom/core'

export const TOKEN_DASHBOARD_WIDGET_ID = 'loom-token-dashboard'

/**
 * TokenDashboardContribution - Registers Token Dashboard in Theia
 * 
 * Provides real-time token usage metrics visualization with:
 * - Per-agent token tracking
 * - Compliance rate monitoring
 * - Violation tracking
 * - Cost estimation
 */
@injectable()
export class TokenDashboardContribution extends AbstractViewContribution<TokenDashboardWidget> {
  private _widget: TokenDashboardWidget | null = null

  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell,
    @inject(TokenUsageTracker) private tokenTracker: TokenUsageTracker,
  ) {
    super({
      widgetId: TOKEN_DASHBOARD_WIDGET_ID,
      widgetName: 'Token Metrics',
      defaultWidgetOptions: {
        area: 'right',
        rank: 70,
      },
      toggleCommandId: 'loom.toggleTokenDashboard',
    })
  }

  async openView(options?: { activate?: boolean; reveal?: boolean }): Promise<TokenDashboardWidget> {
    if (!this._widget) {
      this._widget = new TokenDashboardWidget({
        id: TOKEN_DASHBOARD_WIDGET_ID,
        title: 'Token Metrics',
      })
      
      // Start polling for updates
      this.startMetricsPolling()
    }

    const shell = this.shell
    const widget = await this.widgetManager.getOrCreateWidget<TokenDashboardWidget>(TOKEN_DASHBOARD_WIDGET_ID)
    
    if (options?.reveal !== false) {
      await shell.addWidget(widget, {
        area: 'right',
        rank: 70,
      })
      if (options?.activate !== false) {
        await shell.activateWidget(widget.id)
      }
    }
    
    return widget
  }

  /**
   * Start polling for metrics updates
   */
  private startMetricsPolling(): void {
    // Update every 2 seconds
    setInterval(() => {
      this.updateMetrics()
    }, 2000)
  }

  /**
   * Update the widget with current metrics
   */
  private updateMetrics(): void {
    if (!this._widget) return

    const allMetrics = this.tokenTracker.getAllMetrics()
    this._widget.setMetrics(allMetrics)
  }

  /**
   * Get current token usage summary
   */
  getTokenSummary(): {
    totalTokens: number
    totalAgents: number
    averageCompliance: number
    totalViolations: number
  } {
    const allMetrics = this.tokenTracker.getAllMetrics()
    const totalTokens = allMetrics.reduce((sum, m) => sum + m.totalTokens, 0)
    const totalViolations = allMetrics.reduce((sum, m) => sum + m.protocolViolations, 0)
    const averageCompliance = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.complianceRate, 0) / allMetrics.length
      : 1.0

    return {
      totalTokens,
      totalAgents: allMetrics.length,
      averageCompliance,
      totalViolations,
    }
  }
}
