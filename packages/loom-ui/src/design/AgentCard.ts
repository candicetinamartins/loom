import { BaseWidget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export type AgentState = 'running' | 'done' | 'waiting' | 'quarantined'

export interface AgentCardData {
  agentName: string
  state: AgentState
  stepCount: number
  maxSteps: number
  tokenUsage: {
    input: number
    output: number
    total: number
  }
  cost: number
  filesModified: string[]
}

export class AgentCardWidget extends BaseWidget {
  private _data: AgentCardData

  constructor(data: AgentCardData) {
    super()
    this._data = data
    this.addClass('loom-agent-card')
    this.update()
  }

  get data(): AgentCardData {
    return this._data
  }

  set data(data: AgentCardData) {
    this._data = data
    this.update()
  }

  protected update(): void {
    const { agentName, state, stepCount, maxSteps, tokenUsage, cost, filesModified } = this._data

    this.node.innerHTML = `
      <div class="agent-card-header">
        <span class="agent-dot ${state}"></span>
        <span class="agent-name">${agentName}</span>
        <span class="agent-state ${state}">${state}</span>
      </div>
      <div class="agent-card-body">
        <div class="agent-progress">
          <span class="step-count">${stepCount}/${maxSteps}</span>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${(stepCount / maxSteps) * 100}%"></div>
          </div>
        </div>
        <div class="agent-metrics">
          <span class="metric">tok: ${tokenUsage.total}</span>
          <span class="metric">$${cost.toFixed(4)}</span>
          <span class="metric">files: ${filesModified.length}</span>
        </div>
      </div>
      ${state === 'quarantined ? '<div class="agent-quarantine">⚠ result flagged — safe default used</div>' : ''}
    `

    this.node.className = `loom-agent-card ${state}`
  }

  protected onResize(msg: Message): void {
    this.update()
  }
}
