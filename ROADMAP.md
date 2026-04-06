# Loom Roadmap

## v1.0.0 — Current Release ✅
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

## v1.0.1 — Next Release 🔜

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

### Other v1.0.1 fixes
- [ ] Replace placeholder brand icon with final Loom icon set (`.icns` for macOS)
- [ ] Suppress `Cannot resolve package electron` webpack warning from `@theia/electron`
- [ ] Add `postinstall: electron-builder install-app-deps` to match native deps to Electron version
