import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

/**
 * A checkpoint card shown in the Checkpoint Timeline panel.
 * Mirrors the data from CheckpointRecord in @loom/memory.
 * The UI layer keeps its own copy so it doesn't import from loom-memory
 * (avoids bundling Node.js fs/better-sqlite3 in the frontend webpack bundle).
 */
export interface CheckpointCard {
  id: string
  agentName: string
  label: string              // "CodeSmith · edited PipelineRunner.ts (+12 lines)"
  timestamp: number
  files: Array<{
    path: string
    hasContent: boolean      // false = new file (before = null), true = had content before
  }>
}

export type CheckpointRestoreHandler = (checkpointId: string) => void

/**
 * CheckpointTimelineWidget — side panel showing AI checkpoint history.
 *
 * Renders a scrollable list of checkpoint cards, newest first.
 * Each card shows: agent name, label, relative time, files list, and a [Restore] button.
 *
 * This is a Lumino Widget (not a Theia React Widget) for consistency with the rest
 * of loom-ui. The `onRestore` handler is wired by `CheckpointContribution` to call
 * a Theia command that invokes the backend `CheckpointService.restoreCheckpoint()`.
 */
export class CheckpointTimelineWidget extends Widget {
  static readonly ID = 'loom-checkpoint-timeline'
  static readonly LABEL = 'Checkpoint Timeline'

  private checkpoints: CheckpointCard[] = []
  private onRestore: CheckpointRestoreHandler | null = null

  constructor() {
    super()
    this.id = CheckpointTimelineWidget.ID
    this.title.label = CheckpointTimelineWidget.LABEL
    this.title.caption = 'AI Checkpoint / Revert Timeline'
    this.title.closable = true
    this.addClass('loom-checkpoint-timeline')
    this._applyContainerStyles()
  }

  /** Set the restore handler (called by CheckpointContribution after widget is created) */
  setRestoreHandler(handler: CheckpointRestoreHandler): void {
    this.onRestore = handler
  }

  /** Add or update a checkpoint card (newest first) */
  addCheckpoint(card: CheckpointCard): void {
    // Replace if same ID (idempotent), otherwise prepend
    const idx = this.checkpoints.findIndex(c => c.id === card.id)
    if (idx >= 0) {
      this.checkpoints[idx] = card
    } else {
      this.checkpoints.unshift(card)
    }
    // Keep last 100 checkpoints in the panel
    if (this.checkpoints.length > 100) this.checkpoints.pop()
    this.update()
  }

  /** Replace all cards (e.g. on initial load from backend) */
  setCheckpoints(cards: CheckpointCard[]): void {
    this.checkpoints = [...cards].sort((a, b) => b.timestamp - a.timestamp)
    this.update()
  }

  clear(): void {
    this.checkpoints = []
    this.update()
  }

  protected onUpdateRequest(_msg: Message): void {
    this.node.innerHTML = ''

    if (this.checkpoints.length === 0) {
      this._renderEmpty()
      return
    }

    const list = document.createElement('div')
    list.className = 'loom-cp-list'
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px;overflow-y:auto;height:100%;box-sizing:border-box;'

    for (const card of this.checkpoints) {
      list.appendChild(this._renderCard(card))
    }

    this.node.appendChild(list)
  }

  // ── Private rendering ──────────────────────────────────────────────────────

  private _renderCard(card: CheckpointCard): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'loom-cp-card'
    wrap.style.cssText = [
      'background:var(--theia-editor-background,#1e1e2e)',
      'border:1px solid var(--theia-widget-border,#333)',
      'border-radius:6px',
      'padding:10px 12px',
      'font-size:12px',
      'line-height:1.5',
    ].join(';')

    // ── Header row: agent · time ──────────────────────────────────────────
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:4px;'

    const agentSpan = document.createElement('span')
    agentSpan.style.cssText = 'font-weight:600;color:var(--theia-foreground,#cdd6f4);'
    agentSpan.textContent = `◈ ${card.agentName}`

    const timeSpan = document.createElement('span')
    timeSpan.style.cssText = 'color:var(--theia-descriptionForeground,#6c7086);font-size:11px;'
    timeSpan.textContent = this._relTime(card.timestamp)
    timeSpan.title = new Date(card.timestamp).toLocaleString()

    header.append(agentSpan, timeSpan)

    // ── Label ─────────────────────────────────────────────────────────────
    const labelDiv = document.createElement('div')
    labelDiv.style.cssText = 'color:var(--theia-foreground,#cdd6f4);margin-bottom:6px;'
    labelDiv.textContent = card.label

    // ── File list ─────────────────────────────────────────────────────────
    const fileList = document.createElement('div')
    fileList.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-bottom:8px;'

    const visibleFiles = card.files.slice(0, 5)
    for (const f of visibleFiles) {
      const fileRow = document.createElement('div')
      fileRow.style.cssText = 'display:flex;gap:6px;align-items:center;font-family:monospace;font-size:11px;'

      const icon = document.createElement('span')
      icon.textContent = f.hasContent ? '📝' : '✨'
      icon.style.fontSize = '10px'

      const name = document.createElement('span')
      name.style.color = 'var(--theia-descriptionForeground,#6c7086)'
      // Show just the filename + one parent directory
      const parts = f.path.replace(/\\/g, '/').split('/')
      name.textContent = parts.length > 1 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : parts[0]
      name.title = f.path

      fileRow.append(icon, name)
      fileList.appendChild(fileRow)
    }

    if (card.files.length > 5) {
      const more = document.createElement('div')
      more.style.cssText = 'font-size:11px;color:var(--theia-descriptionForeground,#6c7086);'
      more.textContent = `+${card.files.length - 5} more files`
      fileList.appendChild(more)
    }

    // ── Actions row ───────────────────────────────────────────────────────
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;'

    const restoreBtn = document.createElement('button')
    restoreBtn.className = 'loom-cp-restore-btn'
    restoreBtn.textContent = '⏮ Restore'
    restoreBtn.style.cssText = [
      'background:var(--theia-button-background,#cba6f7)',
      'color:var(--theia-button-foreground,#1e1e2e)',
      'border:none',
      'border-radius:4px',
      'padding:3px 10px',
      'font-size:11px',
      'cursor:pointer',
      'font-weight:600',
    ].join(';')
    restoreBtn.title = `Restore all files to their state before this checkpoint`
    restoreBtn.addEventListener('click', () => {
      if (this.onRestore) {
        this.onRestore(card.id)
      } else {
        console.warn('[CheckpointTimeline] No restore handler registered')
      }
    })
    // Hover effect
    restoreBtn.addEventListener('mouseover', () => {
      restoreBtn.style.filter = 'brightness(1.15)'
    })
    restoreBtn.addEventListener('mouseout', () => {
      restoreBtn.style.filter = ''
    })

    actions.appendChild(restoreBtn)

    wrap.append(header, labelDiv, fileList, actions)
    return wrap
  }

  private _renderEmpty(): void {
    const empty = document.createElement('div')
    empty.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'height:100%',
      'gap:8px',
      'color:var(--theia-descriptionForeground,#6c7086)',
      'font-size:12px',
      'padding:24px',
      'text-align:center',
    ].join(';')

    const icon = document.createElement('div')
    icon.style.fontSize = '32px'
    icon.textContent = '◈'

    const title = document.createElement('div')
    title.style.fontWeight = '600'
    title.textContent = 'No checkpoints yet'

    const hint = document.createElement('div')
    hint.style.maxWidth = '200px'
    hint.textContent = 'Checkpoints are created automatically when an agent writes files. They appear here so you can restore any previous state.'

    empty.append(icon, title, hint)
    this.node.appendChild(empty)
  }

  private _applyContainerStyles(): void {
    this.node.style.cssText = [
      'height:100%',
      'overflow:hidden',
      'background:var(--theia-sideBar-background,#181825)',
      'display:flex',
      'flex-direction:column',
    ].join(';')
  }

  private _relTime(ts: number): string {
    const diff = Date.now() - ts
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return new Date(ts).toLocaleDateString()
  }
}
