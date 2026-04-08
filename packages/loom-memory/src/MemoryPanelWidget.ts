import { Widget } from '@lumino/widgets'
import { MemoryService, Memory } from './MemoryService'

/**
 * MemoryPanelWidget — Browse and manage Working Graph memories
 *
 * Shows memories from the Kuzu graph (Tier 2) with search/filter.
 */

export class MemoryPanelWidget extends Widget {
  private memoryService: MemoryService
  private memories: Memory[] = []
  private filter: string = ''

  constructor(memoryService: MemoryService) {
    super()
    this.memoryService = memoryService
    this.id = 'memory-panel'
    this.title.label = 'Memories'
    this.title.closable = true
    this.addClass('loom-memory-panel')
    
    this.node.innerHTML = this.renderEmpty()
    this.loadMemories()
  }

  async loadMemories(): Promise<void> {
    this.memories = await this.memoryService.getAll()
    this.update()
  }

  update(): void {
    const filtered = this.getFilteredMemories()
    this.node.innerHTML = this.render(filtered)
    this.attachListeners()
  }

  private getFilteredMemories(): Memory[] {
    return this.memories.filter(m => {
      // Text filter only (no tier filter in new architecture)
      if (this.filter) {
        const filterLower = this.filter.toLowerCase()
        return m.key.toLowerCase().includes(filterLower) ||
               m.content.toLowerCase().includes(filterLower)
      }
      return true
    })
  }

  private render(memories: Memory[]): string {
    const memoryCount = this.memories.length

    return `
      <div class="memory-panel-header">
        <h3>💭 Working Graph</h3>
        <div class="memory-stats">
          <span class="memory-count">${memoryCount} memories</span>
        </div>
      </div>

      <div class="memory-filters">
        <input type="text"
               class="memory-search"
               placeholder="Search memories..."
               value="${this.filter}" />
        <button class="refresh-btn">↻ Refresh</button>
      </div>
      
      <div class="memory-list">
        ${memories.length === 0 ? this.renderEmpty() : memories.map(m => this.renderMemory(m)).join('')}
      </div>
      
      <div class="memory-actions">
        <button class="add-memory-btn">+ Add Memory</button>
        <button class="cleanup-btn">🧹 Cleanup Old</button>
      </div>
    `
  }

  private renderMemory(memory: Memory): string {
    const age = this.formatAge(memory.createdAt)
    const sourceIcon = memory.source === 'explicit' ? '✏️' :
                       memory.source === 'decision' ? '🎯' : '🔍'

    return `
      <div class="memory-item" data-id="${memory.id}">
        <div class="memory-header">
          <span class="memory-source">${sourceIcon}</span>
          <span class="memory-key">${memory.key}</span>
          <span class="memory-age">${age}</span>
          <span class="memory-uses">${memory.useCount}×</span>
        </div>
        <div class="memory-content">${memory.content.slice(0, 200)}${memory.content.length > 200 ? '...' : ''}</div>
        <div class="memory-actions-small">
          <button class="edit-btn" data-id="${memory.id}">Edit</button>
          <button class="delete-btn" data-id="${memory.id}">Delete</button>
        </div>
      </div>
    `
  }

  private renderEmpty(): string {
    return `
      <div class="memory-empty">
        <p>No memories yet.</p>
        <p>Use <code>/remember &lt;content&gt;</code> to store memories.</p>
      </div>
    `
  }

  private attachListeners(): void {
    // Search filter
    const searchInput = this.node.querySelector('.memory-search') as HTMLInputElement
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filter = (e.target as HTMLInputElement).value
        this.update()
      })
    }


    // Refresh button
    const refreshBtn = this.node.querySelector('.refresh-btn')
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadMemories()
      })
    }

    // Delete buttons
    const deleteBtns = this.node.querySelectorAll('.delete-btn')
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.target as HTMLElement).dataset.id
        if (id) {
          const memory = this.memories.find(m => m.id === id)
          if (memory) {
            await this.memoryService.forget(memory.key)
            await this.loadMemories()
          }
        }
      })
    })
  }

  private formatAge(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'today'
    if (days === 1) return '1d'
    if (days < 7) return `${days}d`
    if (days < 30) return `${Math.floor(days / 7)}w`
    return `${Math.floor(days / 30)}m`
  }
}
