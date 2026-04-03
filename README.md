# Loom — Multi-Agent AI IDE

Loom weaves together parallel AI agents, spec-driven development, a unified knowledge graph, flow awareness, and the world's largest open skill ecosystem into a single MIT-licensed IDE. Built on Eclipse Theia + OpenCode. No account required. No Docker required. No telemetry by default. Install like VS Code. Works offline.

## What Loom Is

Most AI coding tools give you one assistant you talk to. Loom gives you a team of twelve specialized AI agents that run in parallel, share a structural understanding of your codebase, and coordinate with each other to get real work done.

You describe what you want — implement OAuth2, audit this service for security issues, write tests for this module — and Loom dispatches the right agents, runs them concurrently, and shows you the results side by side.

## Key Features

- **12 Specialized Agents**: Orchestrator, Engineer, Architect, Security, QA, DevOps, Researcher, Documentarian, Data, Debugger, Reviewer, Explorer
- **Knowledge Graph**: Structural understanding of your codebase using Vela-Engineering/kuzu
- **Flow Awareness**: Infers your intent from editing patterns
- **Token Optimization**: Silent protocol reduces costs by ~78%
- **Works Offline**: Connect Ollama and every feature works without internet
- **No Account Required**: Install like VS Code, store API keys in OS keychain

## Installation

```bash
# Clone the repository
git clone https://github.com/loom-ai/loom.git
cd loom

# Install dependencies
npm install

# Build the application
npm run build

# Start the development server
npm run dev
```

## Development

Loom is built as a monorepo using npm workspaces:

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Watch for changes
npm run build -- --watch

# Run tests
npm run test
```

## Project Structure

```
packages/
├── loom-app/          Theia application manifest
├── loom-core/         Core orchestration services
├── loom-agents/       12 Fleet agents
├── loom-graph/        Knowledge graph service
├── loom-ui/           Lumino widgets
├── loom-hooks/        Agent hooks system
├── loom-memory/       Three-tier memory system
└── loom-docs/         LoomDocs - local package documentation
```

## Configuration

Loom uses TOML for all configuration files (35% fewer tokens than JSON):

```
.[loom]/
├── hooks/         *.toml — hook definitions
├── specs/         */spec.toml + requirements.md + design.md + tasks.md
├── agents/        *.md — project-level agent overrides
├── steering/      *.md — always-on context files
├── powers/        *.toml — installed power manifests
├── mcp.toml       MCP server configuration
├── settings.toml  concurrency, context budget limits
└── server.lock    running OpenCode server port + PID
```

## License

MIT License — see LICENSE file for details

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.
