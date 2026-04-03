# Loom Core

Core orchestration services for the Loom AI IDE.

## Overview

`@loom/core` provides the foundational services that power Loom's agent system:

- **Agent System** - 12 specialized AI agents with DI registration
- **Context Management** - @mention resolution, budget management, providers
- **Tools** - 15+ CLI-first tools for file operations, search, git, shell, web
- **Services** - Rate limiting, conversation history, secret management
- **Flow Tracking** - Event ring buffer, intent inference, timeline

## Installation

```bash
npm install @loom/core
```

## Usage

```typescript
import { Container } from 'inversify'
import { loomCoreModule } from '@loom/core'

const container = new Container()
container.load(loomCoreModule)

// Resolve services
const flowService = container.get<FlowTrackingService>(FLOW_TYPES.FlowTrackingService)
```

## Architecture

```
src/
├── agents/          # AgentRegistry, 12 fleet agents
├── context/         # Budget manager, providers, registry
├── services/        # RateLimiter, SecretService, HistoryService
├── tools/           # 15+ CLI-first tools
├── config/          # TOML parsing, settings
└── utils/           # TOML migration helpers
```

## Dependencies

- `inversify` - Dependency injection
- `zod` - Schema validation
- `ai` - Vercel AI SDK
- `smol-toml` - TOML parsing
- `keytar` - System keychain

## License

MIT
