# Loom Graph

Knowledge graph service using Vela-Engineering/kuzu. **Phase 2B - Not Implemented**

## Status

⚠️ **PLACEHOLDER** - This package is a stub awaiting Phase 2B implementation.

## Planned Implementation

```
Phase B-1: Kuzu Integration
- Vela-Engineering/kuzu embedded graph DB
- Node/relationship schema
- Basic CRUD operations

Phase B-2: Tree-sitter AST Parsing
- 13 language WASM grammars
- Function/class/variable extraction
- Git history analysis

Phase B-3: Indexing Pipeline
- Vector embeddings (FLOAT[1536])
- BM25 full-text search
- Cross-layer linking

Phase B-4: Graph Tools
- graph_search_semantic()
- graph_search_bm25()
- graph_query()
- graph_get_neighbourhood()
- And 5 more tools

Phase B-5: LoomDocs Integration
- Package README indexing
- DocPage/DocSection/DocExample nodes
```

## Dependencies (Installed)

- `@vela-engineering/kuzu` - Embedded graph database
- `web-tree-sitter` - AST parsing
- `simple-git` - Git history analysis
- `drizzle-orm` - Query builder
- `better-sqlite3` - SQLite integration

## Schema (Planned)

```cypher
// Function nodes
(:Function {name, signature, doc, embedding, complexity})

// Module/File nodes
(:Module {path, language, churn_score})
(:File {path, last_modified})

// Relationships
(:Module)-[:CONTAINS]->(:Function)
(:Function)-[:CALLS]->(:Function)
(:Function)-[:IMPORTS]->(:Module)
(:File)-[:CO_CHANGED {count}]->(:File)
```

See `loom-master-v7.md` Section "Phase 2B — Knowledge Graph Indexing" for full specification.

## License

MIT
