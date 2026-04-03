# Loom Agents

Fleet agents registered into Theia AI for the Loom IDE.

## Overview

`@loom/agents` registers 12 specialized AI agents into Theia's chat system:

| Agent | Model | Role |
|-------|-------|------|
| orchestrator | claude-opus-4-6 | Task decomposition, wave planning |
| engineer | claude-sonnet-4-5 | Implement, test, fix |
| architect | claude-opus-4-6 | Design, ADRs, Mermaid |
| reviewer | claude-sonnet-4-5 | Correctness, security, perf |
| devops | claude-sonnet-4-5 | Docker, K8s, IaC, CI/CD |
| security | claude-sonnet-4-5 | OWASP, CVE, SAST |
| qa | claude-haiku-4-5 | Test strategy, coverage |
| researcher | perplexity/sonar-pro | Docs, APIs, best practices |
| documentarian | claude-haiku-4-5 | READMEs, ADRs, changelogs |
| data | claude-sonnet-4-5 | SQL, schemas, migrations |
| debugger | claude-sonnet-4-5 | RCA, DAP integration |
| explorer | claude-haiku-4-5 | Fast navigation, read-only |

## Installation

```bash
npm install @loom/agents
```

## Usage

```typescript
import { Container } from 'inversify'
import { loomAgentsModule } from '@loom/agents'

const container = new Container()
container.load(loomAgentsModule)
```

## Architecture

```
src/
├── fleet/           # 12 agent definitions
│   ├── orchestrator.ts
│   ├── engineer.ts
│   ├── architect.ts
│   └── ...
├── AgentRegistry.ts # Registration with Theia AI
└── index.ts         # Public exports
```

## Agent Configuration

Each agent has:
- `model` - LLM provider/model
- `thinkingBudget` - Token budget for reasoning
- `toolGroups` - Allowed tool sets
- `systemPrompt` - Agent behavior definition

## Dependencies

- `@theia/ai-core` - Theia AI integration
- `@loom/core` - Core services
- `inversify` - DI

## License

MIT
