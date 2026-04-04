import { injectable, inject } from 'inversify'
import { StatusBar } from '@theia/core/lib/browser/status-bar/status-bar'
import { StatusBarAlignment } from '@theia/core/lib/browser'
import { FlowTrackingService, FlowEventType } from '@loom/core'

export const LOOM_STATUSBAR_SYMBOL = Symbol('LoomStatusBarService')

@injectable()
export class LoomStatusBarService {
  private activeAgentCount = 0
  private totalAgentCount = 12
  private graphNodeCount = 0
  private sessionCost = 0
  private currentMode: 'CODE' | 'ASK' = 'CODE'

  constructor(
    @inject(StatusBar) private statusBar: StatusBar,
    @inject(FlowTrackingService) private flowService: FlowTrackingService
  ) {
    this.setupFlowListeners()
  }

  private setupFlowListeners(): void {
    // Listen to flow events that affect status bar
    this.flowService.subscribe((event: { type: string; data?: { status?: string } }) => {
      if (event.type === 'file_save' || event.type === 'git_commit') {
        this.incrementActivity()
      }
      if (event.type === 'test_run' && event.data?.status === 'fail') {
        this.incrementActivity()
      }
    })
  }

  private incrementActivity(): void {
    // Track session activity for cost estimation
    this.sessionCost += 0.001 // Approximate cost per action
    this.updateCost(this.sessionCost)
  }

  private handleTestEvent(event: { status?: 'pass' | 'fail' }): void {
    if (event.status === 'fail') {
      this.incrementActivity()
    }
  }

  async onStart(): Promise<void> {
    // Loom Brand indicator
    this.statusBar.setElement('loom-brand', {
      text: '◈ Loom',
      tooltip: 'Loom AI IDE',
      alignment: StatusBarAlignment.LEFT,
      priority: 1000,
    })

    // Agent count indicator
    this.statusBar.setElement('loom-agents', {
      text: `$(server) ${this.activeAgentCount}/${this.totalAgentCount}`,
      tooltip: 'Active agents / Total agents',
      alignment: StatusBarAlignment.LEFT,
      priority: 900,
    })

    // Graph stats indicator
    this.statusBar.setElement('loom-graph', {
      text: `$(graph) ${this.graphNodeCount.toLocaleString()} nodes`,
      tooltip: 'Knowledge graph nodes',
      alignment: StatusBarAlignment.LEFT,
      priority: 800,
    })

    // Cost indicator
    this.statusBar.setElement('loom-cost', {
      text: `$${this.sessionCost.toFixed(2)}`,
      tooltip: 'Estimated API cost this session',
      alignment: StatusBarAlignment.LEFT,
      priority: 700,
    })

    // Mode indicator (CODE/ASK)
    this.statusBar.setElement('loom-mode', {
      text: `$(debug-console) ${this.currentMode}`,
      tooltip: `Loom mode: ${this.currentMode}`,
      alignment: StatusBarAlignment.RIGHT,
      priority: 1000,
    })
  }

  updateAgentCount(active: number, total: number): void {
    this.activeAgentCount = active
    this.totalAgentCount = total
    this.statusBar.setElement('loom-agents', {
      text: `$(server) ${active}/${total}`,
      tooltip: 'Active agents / Total agents',
      alignment: StatusBarAlignment.LEFT,
      priority: 900,
    })
  }

  updateGraphStats(nodes: number): void {
    this.graphNodeCount = nodes
    this.statusBar.setElement('loom-graph', {
      text: `$(graph) ${nodes.toLocaleString()} nodes`,
      tooltip: 'Knowledge graph nodes',
      alignment: StatusBarAlignment.LEFT,
      priority: 800,
    })
  }

  updateCost(cost: number): void {
    this.sessionCost = cost
    this.statusBar.setElement('loom-cost', {
      text: `$${cost.toFixed(2)}`,
      tooltip: 'Estimated API cost this session',
      alignment: StatusBarAlignment.LEFT,
      priority: 700,
    })
  }

  updateMode(mode: 'CODE' | 'ASK'): void {
    this.currentMode = mode
    this.statusBar.setElement('loom-mode', {
      text: `$(debug-console) ${mode}`,
      tooltip: `Loom mode: ${mode}`,
      alignment: StatusBarAlignment.RIGHT,
      priority: 1000,
    })
  }

  // Called by services to update status
  notifyAgentStarted(): void {
    this.updateAgentCount(this.activeAgentCount + 1, this.totalAgentCount)
  }

  notifyAgentCompleted(): void {
    this.updateAgentCount(Math.max(0, this.activeAgentCount - 1), this.totalAgentCount)
  }

  notifyGraphIndexed(nodes: number): void {
    this.updateGraphStats(nodes)
  }

  notifyCostIncurred(amount: number): void {
    this.updateCost(this.sessionCost + amount)
  }
}
