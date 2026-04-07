import { BackendApplicationContribution } from '@theia/core/lib/node'
import { injectable, inject, optional } from 'inversify'
import { MEMORY_TYPES } from '@loom/memory/src/loom-memory-module'
import type { SessionStore } from '@loom/memory/src/tier1/SessionStore'
import type { MemoryService } from '@loom/memory/src/MemoryService'
import type { MemoryIsolationService } from '@loom/memory/src/MemoryIsolationService'
import type { CheckpointService } from '@loom/memory/src/checkpoints/CheckpointService'
import { TYPES as CORE_TYPES } from '@loom/core/src/loom-core-module'
import type { SAIAProvider } from '@loom/core/src/services/SAIAProvider'
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
    @inject(CORE_TYPES.SAIAProvider) @optional() private saiaProvider: SAIAProvider,
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

    // ── Session approval endpoints ──────────────────────────────────────────
    // GET /loom/session/pending-approval
    // Returns sessions that have had memories extracted but not yet approved/discarded
    app.get('/loom/session/pending-approval', (_req: Request, res: Response) => {
      if (!this.isolationService) {
        res.json({ sessions: [] })
        return
      }
      res.json({ sessions: this.isolationService.getPendingApprovalSessions() })
    })

    // POST /loom/session/approve  { sessionId }
    app.post('/loom/session/approve', (req: Request, res: Response) => {
      void (async () => {
        try {
          const { sessionId } = req.body as { sessionId?: string }
          if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return }
          if (!this.isolationService) { res.status(503).json({ error: 'IsolationService unavailable' }); return }
          await this.isolationService.approveSession(sessionId)
          res.json({ ok: true })
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
        }
      })()
    })

    // POST /loom/session/discard  { sessionId }
    app.post('/loom/session/discard', (req: Request, res: Response) => {
      try {
        const { sessionId } = req.body as { sessionId?: string }
        if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return }
        if (!this.isolationService) { res.status(503).json({ error: 'IsolationService unavailable' }); return }
        this.isolationService.discardSession(sessionId)
        res.json({ ok: true })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    })

    console.log('[Loom] Session approval HTTP endpoints registered')

    // ── SAIA (Academic Cloud LLM) endpoints ─────────────────────────────────
    // These backend routes proxy SAIA requests so the API key never touches the
    // renderer process. Frontend fetches /loom/saia/* to interact with SAIA.

    // GET /loom/saia/status — is SAIA configured? where is the key coming from?
    app.get('/loom/saia/status', (_req: Request, res: Response) => {
      void (async () => {
        if (!this.saiaProvider) { res.json({ configured: false, keySource: 'none', modelsCount: 0 }); return }
        const status = await this.saiaProvider.getStatus()
        res.json(status)
      })()
    })

    // GET /loom/saia/models — live model list from https://chat-ai.academiccloud.de/v1/models
    app.get('/loom/saia/models', (_req: Request, res: Response) => {
      void (async () => {
        if (!this.saiaProvider) { res.json({ models: [] }); return }
        const forceRefresh = false
        const models = await this.saiaProvider.listModels(forceRefresh)
        res.json({ models })
      })()
    })

    // POST /loom/saia/key — store a new API key in the system keychain
    // Body: { apiKey: string }
    app.post('/loom/saia/key', (req: Request, res: Response) => {
      void (async () => {
        try {
          const { apiKey } = req.body as { apiKey?: string }
          if (!apiKey?.trim()) { res.status(400).json({ error: 'apiKey required' }); return }
          if (!this.saiaProvider) { res.status(503).json({ error: 'SAIAProvider unavailable' }); return }
          await this.saiaProvider.setApiKey(apiKey)
          res.json({ ok: true })
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
        }
      })()
    })

    // DELETE /loom/saia/key — remove the stored key
    app.delete('/loom/saia/key', (_req: Request, res: Response) => {
      void (async () => {
        if (this.saiaProvider) await this.saiaProvider.deleteApiKey()
        res.json({ ok: true })
      })()
    })

    // POST /loom/saia/complete — non-streaming chat completion proxy
    // Body: SaiaChatOptions (model, messages, temperature, etc.)
    app.post('/loom/saia/complete', (req: Request, res: Response) => {
      void (async () => {
        try {
          if (!this.saiaProvider) { res.status(503).json({ error: 'SAIAProvider unavailable' }); return }
          const result = await this.saiaProvider.chatCompletion(req.body as Parameters<SAIAProvider['chatCompletion']>[0])
          res.json(result)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const status = msg.includes('not configured') ? 503 : 500
          res.status(status).json({ error: msg })
        }
      })()
    })

    // POST /loom/saia/stream — SSE streaming chat completion proxy
    // Pipes SAIA's SSE stream directly to the client
    app.post('/loom/saia/stream', (req: Request, res: Response) => {
      void (async () => {
        try {
          if (!this.saiaProvider) { res.status(503).json({ error: 'SAIAProvider unavailable' }); return }
          const stream = await this.saiaProvider.chatCompletionStream(
            req.body as Parameters<SAIAProvider['chatCompletionStream']>[0]
          )
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')

          // Pipe the SSE stream from SAIA to the Theia client
          const reader = stream.getReader()
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read()
            if (done) { res.end(); return }
            res.write(value)
            return pump()
          }
          await pump()
        } catch (e) {
          if (!res.headersSent) {
            const msg = e instanceof Error ? e.message : String(e)
            res.status(500).json({ error: msg })
          }
        }
      })()
    })

    // POST /loom/saia/embeddings — embedding proxy
    // Body: { input: string | string[], model?: string }
    app.post('/loom/saia/embeddings', (req: Request, res: Response) => {
      void (async () => {
        try {
          if (!this.saiaProvider) { res.status(503).json({ error: 'SAIAProvider unavailable' }); return }
          const { input, model } = req.body as { input: string | string[]; model?: string }
          const embeddings = await this.saiaProvider.embeddings(input, model)
          res.json({ embeddings })
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
        }
      })()
    })

    // ── SAIA transparent proxy — called by Theia's OpenAI client ────────────
    // SaiaContribution injects models into Theia with url = /loom/saia/proxy
    // so that Theia's own @theia/ai-openai code calls these routes, which add
    // the Authorization header and forward to chat-ai.academiccloud.de.

    const saiaForward = (subPath: string, req: Request, res: Response): void => {
      void (async () => {
        try {
          if (!this.saiaProvider) { res.status(503).json({ error: 'SAIAProvider unavailable' }); return }
          const apiKey = await this.saiaProvider.getApiKey()
          if (!apiKey) { res.status(503).json({ error: 'SAIA API key not configured' }); return }

          const { SAIA_BASE_URL } = await import('@loom/core/src/services/SAIAProvider')
          const targetUrl = `${SAIA_BASE_URL}${subPath}`
          const isStream = (req.body as Record<string, unknown>)?.stream === true

          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              Accept: isStream ? 'text/event-stream' : 'application/json',
            },
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
          })

          res.status(upstream.status)
          upstream.headers.forEach((val, key) => {
            if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
              res.setHeader(key, val)
            }
          })

          if (!upstream.body) { res.end(); return }
          const reader = upstream.body.getReader()
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read()
            if (done) { res.end(); return }
            res.write(value)
            return pump()
          }
          await pump()
        } catch (e) {
          if (!res.headersSent) res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
        }
      })()
    }

    app.use('/loom/saia/proxy', (req: Request, res: Response) => {
      // Strip "/loom/saia/proxy" prefix and forward the rest
      const subPath = req.path  // e.g. "/chat/completions"
      saiaForward(subPath, req, res)
    })

    console.log('[Loom] SAIA proxy endpoints registered (/loom/saia/*)')
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
