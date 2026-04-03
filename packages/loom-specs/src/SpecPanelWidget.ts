import { BaseWidget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'
import { SpecContent, SpecTask } from '../SpecService'

/**
 * Spec Panel Widget - Lumino panel showing spec tree with status badges
 * 
 * Displays:
 * - Spec list with status badges (draft/in-progress/complete)
 * - Task checklist with checkboxes
 * - Related modules from graph
 * - Quick actions (open requirements/design/tasks)
 */

export interface SpecPanelData {
  specs: SpecContent[]
  selectedSpec?: string
}

export class SpecPanelWidget extends BaseWidget {
  private _data: SpecPanelData

  constructor(data: SpecPanelData = { specs: [] }) {
    super()
    this._data = data
    this.addClass('loom-spec-panel')
    this.title.label = 'Specs'
    this.title.caption = 'Specification-driven development'
    this.title.closable = true
    this.update()
  }

  get data(): SpecPanelData {
    return this._data
  }

  set data(data: SpecPanelData) {
    this._data = data
    this.update()
  }

  protected onUpdateRequest(msg: Message): void {
    this.render()
  }

  protected render(): void {
    if (this._data.specs.length === 0) {
      this.node.innerHTML = `
        <div class="spec-panel-empty">
          <p>No specs yet.</p>
          <p>Create a spec with: <code>loom spec new "feature-name"</code></p>
        </div>
      `
      return
    }

    const specsHtml = this._data.specs.map(spec => this.renderSpecCard(spec)).join('')

    this.node.innerHTML = `
      <div class="spec-panel-header">
        <span class="panel-title">Specs</span>
        <span class="spec-count">${this._data.specs.length}</span>
      </div>
      <div class="spec-list">
        ${specsHtml}
      </div>
    `

    // Add click handlers
    this.addEventListeners()
  }

  private renderSpecCard(spec: SpecContent): string {
    const statusClass = spec.manifest.status
    const statusBadge = this.renderStatusBadge(spec.manifest.status)
    const progress = this.calculateProgress(spec)
    
    const tasks = this.parseTasks(spec.tasks)
    const completedTasks = tasks.filter(t => t.status === 'done').length
    
    return `
      <div class="spec-card ${spec.manifest.name === this._data.selectedSpec ? 'selected' : ''}" 
           data-spec-name="${spec.manifest.name}">
        <div class="spec-header">
          <span class="spec-title">${spec.manifest.title}</span>
          ${statusBadge}
        </div>
        <div class="spec-description">${spec.manifest.description}</div>
        <div class="spec-meta">
          <span class="spec-progress">${completedTasks}/${tasks.length} tasks</span>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
        <div class="spec-modules">
          ${spec.manifest.context.relatedModules.slice(0, 3).map(m => 
            `<span class="module-tag">${m.split('/').pop()}</span>`
          ).join('')}
        </div>
        <div class="spec-actions">
          <button class="spec-btn" data-action="requirements" data-spec="${spec.manifest.name}">
            Requirements
          </button>
          <button class="spec-btn" data-action="design" data-spec="${spec.manifest.name}">
            Design
          </button>
          <button class="spec-btn" data-action="tasks" data-spec="${spec.manifest.name}">
            Tasks
          </button>
        </div>
      </div>
    `
  }

  private renderStatusBadge(status: string): string {
    const colors: Record<string, string> = {
      draft: '#6b6b6b',
      'in-progress': '#569cd6',
      complete: '#4ec9b0',
    }
    
    return `<span class="status-badge" style="background: ${colors[status] || colors.draft}">
      ${status}
    </span>`
  }

  private calculateProgress(spec: SpecContent): number {
    const tasks = this.parseTasks(spec.tasks)
    if (tasks.length === 0) return 0
    
    const done = tasks.filter(t => t.status === 'done').length
    return Math.round((done / tasks.length) * 100)
  }

  private parseTasks(tasksMd: string): SpecTask[] {
    const lines = tasksMd.split('\n')
    const tasks: SpecTask[] = []
    
    for (const line of lines) {
      const match = line.match(/^- \[([ x])\] (.+)$/)
      if (match) {
        tasks.push({
          id: `task-${tasks.length}`,
          description: match[2],
          status: match[1] === 'x' ? 'done' : 'todo',
        })
      }
    }
    
    return tasks
  }

  private addEventListeners(): void {
    // Spec card click to select
    this.node.querySelectorAll('.spec-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement
        const specName = target.dataset.specName
        if (specName) {
          this._data.selectedSpec = specName
          this.update()
          this.emit('spec-selected', specName)
        }
      })
    })

    // Action buttons
    this.node.querySelectorAll('.spec-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const target = e.currentTarget as HTMLElement
        const action = target.dataset.action
        const specName = target.dataset.spec
        if (action && specName) {
          this.emit('spec-action', { action, specName })
        }
      })
    })
  }

  private emit(event: string, data: any): void {
    // Dispatch custom event
    this.node.dispatchEvent(new CustomEvent(event, { detail: data, bubbles: true }))
  }
}
