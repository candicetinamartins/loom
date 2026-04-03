# Loom Docs

Local package documentation indexing. **Phase 2B-5 - Not Implemented**

## Status

⚠️ **PLACEHOLDER** - This package is a stub awaiting dependency completion.

## Planned Implementation

Indexes package README files for `@docs` mention system.

### PageIndex Graph Schema

```cypher
(:DocPage {path, title, package, embedding})
(:DocSection {heading, content, embedding})
(:DocExample {code, language, embedding})

(:DocPage)-[:HAS_SECTION]->(:DocSection)
(:DocSection)-[:HAS_EXAMPLE]->(:DocExample)
(:DocPage)-[:RELATED]->(:Function)  # cross-layer link
```

### Usage

```typescript
// @docs:loom-core mentions this package
await contextProviderRegistry.resolve('@docs:loom-core')
// Returns: Parsed README sections as context
```

### Indexing Pipeline

1. Find all `packages/*/README.md`
2. Parse with `remark` → AST
3. Extract sections and code examples
4. Generate embeddings
5. Store in graph

## Dependencies (Installed)

- `remark` - Markdown parser
- `remark-html` - HTML renderer
- `unist-util-visit` - AST traversal
- `@loom/graph` - Graph storage (blocked)
- `@loom/core` - Core services

## Blocked

- Requires Phase 2B graph for storage

## Architecture (Planned)

```
src/
├── parser/              # Remark-based README parser
├── indexer/             # Indexing pipeline
├── LoomDocsService.ts   # Main service
└── index.ts
```

See `loom-master-v7.md` Section "Phase 2B — Knowledge Graph Indexing" (B-5 LoomDocs) for full specification.

## License

MIT
