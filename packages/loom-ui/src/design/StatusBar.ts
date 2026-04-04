import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export interface StatusBarData {
  agentCount: number
  graphNodes: number
  cost: number
  model: string
  hunks: number
  mode: 'CODE' | 'ASK'
  branch: string
}

export class StatusBarWidget extends Widget {
  private _data: StatusBarData

  constructor(data: StatusBarData) {
    super()
    this._data = data
    this.addClass('loom-status-bar')
    this.update()
  }

  get data(): StatusBarData {
    return this._data
  }

  set data(data: StatusBarData) {
    this._data = data
    this.update()
  }

  update(): void {
    const { agentCount, graphNodes, cost, model, hunks, mode, branch } = this._data

    this.node.innerHTML = `
      <div class="status-bar-content">
        <span class="status-item loom-brand">⬡ Loom</span>
        <span class="status-item branch">⎇ ${branch}</span>
        <span class="status-item agents">● ${agentCount} agents</span>
        <span class="status-item graph">◈ ${graphNodes.toLocaleString()} nodes</span>
        <span class="status-item cost">$${cost.toFixed(4)}</span>
        <span class="status-item model">↑↓ ${model}</span>
        ${hunks > 0 ? `<span class="status-item hunks">${hunks} hunks</span>` : ''}
        <span class="status-item mode ${mode}">${mode}</span>
      </div>
    `
  }

  protected onResize(msg: Message): void {
    this.update()
  }
}
