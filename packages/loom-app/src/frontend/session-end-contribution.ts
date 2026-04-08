import { injectable, inject } from 'inversify'
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution'
import { MessageService } from '@theia/core/lib/common/message-service'

/**
 * SessionEndContribution — polls the backend for sessions awaiting memory approval.
 *
 * When an agent session ends and Haiku has extracted memories into Tier 2,
 * the backend adds the session to a "pending approval" list. This contribution
 * polls that list every 30 seconds and shows a Theia notification dialog:
 *
 *   "CodeSmith session ended — 8 memories extracted. Promote to long-term knowledge?"
 *   [Approve]  [Discard]
 *
 * Approve → POST /loom/session/approve → MemoryIsolationService.approveSession()
 *           (all Tier 2 memories for this session are promoted to Tier 3)
 * Discard → POST /loom/session/discard → memories stay in Tier 2, flagged as discarded
 */
@injectable()
export class SessionEndContribution implements FrontendApplicationContribution {
  // Sessions already shown to the user — avoid re-prompting on next poll
  private readonly shown: Set<string> = new Set()
  private pollHandle: ReturnType<typeof setInterval> | null = null

  constructor(
    @inject(MessageService) private readonly messageService: MessageService,
  ) {}

  async onStart(): Promise<void> {
    // Initial poll after 10 s to give the backend time to fully initialise
    setTimeout(() => {
      void this._poll()
      this.pollHandle = setInterval(() => { void this._poll() }, 30_000)
    }, 10_000)
    console.log('[Loom] SessionEndContribution started — polling every 30 s')
  }

  onStop(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
  }

  // ── Poll ───────────────────────────────────────────────────────────────────

  private async _poll(): Promise<void> {
    try {
      const res = await fetch('/loom/session/pending-approval')
      if (!res.ok) return

      const { sessions } = await res.json() as {
        sessions: Array<{ sessionId: string; agentName: string; memoriesExtracted: number; endedAt: number }>
      }

      for (const session of sessions) {
        if (this.shown.has(session.sessionId)) continue
        this.shown.add(session.sessionId)
        // Show each pending session dialog sequentially (don't overlap)
        void this._promptApproval(session)
      }
    } catch {
      // Backend not up, silently skip
    }
  }

  // ── Dialog ─────────────────────────────────────────────────────────────────

  private async _promptApproval(session: {
    sessionId: string
    agentName: string
    memoriesExtracted: number
    endedAt: number
  }): Promise<void> {
    const age = this._relTime(session.endedAt)
    const msg =
      `${session.agentName} session ended ${age} — ` +
      `${session.memoriesExtracted} memor${session.memoriesExtracted === 1 ? 'y' : 'ies'} extracted. ` +
      `Promote to long-term knowledge?`

    const decision = await this.messageService.info(msg, 'Approve', 'Discard')

    const endpoint = decision === 'Approve' ? '/loom/session/approve' : '/loom/session/discard'
    if (!decision) return // dialog dismissed with no action

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      })

      if (decision === 'Approve') {
        void this.messageService.info(
          `✓ ${session.memoriesExtracted} memories promoted to long-term knowledge`,
        )
      }
    } catch (e) {
      console.error('[SessionEndContribution] Failed to record decision:', e)
    }
  }

  private _relTime(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    return `${Math.floor(m / 60)}h ago`
  }
}
