# Loom Hooks

Agent hooks system for event-driven automation. **Phase 4 - Not Implemented**

## Status

⚠️ **PLACEHOLDER** - This package is a stub awaiting Phase 4 implementation.

## Planned Implementation

Event-driven triggers that run agent pipelines on IDE events:

### 15 Event Types

- `fileSaved` - After file save
- `gitPreCommit` - Before commit
- `testFailed` - On test failure
- `lintError` - On lint error
- `buildFailed` - On build failure
- `newBranch` - On branch creation
- `mergeConflict` - On merge conflict
- `prOpen` - On PR open
- `codeReviewComment` - On review comment
- `breakpointHit` - On breakpoint
- `exceptionThrown` - On exception
- `performanceDrop` - On perf regression
- `dependencyUpdate` - On dep update
- `securityAlert` - On security issue
- `deployStart` - On deployment

### 4 Action Types

```toml
# .loom/hooks/test-failed.toml
[event]
type = "testFailed"

[[actions]]
type = "runCLI"
command = "loom ask engineer 'Fix failing tests'"

[[actions]]
type = "askAgent"
agent = "debugger"
prompt = "Analyze test failure in {{file}}"
```

### TOML Hook Format

```toml
name = "test-failure-handler"
description = "Auto-debug failing tests"

[event]
type = "testFailed"
filter = { package = "core" }  # optional

[[actions]]
type = "runCLI"
command = "loom run test --failed"

[[actions]]
type = "askAgent"
agent = "debugger"
prompt = "{{event.error}}"

[options]
block = false  # don't block IDE
notify = true  # show notification
```

## Dependencies (Installed)

- `smol-toml` - TOML parsing
- `inversify` - DI
- `@loom/core` - Core services

## Architecture (Planned)

```
src/
├── HookService.ts       # Event subscription, TOML loading
├── HookRunner.ts        # Pipeline execution
├── actions/             # runCLI, askAgent, runScript, updateContext
├── events/              # 15 event type handlers
└── index.ts
```

See `loom-master-v7.md` Section "Phase 4 — Agent Hooks" for full specification.

## License

MIT
