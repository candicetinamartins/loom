import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export interface FlowTimelineEvent {
  id: string
  type: string
  timestamp: number
  color: string
  label: string
}

export class FlowTimelineWidget extends Widget {
  private events: FlowTimelineEvent[] = []
  private intentLabel = ''

  constructor() {
    super()
    this.addClass('loom-flow-timeline')
    this.node.style.height = '22px'
    this.node.style.display = 'flex'
    this.node.style.alignItems = 'center'
    this.node.style.padding = '0 8px'
    this.node.style.borderBottom = '1px solid var(--loom-border)'
    this.node.style.background = 'var(--loom-panel-bg)'
    this.node.style.gap = '4px'
  }

  addEvent(event: FlowTimelineEvent): void {
    this.events.push(event)
    if (this.events.length > 50) {
      this.events.shift()
    }
    this.update()
  }

  setIntent(intent: string, confidence: number): void {
    this.intentLabel = `${intent} (${Math.round(confidence * 100)}%)`
    this.update()
  }

  protected onUpdateRequest(msg: Message): void {
    this.node.innerHTML = ''

    // Event pills
    const pillsContainer = document.createElement('div')
    pillsContainer.style.display = 'flex'
    pillsContainer.style.gap = '4px'
    pillsContainer.style.flex = '1'
    pillsContainer.style.overflow = 'hidden'

    this.events.slice(-20).forEach(event => {
      const pill = document.createElement('span')
      pill.className = 'loom-flow-pill'
      pill.textContent = event.label
      pill.style.background = event.color
      pill.style.color = '#fff'
      pill.style.padding = '2px 6px'
      pill.style.borderRadius = '3px'
      pill.style.fontSize = '10px'
      pill.style.whiteSpace = 'nowrap'
      pill.title = new Date(event.timestamp).toLocaleTimeString()
      pillsContainer.appendChild(pill)
    })

    this.node.appendChild(pillsContainer)

    // Intent label
    if (this.intentLabel) {
      const intent = document.createElement('span')
      intent.className = 'loom-flow-intent'
      intent.textContent = this.intentLabel
      intent.style.fontSize = '11px'
      intent.style.color = 'var(--loom-text-secondary)'
      intent.style.marginLeft = 'auto'
      this.node.appendChild(intent)
    }
  }

  clear(): void {
    this.events = []
    this.intentLabel = ''
    this.update()
  }
}
