import { BaseWidget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export type FlowEventType = 'edit' | 'test-fail' | 'terminal' | 'saved'

export interface FlowEvent {
  id: string
  type: FlowEventType
  description: string
  timestamp: number
}

export interface FlowTimelineData {
  events: FlowEvent[]
  intent: string
}

export class FlowTimelineWidget extends BaseWidget {
  private _data: FlowTimelineData

  constructor(data: FlowTimelineData) {
    super()
    this._data = data
    this.addClass('loom-flow-timeline')
    this.update()
  }

  get data(): FlowTimelineData {
    return this._data
  }

  set data(data: FlowTimelineData) {
    this._data = data
    this.update()
  }

  protected update(): void {
    const { events, intent } = this._data

    const eventPills = events.map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      return `<span class="event-pill ${event.type}">${event.description}</span>`
    }).join(' → ')

    this.node.innerHTML = `
      <div class="flow-timeline-content">
        <span class="flow-label">flow:</span>
        <span class="flow-events">${eventPills}</span>
        <span class="flow-intent">intent: ${intent}</span>
      </div>
    `
  }

  protected onResize(msg: Message): void {
    this.update()
  }
}
