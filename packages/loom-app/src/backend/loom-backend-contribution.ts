import { BackendApplicationContribution } from '@theia/core/lib/node'
import { injectable, inject, optional } from 'inversify'
import { MEMORY_TYPES } from '@loom/memory/src/loom-memory-module'
import type { SessionStore } from '@loom/memory/src/tier1/SessionStore'
import type { MemoryService } from '@loom/memory/src/MemoryService'
import type { MemoryIsolationService } from '@loom/memory/src/MemoryIsolationService'
import type { CheckpointService } from '@loom/memory/src/checkpoints/CheckpointService'
import * as path from 'node:path'
// Express types are available because @theia/core depends on express
import type { Application, Request, Response } from 'express'

@injectable()
export class LoomBackendContribution implements BackendApplicationContribution {
  constructor(
    @inject(MEMORY_TYPES.SessionStore) @optional() private sessionStore: SessionStore,
    @inject(MEMORY_TYPES.MemoryService) @optional() private memoryService: MemoryService,
    @inject(MEMORY_TYPES.MemoryIsolationService) @optional() private isolationService: MemoryIsolationService,
    @inject(MEMORY_TYPES.CheckpointService) @optional() private checkpointService: CheckpointService,
  ) {}

  async onStart(): Promise<void> {
    console.log('[Loom] Backend starting…')

    // ── Initialise Tier 1: SessionStore ────────────────────────────────────
    if (this.sessionStore) {
      const dataDir = path.join(
        process.env.THEIA_APP_PROJECT_PATH ?? process.cwd(),
        '.loom', 'tier1',
      )
      try {
        this.sessionStore.initialize(dataDir)
        console.log(`[Loom] SessionStore initialised at ${dataDir}`)
      } catch (e) {
        console.warn('[Loom] SessionStore init failed (better-sqlite3 unavailable?):', e)
      }
    }

    // ── Initialise Tier 2/3: MemoryService ─────────────────────────────────
    if (this.memoryService) {
      try {
        await this.memoryService.initialize()
      } catch (e) {
        console.warn('[Loom] MemoryService init failed (Kuzu unavailable?):', e)
      }
    }

    // ── Start session cleanup schedule ─────────────────────────────────────
    if (this.isolationService) {
      this.isolationService.startCleanupSchedule()
    }

    console.log('[Loom] Backend started ✓')
  }

  // ── HTTP endpoints ─────────────────────────────────────────────────────────

  configure(app: Application): void {
    // POST /loom/checkpoint/restore
    // Body: { checkpointId: string }
    // Response: { restoredFiles: string[] } | { error: string }
    app.post('/loom/checkpoint/restore', (req: Request, res: Response) => {
      void (async () => {
        try {
          const { checkpointId } = req.body as { checkpointId?: string }
          if (!checkpointId || typeof checkpointId !== 'string') {
            res.status(400).json({ error: 'checkpointId is required' })
            return
          }

          if (!this.checkpointService) {
            res.status(503).json({ error: 'CheckpointService not available' })
            return
          }

          const restoredFiles = await this.checkpointService.restoreCheckpoint(checkpointId)
          res.json({ restoredFiles })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('[LoomBackend] /loom/checkpoint/restore error:', msg)
          res.status(500).json({ error: msg })
        }
      })()
    })

    // GET /loom/checkpoint/list?days=7&sessionId=xxx
    // Returns recent checkpoint cards for the timeline widget
    app.get('/loom/checkpoint/list', (req: Request, res: Response) => {
      void (async () => {
        try {
          if (!this.checkpointService) {
            res.status(503).json({ error: 'CheckpointService not available' })
            return
          }

          const days = req.query['days'] ? parseInt(String(req.query['days']), 10) : 7
          const sessionId = req.query['sessionId'] ? String(req.query['sessionId']) : undefined
          const records = this.checkpointService.getCheckpoints(sessionId, isNaN(days) ? 7 : days)
          res.json({ checkpoints: records })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          res.status(500).json({ error: msg })
        }
      })()
    })

    console.log('[Loom] Checkpoint HTTP endpoints registered')
  }

  onStop(): void {
    // Flush SQLite WAL cleanly on shutdown
    if (this.sessionStore) {
      try { this.sessionStore.destroy() } catch { /* ignore */ }
    }
    if (this.isolationService) {
      this.isolationService.stopCleanupSchedule()
    }
  }
}
