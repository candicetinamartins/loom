// Loom Backend Entry Point — loaded by Theia's DI container
// This module is the single backend ContainerModule declared in package.json's
// "theia.backend.module" field. It loads ALL Loom backend sub-modules.
//
// NOTE: loom-app/src/typings/theia.d.ts stubs @theia/core/lib/node as an interface-
// only module, hiding the const Symbol. We obtain the symbol via require() from the
// specific sub-module path, bypassing the stub.
import { ContainerModule } from 'inversify'
import { LoomBackendContribution } from './loom-backend-contribution'

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
const { BackendApplicationContribution } = require('@theia/core/lib/node/backend-application') as { BackendApplicationContribution: symbol }
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = any[]

// Helper: require a compiled loom sub-module and apply its bindings into this
// container. ContainerModule.registry is the raw InversifyJS callback — calling
// it directly is equivalent to container.load(module) without needing the
// container reference.  Uses try/catch so an optional missing native addon
// (e.g., kuzu/better-sqlite3) never crashes the whole backend startup.
function applyModule(primaryPath: string, fallbackPath: string | undefined, args: AnyArgs): void {
  let mod: Record<string, unknown> | undefined

  const tryLoad = (p: string): boolean => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
      mod = require(p)
      return true
    } catch (_e) {
      return false
    }
  }

  if (!tryLoad(primaryPath) && !(fallbackPath && tryLoad(fallbackPath))) {
    console.warn(`[Loom] Could not load backend module: ${primaryPath}${fallbackPath ? ` (also tried ${fallbackPath})` : ''}`)
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const containerModule: any = (mod as any)?.default ?? mod
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (typeof containerModule?.registry === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    containerModule.registry(...args)
    console.log(`[Loom] Backend module loaded: ${primaryPath}`)
  } else {
    console.warn(`[Loom] Module ${primaryPath} has no .registry — skipped`)
  }
}

export default new ContainerModule((bind, unbind, isBound, rebind, unbindAsync, onActivation, onDeactivation) => {
  const args: AnyArgs = [bind, unbind, isBound, rebind, unbindAsync, onActivation, onDeactivation]

  // ── Core orchestration (LoomMsgHub, PipelineRunner, tools, context, …) ──
  // loom-core has no explicit rootDir; try inferred (lib/) then fallback (lib/src/)
  applyModule('@loom/core/lib/loom-core-module', '@loom/core/lib/src/loom-core-module', args)

  // ── 12-agent fleet (bound as @theia/ai-core Agent) ─────────────────────
  applyModule('@loom/agents/lib/loom-agents-module', undefined, args)

  // ── Tool providers (ReadFile, WriteFile, Git, Bash, Web, …) ─────────────
  applyModule('@loom/tools/lib/loom-tools-module', undefined, args)

  // ── Knowledge graph (Kuzu, BM25, AST, embeddings) ────────────────────────
  applyModule('@loom/graph/lib/loom-graph-module', undefined, args)

  // ── Lifecycle hooks (beforeAgentWrite, etc.) ──────────────────────────────
  applyModule('@loom/hooks/lib/loom-hooks-module', undefined, args)

  // ── Three-tier memory system ──────────────────────────────────────────────
  applyModule('@loom/memory/lib/loom-memory-module', undefined, args)

  // ── Package documentation indexer ─────────────────────────────────────────
  applyModule('@loom/docs/lib/loom-docs-module', undefined, args)

  // ── Backend application contribution (logs "Loom IDE backend started") ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(BackendApplicationContribution).to(LoomBackendContribution).inSingletonScope()
})
