import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export type DiffHunkAction = 'accept' | 'reject' | 'edit' | 'ask'

export interface DiffHunk {
  id: string
  startLine: number
  endLine: number
  type: 'addition' | 'deletion' | 'modification'
  oldContent?: string
  newContent?: string
}

export interface DiffGutterConfig {
  hunks: DiffHunk[]
  onAction: (action: DiffHunkAction, hunkId: string) => void
}

/**
 * DiffGutterWidget — Per-hunk buttons in editor gutter
 *
 * v7 Features:
 * - ✓ Accept · ✗ Reject · ✎ Edit · 💬 Ask buttons per hunk
 * - Addition lines: green background
 * - Deletion lines: red background
 * - Modification lines: yellow/orange background
 *
 * This widget renders as an overlay on the editor gutter.
 */
export class DiffGutterWidget extends Widget {
  static readonly ID = 'loom-diff-gutter'
  
  private hunks: DiffHunk[] = []
  private onAction: ((action: DiffHunkAction, hunkId: string) => void) | null = null
  private activeHunkId: string | null = null

  constructor() {
    super()
    this.id = DiffGutterWidget.ID
    this.addClass('loom-diff-gutter')
    this._applyStyles()
  }

  setConfig(config: DiffGutterConfig): void {
    this.hunks = config.hunks
    this.onAction = config.onAction
    this.update()
  }

  setHunks(hunks: DiffHunk[]): void {
    this.hunks = hunks
    this.update()
  }

  clear(): void {
    this.hunks = []
    this.activeHunkId = null
    this.update()
  }

  protected onUpdateRequest(_msg: Message): void {
    this.node.innerHTML = ''
    
    if (this.hunks.length === 0) {
      this.node.style.display = 'none'
      return
    }
    
    this.node.style.display = 'block'
    
    for (const hunk of this.hunks) {
      const hunkEl = this._renderHunk(hunk)
      this.node.appendChild(hunkEl)
    }
  }

  private _renderHunk(hunk: DiffHunk): HTMLElement {
    const container = document.createElement('div')
    container.className = `loom-diff-hunk loom-diff-hunk-${hunk.type}`
    container.dataset.hunkId = hunk.id
    
    // Position based on line number (will be adjusted by editor integration)
    container.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      font-size: 12px;
      border-left: 3px solid ${this._getColorForType(hunk.type)};
      background: ${this._getBgColorForType(hunk.type)};
    `

    // Action buttons
    const buttons = [
      { action: 'accept' as DiffHunkAction, icon: '✓', label: 'Accept', title: 'Accept changes' },
      { action: 'reject' as DiffHunkAction, icon: '✗', label: 'Reject', title: 'Reject changes' },
      { action: 'edit' as DiffHunkAction, icon: '✎', label: 'Edit', title: 'Edit in chat' },
      { action: 'ask' as DiffHunkAction, icon: '💬', label: 'Ask', title: 'Ask about this' },
    ]

    for (const btn of buttons) {
      const button = document.createElement('button')
      button.className = `loom-diff-btn loom-diff-btn-${btn.action}`
      button.innerHTML = `${btn.icon} ${btn.label}`
      button.title = btn.title
      button.style.cssText = `
        padding: 2px 6px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
        background: var(--theia-editor-background);
        color: var(--theia-editor-foreground);
        opacity: 0.8;
        transition: opacity 0.15s;
      `
      
      button.addEventListener('mouseenter', () => { button.style.opacity = '1' })
      button.addEventListener('mouseleave', () => { button.style.opacity = '0.8' })
      button.addEventListener('click', (e) => {
        e.stopPropagation()
        this._handleAction(btn.action, hunk.id)
      })
      
      container.appendChild(button)
    }

    // Line indicator
    const lineIndicator = document.createElement('span')
    lineIndicator.className = 'loom-diff-lines'
    lineIndicator.textContent = `Ln ${hunk.startLine}-${hunk.endLine}`
    lineIndicator.style.cssText = `
      margin-left: auto;
      font-size: 10px;
      opacity: 0.6;
    `
    container.appendChild(lineIndicator)

    return container
  }

  private _getColorForType(type: DiffHunk['type']): string {
    switch (type) {
      case 'addition': return '#4ade80' // green-400
      case 'deletion': return '#f87171' // red-400
      case 'modification': return '#fbbf24' // amber-400
      default: return '#9ca3af'
    }
  }

  private _getBgColorForType(type: DiffHunk['type']): string {
    switch (type) {
      case 'addition': return 'rgba(74, 222, 128, 0.1)'
      case 'deletion': return 'rgba(248, 113, 113, 0.1)'
      case 'modification': return 'rgba(251, 191, 36, 0.1)'
      default: return 'transparent'
    }
  }

  private _handleAction(action: DiffHunkAction, hunkId: string): void {
    this.activeHunkId = hunkId
    if (this.onAction) {
      this.onAction(action, hunkId)
    }
    
    // Visual feedback
    const hunkEl = this.node.querySelector(`[data-hunk-id="${hunkId}"]`)
    if (hunkEl) {
      hunkEl.classList.add('loom-diff-hunk-active')
      setTimeout(() => {
        hunkEl.classList.remove('loom-diff-hunk-active')
      }, 300)
    }
  }

  private _applyStyles(): void {
    // Inject styles if not already present
    const styleId = 'loom-diff-gutter-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .loom-diff-gutter {
          position: absolute;
          z-index: 100;
          pointer-events: none;
        }
        .loom-diff-hunk {
          pointer-events: auto;
        }
        .loom-diff-hunk:hover {
          background: var(--theia-list-hoverBackground);
        }
        .loom-diff-hunk-active {
          animation: loom-diff-pulse 0.3s ease;
        }
        @keyframes loom-diff-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        .loom-diff-btn:hover {
          background: var(--theia-button-hoverBackground) !important;
        }
      `
      document.head.appendChild(style)
    }
  }
}
