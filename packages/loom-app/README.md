# Loom App

Loom IDE — Eclipse Theia application.

## Overview

`@loom/app` is the main Theia Electron application that brings together all Loom packages:

- Theia IDE with AI chat integration
- 12 specialized agents
- Flow awareness and timeline
- Knowledge graph (Phase 2B)
- Multi-agent orchestration (Phase 2C)

## Installation

```bash
npm install
npm run build
```

## Development

```bash
# Start development mode
npm run start

# Build for production
npm run build
```

## Architecture

```
src/
├── frontend/
│   ├── loom-frontend-module.ts    # DI module registration
│   ├── loom-flow-contribution.ts  # Flow event subscriptions
│   ├── loom-flow-context.ts       # LLM context injection
│   ├── loom-status-bar.ts         # Status bar contribution
│   └── loom-onboarding.ts         # Onboarding wizard
├── backend/
│   └── loom-backend-module.ts     # Backend services
└── index.ts                       # Entry point
```

## Theia Extensions Used

- `@theia/core` - Core framework
- `@theia/editor` - Editor integration
- `@theia/filesystem` - File operations
- `@theia/git` - Git integration
- `@theia/terminal` - Terminal service
- `@theia/ai-*` - AI chat and providers

## Workspace Integration

Links to local Theia installation at `../theia/` for development and testing.

## License

MIT
