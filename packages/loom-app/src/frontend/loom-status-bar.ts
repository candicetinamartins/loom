import { injectable, inject } from 'inversify'
import { StatusBar } from '@theia/core/lib/browser/status-bar/status-bar'
import { StatusBarAlignment } from '@theia/core/lib/browser'

@injectable()
export class LoomStatusBarContribution {
  constructor(@inject(StatusBar) private statusBar: StatusBar) {}

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
      text: '$(server) 0/12',
      tooltip: 'Active agents / Total agents',
      alignment: StatusBarAlignment.LEFT,
      priority: 900,
    })

    // Graph stats indicator
    this.statusBar.setElement('loom-graph', {
      text: '$(graph) 0 nodes',
      tooltip: 'Knowledge graph nodes',
      alignment: StatusBarAlignment.LEFT,
      priority: 800,
    })

    // Cost indicator
    this.statusBar.setElement('loom-cost', {
      text: '$0.00',
      tooltip: 'Estimated API cost this session',
      alignment: StatusBarAlignment.LEFT,
      priority: 700,
    })

    // Mode indicator (CODE/ASK)
    this.statusBar.setElement('loom-mode', {
      text: '$(debug-console) CODE',
      tooltip: 'Loom mode: CODE or ASK',
      alignment: StatusBarAlignment.RIGHT,
      priority: 1000,
    })
  }

  updateAgentCount(active: number, total: number): void {
    this.statusBar.setElement('loom-agents', {
      text: `$(server) ${active}/${total}`,
      tooltip: 'Active agents / Total agents',
      alignment: StatusBarAlignment.LEFT,
      priority: 900,
    })
  }

  updateGraphStats(nodes: number): void {
    this.statusBar.setElement('loom-graph', {
      text: `$(graph) ${nodes.toLocaleString()} nodes`,
      tooltip: 'Knowledge graph nodes',
      alignment: StatusBarAlignment.LEFT,
      priority: 800,
    })
  }

  updateCost(cost: number): void {
    this.statusBar.setElement('loom-cost', {
      text: `$${cost.toFixed(2)}`,
      tooltip: 'Estimated API cost this session',
      alignment: StatusBarAlignment.LEFT,
      priority: 700,
    })
  }

  updateMode(mode: 'CODE' | 'ASK'): void {
    this.statusBar.setElement('loom-mode', {
      text: `$(debug-console) ${mode}`,
      tooltip: `Loom mode: ${mode}`,
      alignment: StatusBarAlignment.RIGHT,
      priority: 1000,
    })
  }
}
