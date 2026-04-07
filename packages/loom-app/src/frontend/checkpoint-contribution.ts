import { injectable } from 'inversify'
import type { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution'
import type { CommandContribution } from '@theia/core/lib/common/command'
import { CommandRegistry } from '@theia/core/lib/common/command'
import { CheckpointTimelineWidget, type CheckpointCard } from '@loom/ui/src/widgets/CheckpointTimelineWidget'

// Loom command IDs — these match LOOM_COMMANDS in loom-keybindings.ts
export const REVERT_TO_CHECKPOINT_COMMAND = 'loom.revertToCheckpoint'
export const OPEN_CHECKPOINT_TIMELINE_COMMAND = 'loom.openCheckpointTimeline'

/**
 * CheckpointContribution — wires the CheckpointTimelineWidget into the Theia shell.
 */
@injectable()
export class CheckpointContribution implements FrontendApplicationContribution {
  private widget: CheckpointTimelineWidget | null = null
  private shell: { addWidget?: (w: unknown, opts?: unknown) => void; activateWidget?: (id: string) => Promise<unknown> } | null = null

  // ── Commands ─────────────────────────────────────────────────────────────

  registerCommands(registry: CommandRegistry): void {
    // Open / reveal the Checkpoint Timeline side panel
    registry.registerCommand(
      { id: OPEN_CHECKPOINT_TIMELINE_COMMAND, label: 'Loom: Open Checkpoint Timeline', category: 'Loom' },
      {
        execute: () => {
          this._revealWidget()
        },
      },
    )

    // Programmatic restore — called by CheckpointRestoreTool or external code
    registry.registerCommand(
      { id: REVERT_TO_CHECKPOINT_COMMAND, label: 'Loom: Revert to Checkpoint…', category: 'Loom' },
      {
        execute: (checkpointId: string) => {
          if (checkpointId) {
            void this._restoreCheckpoint(checkpointId)
          }
        },
      },
    )
  }

  // ── FrontendApplicationContribution ──────────────────────────────────────

  async onStart(): Promise<void> {
    this._createWidget()
    this._addToShell()
    // Load recent checkpoints from backend (non-blocking — widget shows empty state until populated)
    void this._loadInitialCheckpoints()
    console.log('[Loom] CheckpointContribution started')
  }

  private async _loadInitialCheckpoints(): Promise<void> {
    try {
      const response = await fetch('/loom/checkpoint/list?days=7')
      if (response.ok) {
        const { checkpoints } = await response.json() as {
          checkpoints: Array<{
            id: string
            agentName: string
            label?: string
            timestamp: number
            files: Array<{ path: string; before: string | null }>
          }>
        }
        if (Array.isArray(checkpoints) && this.widget) {
          const cards: CheckpointCard[] = checkpoints.map(cp => ({
            id: cp.id,
            agentName: cp.agentName,
            label: cp.label ?? cp.id,
            timestamp: cp.timestamp,
            files: cp.files.map(f => ({ path: f.path, hasContent: f.before !== null })),
          }))
          this.widget.setCheckpoints(cards)
        }
      }
    } catch (e) {
      // Backend not up yet or endpoint unavailable — silent, widget shows empty state
      console.debug('[CheckpointContribution] Could not load initial checkpoints:', e)
    }
  }

  // ── Widget creation ─────────────────────────────────────────────────────────

  private _createWidget(): void {
    this.widget = new CheckpointTimelineWidget()

    // Wire the restore handler — calls the backend via HTTP POST
    this.widget.setRestoreHandler((checkpointId: string) => {
      void this._restoreCheckpoint(checkpointId)
    })
  }

  private _addToShell(): void {
    if (!this.widget) return

    // Attach to the right panel as a side widget — Theia's ApplicationShell
    // accepts widgets via addWidget(). We target the 'right' area.
    try {
      // Access shell via the global window theia container
      // (This is the safe approach when we don't have @inject(ApplicationShell))
      const theiaContainer = (window as { theia?: { container?: { get?: (id: symbol) => unknown } } }).theia?.container
      if (theiaContainer?.get) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
        const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const shell = theiaContainer.get(ApplicationShell) as { addWidget?: (w: unknown, opts?: unknown) => void; activateWidget?: (id: string) => Promise<unknown> }
        this.shell = shell
        if (shell?.addWidget && this.widget) {
          shell.addWidget(this.widget, { area: 'right', rank: 500 })
        }
      }
    } catch (e) {
      // Shell not yet available — widget will be opened on first command trigger
      console.debug('[CheckpointContribution] Shell not available yet, widget deferred:', e)
    }
  }

  private _revealWidget(): void {
    if (!this.widget) {
      this._createWidget()
      this._addToShell()
    }
    if (this.shell?.activateWidget && this.widget) {
      void this.shell.activateWidget(CheckpointTimelineWidget.ID)
    }
  }

  // ── Restore ──────────────────────────────────────────────────────────────────

  private async _restoreCheckpoint(checkpointId: string): Promise<void> {
    // Show a confirmation dialog before restoring
    const confirmed = window.confirm(
      `Restore to checkpoint "${checkpointId}"?\n\n` +
      `This will rewrite all files to their state before this checkpoint. ` +
      `Your current changes will be overwritten.`
    )
    if (!confirmed) return

    // Set as default if no theme is set
    const currentTheme = this.preferenceService.get('workbench.colorTheme');
    if (!currentTheme || currentTheme === 'theia-dark') {
      // Try to set theme via preference service
      try {
        await this.preferenceService.set('workbench.colorTheme', 'loom-dark')
      } catch {
        // Theme setting not available
      }
    }

    try {
      // Call the backend checkpoint service via a Theia HTTP call
      // (The Theia backend exposes services on the same origin as the frontend)
      const response = await fetch('/loom/checkpoint/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkpointId }),
      })

      if (response.ok) {
        const { restoredFiles } = await response.json() as { restoredFiles: string[] }
        console.log(`[Loom] Restored ${restoredFiles.length} files from checkpoint ${checkpointId}`)

        // Emit a status notification
        const notification = document.createElement('div')
        notification.textContent = `✓ Restored ${restoredFiles.length} files`
        notification.style.cssText = [
          'position:fixed',
          'bottom:24px',
          'right:24px',
          'background:var(--theia-notificationToast-background,#313244)',
          'color:var(--theia-foreground,#cdd6f4)',
          'padding:10px 16px',
          'border-radius:6px',
          'font-size:13px',
          'z-index:9999',
          'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
        ].join(';')
        document.body.appendChild(notification)
        setTimeout(() => notification.remove(), 3000)
      } else {
        const err = await response.text()
        console.error('[Loom] Restore failed:', err)
        window.alert(`Restore failed: ${err}`)
      }
    } catch (e) {
      // Fallback: invoke via the Theia command system if HTTP endpoint not available
      console.warn('[CheckpointContribution] HTTP restore unavailable, trying command system:', e)
      try {
        const theiaContainer = (window as { theia?: { container?: { get?: (id: symbol) => unknown } } }).theia?.container
        if (theiaContainer?.get) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
          const { CommandRegistry } = require('@theia/core/lib/common/command')
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
          const commands = theiaContainer.get(CommandRegistry) as { executeCommand: (id: string, ...args: unknown[]) => Promise<unknown> }
          await commands.executeCommand(REVERT_TO_CHECKPOINT_COMMAND, checkpointId)
        }
      } catch (e2) {
        console.error('[CheckpointContribution] Both restore paths failed:', e2)
      }
    }
  }

  // ── Public: push a new checkpoint card from external sources ─────────────────

  /** Called by LoomFlowTimelineContribution when a file_write event is received */
  addCheckpointCard(card: CheckpointCard): void {
    this.widget?.addCheckpoint(card)
  }

  getWidget(): CheckpointTimelineWidget | null {
    return this.widget
  }
}
