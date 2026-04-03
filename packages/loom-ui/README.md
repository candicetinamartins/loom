# Loom UI

UI components using Lumino widgets for the Loom AI IDE.

## Overview

`@loom/ui` provides Theia-integrated UI widgets:

- **AgentPanel** - Fleet agent status and execution cards
- **FlowTimeline** - 22px flow awareness widget
- **LoomStatusBar** - Brand, agents, graph, cost indicators
- **LoomOnboarding** - 5-step API key setup wizard
- **ComponentBrowser** - Design system viewer

## Installation

```bash
npm install @loom/ui
```

## Usage

```typescript
import { FlowTimelineWidget } from '@loom/ui'

const timeline = new FlowTimelineWidget(flowTrackingService)
app.shell.addWidget(timeline, { area: 'top' })
```

## Architecture

```
src/
├── widgets/         # Lumino widgets (AgentPanel, FlowTimeline, etc.)
├── design/          # CSS tokens, components
└── index.ts         # Public exports
```

## Design System

- CSS variables for theming (`tokens.css`)
- Lumino widget lifecycle
- Theia integration patterns

## Dependencies

- `@lumino/widgets` - Widget framework
- `@lumino/coreutils` - Utilities
- `@theia/core` - Theia integration

## License

MIT
