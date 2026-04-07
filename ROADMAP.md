# Loom Roadmap

## v1.0.0 — Initial Release ✅
- Eclipse Theia + Electron IDE shell (Windows x64, Linux x64)
- 12-agent fleet with parallel execution, quarantine & retry
- Okapi BM25 full-text search over knowledge graph
- Kuzu graph database integration (with CI stub fallback)
- Flow timeline: real-time developer intent detection
- Agent panel: live status, token/cost metrics per agent
- Code Map: force-directed graph from Kuzu (doc coverage + churn overlay)
- Verifier: output validation with safe-default quarantine
- Loom dark theme + design token system

---

## v1.0.1 — Stability & Launch Fixes ✅

All the fixes needed to get the packaged Electron app actually running on Windows.

### Bug fixes shipped in v1.0.1

| # | Fix | Details |
|---|-----|---------|
| 1 | **Missing production deps** | `@theia/file-search`, `@theia/debug`, `reflect-metadata` were required by `server.js` but absent from `package.json` — electron-builder pruned them, causing `MODULE_NOT_FOUND` on every launch |
| 2 | **Native module ABI mismatch** | `.node` addons (`@vscode/spdlog`, `native-watchdog`, `node-pty`, `@parcel/watcher`) were compiled against Node 22 (CI) instead of Electron 28's Node 18.18.2, causing a hard C-level crash with no JS error |
| 3 | **electron-builder npmRebuild broken in monorepo** | electron-builder's built-in rebuild silently failed in the npm workspaces layout; fixed by disabling it and adding an explicit `electron-rebuild` step in `beforePack.js` and CI |
| 4 | **`BackendApplicationConfigProvider` never initialised** | Theia's `WebviewBackendSecurityWarnings.initialize()` calls `.get()` during `BackendApplication.configure()` but `.set()` was never called; added explicit call at server module load time |
| 5 | **`THEIA_APP_PROJECT_PATH` pointed at read-only ASAR** | `server.js` unconditionally overwrote the env var with `__dirname` (inside ASAR = read-only); guarded the assignment + set it from `app.getPath('userData')` in `electron-main.ts` |
| 6 | **`src-gen/` not packaged** | `src-gen/**/*` was missing from electron-builder `files` array; added |
| 7 | **`resources/` not packaged** | Icon files not included in ASAR; added `resources/**/*` to `files` |
| 8 | **Frontend never built** | `package` script used `build` (TypeScript only) instead of `build:full` (TypeScript + Theia webpack); fixed |
| 9 | **Icon path wrong in ASAR** | `BrowserWindow` icon used `__dirname` which resolves to virtual ASAR path; changed to `app.getAppPath()` |
| 10 | **Native addons inside ASAR** | `.node` files must be outside the ASAR to be `dlopen()`'d; added `**/*.node` + all known native packages to `asarUnpack` |
| 11 | **`app.getName()` returned wrong value** | `app.getName()` defaulted to `loom-electron` (npm name) not `Loom`; added `app.setName('Loom')` so `userData` is `%APPDATA%\Loom` |
| 12 | **Silent crash on startup failure** | All errors called `app.quit()` with no dialog; rewrote with `dialog.showErrorBox` + synchronous file logger at `%APPDATA%\Loom\loom-debug.log` |

---

## v1.0.2 — Loom Features Wired ✅ (in progress)

### 🔌 Full Feature Wiring (this release)

All Loom-specific panels and agents are now connected to the Theia IDE shell.

| # | Fix | Details |
|---|-----|---------|
| 1 | **`@loom/app` missing from loom-electron deps** | `theia generate` never discovered loom-app so none of its modules were included in the frontend/backend bundles |
| 2 | **`theia.frontend.module` / `theia.backend.module` not declared** | `loom-app/package.json` had only config in its `"theia"` section; module paths added so `theia generate` includes the ContainerModules |
| 3 | **Wrong DI symbol (`Symbol.for` vs Theia symbol)** | `loom-frontend-module.ts` used `Symbol.for('FrontendApplicationContribution')` which is a different symbol from Theia's `Symbol('FrontendApplicationContribution')`; fixed by obtaining the symbol via `require()` from the definitive sub-module path |
| 4 | **Backend sub-modules never loaded** | `loom-app/src/backend/index.ts` only registered `LoomBackendContribution`; rewrote to load all sub-modules (core, agents, tools, graph, hooks, memory, docs) using `ContainerModule.registry()` with safe fallbacks |
| 5 | **`@theia/ai-*` packages missing from loom-electron** | Added @theia/ai-core, @theia/ai-chat, @theia/ai-ide, @theia/ai-anthropic, @theia/ai-openai, @theia/ai-ollama, @theia/notebook — electron-builder now packages them |
| 6 | **`better-sqlite3` / `web-tree-sitter` not in asarUnpack** | Native addons used by loom-memory and loom-graph were inside ASAR and couldn't be dlopen'd |
| 7 | **`FrontendApplicationConfigProvider` showed "Eclipse Theia"** | Committed `src-gen/frontend/index.js` had wrong applicationName; updated to "Loom" |

### 🕐 AI Checkpoint / Revert Timeline
> *"Click to revert to any point, like Windsurf"*

Before each agent writes files, Loom snapshots the affected content and stores a
checkpoint. A visual timeline in the Chat panel lets you restore any previous state
with one click — no manual `git stash` needed.

**Planned implementation:**

| File | Purpose |
|------|---------|
| `packages/loom-core/src/checkpoints/CheckpointService.ts` | Captures file snapshots before each agent write, stores in `.loom/checkpoints/` (SQLite or NDJSON) |
| `packages/loom-core/src/checkpoints/CheckpointStore.ts` | Reads/writes checkpoint records: `{ id, agentName, task, timestamp, files: { path, before, after }[] }` |
| `packages/loom-hooks/src/beforeAgentWrite.ts` | Lifecycle hook that fires before any agent touches a file — triggers snapshot |
| `packages/loom-ui/src/widgets/CheckpointTimelineWidget.ts` | Renders checkpoint cards in the Chat panel's History tab; "Restore" button reverts all changed files |
| `packages/loom-app/src/frontend/checkpoint-contribution.ts` | Registers the widget + keyboard shortcut (`Ctrl+Shift+Z` → open timeline) |

**UX flow:**
1. Agent task starts → `beforeAgentWrite` hook fires → `CheckpointService` saves snapshot
2. Checkpoint appears in Chat panel under a **History** tab as a card:
   `"CodeSmith · fixed retry throw · 3 files · 2 min ago [Restore]"`
3. Click **Restore** → all files reverted to their pre-agent state, editor refreshes
4. Checkpoint cards are session-scoped (cleared on app restart unless committed to git)

---

### 🍎 macOS Builds (x64 + arm64)
> Blocked on code-signing / notarization setup

- Add `build/entitlements.mac.plist`
- Configure Apple Developer cert in CI secrets
- Re-enable `build-macos` job in `release.yml`
- Test on both Intel and Apple Silicon

---

### Other v1.0.2 planned fixes
- [ ] Replace placeholder brand icon with final Loom icon set (`.icns` for macOS)
- [ ] Suppress `Cannot resolve package electron` webpack warning from `@theia/electron`
- [ ] Add `postinstall: electron-builder install-app-deps` to match native deps to Electron version
