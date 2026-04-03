# Loom Memory

Three-tier memory system for agents. **Phase 6 - Not Implemented**

## Status

⚠️ **PLACEHOLDER** - This package is a stub awaiting Phase 6 implementation.

## Planned Implementation

### Three Memory Tiers

```
┌─────────────────────────────────────────────────────────┐
│  TIER 1: OpenCode SQLite (ephemeral, session-scoped)   │
│  - Handled by OpenCode process                          │
│  - Auto-cleared on session end                            │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  TIER 2: User Memory (SQLite + Drizzle, persistent)     │
│  - ~/.config/loom/memory.sqlite                         │
│  - Personal preferences, project relationships            │
│  - Schema: preferences, projects, agents, sessions      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  TIER 3: Project Memory (Kuzu nodes, graph-backed)      │
│  - Stored in graph as :Memory nodes                       │
│  - Project-specific context, decisions, patterns      │
│  - Blocked on Phase 2B graph implementation             │
└─────────────────────────────────────────────────────────┘
```

### Tier 2 Schema (Drizzle)

```typescript
// preferences table
{ key: 'default_agent', value: 'engineer', updated_at }

// projects table
{ id, path, name, last_accessed, session_count }

// agent_interactions table
{ agent_name, project_id, interaction_count, last_used }

// sessions table
{ id, project_id, started_at, ended_at, haiku_summary }
```

### Commands

```
/remember "Always use strict TypeScript"   → Tier 2
/remember @file "This is the auth module"   → Tier 3 (blocked)
/forget preference default_agent             → Tier 2
/forget memory "auth module"                  → Tier 3
```

## Dependencies (Installed)

- `drizzle-orm` - ORM
- `better-sqlite3` - SQLite driver
- `@loom/core` - Core services
- `@loom/graph` - Tier 3 storage (blocked)

## Architecture (Planned)

```
src/
├── tiers/
│   ├── Tier1OpenCode.ts     # External - no implementation
│   ├── Tier2UserMemory.ts   # SQLite + Drizzle
│   └── Tier3ProjectMemory.ts # Kuzu nodes (blocked)
├── MemoryService.ts         # Unified interface
├── commands/                # /remember, /forget handlers
└── index.ts
```

## Blocked

- Tier 3 requires Phase 2B graph completion

See `loom-master-v7.md` Section "Phase 6 — Three-Tier Memory System" for full specification.

## License

MIT
