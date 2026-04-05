import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'
import { AgentCardWidget, AgentCardData, AgentState } from './AgentCard'

export interface AgentPanelData {
  agents: AgentCardData[]
}

export class AgentPanelWidget extends Widget {
  private _data: AgentPanelData
  private _agentCards: Map<string, AgentCardWidget> = new Map()

  constructor(data: AgentPanelData) {
    super()
    this._data = data
    this.addClass('loom-agent-panel')
    this.update()
  }

  get data(): AgentPanelData {
    return this._data
  }

  set data(data: AgentPanelData) {
    this._data = data
    this.update()
  }

  update(): void {
    const { agents } = this._data

    this.node.innerHTML = `
      <div class="agent-panel-header">
        <span class="panel-title">Agents</span>
        <span class="agent-count">${agents.length} active</span>
      </div>
      <div class="agent-cards-container"></div>
    `

    const container = this.node.querySelector('.agent-cards-container')
    if (!container) return

    agents.forEach(agentData => {
      const existingCard = this._agentCards.get(agentData.agentName)
      
      if (existingCard) {
        existingCard.data = agentData
      } else {
        const card = new AgentCardWidget(agentData)
        this._agentCards.set(agentData.agentName, card)
        container.appendChild(card.node)
      }
    })

    this._agentCards.forEach((card, name) => {
      if (!agents.find(a => a.agentName === name)) {
        card.dispose()
        this._agentCards.delete(name)
      }
    })
  }

  protected onResize(msg: Message): void {
    this.update()
  }

  dispose(): void {
    this._agentCards.forEach(card => card.dispose())
    this._agentCards.clear()
    super.dispose()
  }
}
