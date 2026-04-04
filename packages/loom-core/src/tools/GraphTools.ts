import { injectable, inject } from 'inversify'
import { GraphService, GraphNode, EmbeddingService } from '@loom/graph'

/**
 * Graph Tools - 9 tools for knowledge graph queries
 * 
 * 1. graph_search_semantic - Vector similarity search
 * 2. graph_search_bm25 - Full-text BM25 search
 * 3. graph_query - Custom Cypher query
 * 4. graph_get_neighbourhood - Get connected nodes
 * 5. graph_find_path - Find path between nodes
 * 6. graph_get_related_files - Co-change analysis
 * 7. graph_find_function - Function lookup
 * 8. graph_get_callers - Call graph analysis
 * 9. graph_get_callees - Call graph analysis
 */

@injectable()
export class GraphSearchSemanticTool {
  readonly name = 'graph_search_semantic'
  readonly description = 'Search code using semantic similarity (vector embeddings)'

  constructor(
    @inject(GraphService) private graphService: GraphService,
    @inject(EmbeddingService) private embeddingService: EmbeddingService
  ) {}

  async execute(input: { query: string; limit?: number }): Promise<{
    results: Array<{
      id: string
      name: string
      type: string
      similarity: number
      signature?: string
    }>
  }> {
    const queryEmbedding = await this.embeddingService.generateEmbedding(input.query)
    const nodes = await this.graphService.semanticSearch(input.query, queryEmbedding, input.limit || 10)

    // Compute cosine similarity between query and each node's text representation
    const results = await Promise.all(nodes.map(async (n: GraphNode) => {
      const nodeText = [
        n.properties.name as string,
        n.properties.signature as string,
        n.properties.docstring as string,
      ].filter(Boolean).join(' ')
      const nodeEmbedding = await this.embeddingService.generateEmbedding(nodeText)
      const similarity = this.embeddingService.cosineSimilarity(queryEmbedding, nodeEmbedding)
      return {
        id: n.id,
        name: n.properties.name as string,
        type: n.labels[0],
        similarity: Math.max(0, Math.min(1, similarity)),
        signature: n.properties.signature as string,
      }
    }))

    // Sort by descending similarity
    results.sort((a: any, b: any) => b.similarity - a.similarity)
    return { results }
  }
}

@injectable()
export class GraphSearchBM25Tool {
  readonly name = 'graph_search_bm25'
  readonly description = 'Search code using BM25 full-text search'

  constructor(@inject(GraphService) private graphService: GraphService) {}

  async execute(input: { query: string; limit?: number }): Promise<{
    results: Array<{
      id: string
      name: string
      type: string
      score: number
    }>
  }> {
    // Would use BM25Search service
    // For now, fallback to name-based search
    const nodes = await this.graphService.findFunctionByName(input.query)
    
    return {
      results: nodes.map((n: GraphNode) => ({
        id: n.id,
        name: n.properties.name as string,
        type: n.labels[0],
        score: 1.0,
      })),
    }
  }
}

@injectable()
export class GraphCypherTool {
  readonly name = 'graph_cypher'
  readonly description = 'Execute a custom Cypher query on the knowledge graph'

  constructor(@inject(GraphService) private graphService: GraphService) {}

  async execute(input: { cypher: string; parameters?: Record<string, any> }): Promise<{
    columns: string[]
    rows: any[]
  }> {
    // This would execute raw Cypher through GraphService
    // For security, this should be sandboxed or validated
    
    return {
      columns: [],
      rows: [],
    }
  }
}

@injectable()
export class GraphGetNeighbourhoodTool {
  readonly name = 'graph_get_neighbourhood'
  readonly description = 'Get the neighbourhood (connected nodes) of a function or class'

  constructor(@inject(GraphService) private graphService: GraphService) {}

  async execute(input: { nodeId: string; depth?: number }): Promise<{
    nodes: GraphNode[]
    relationships: Array<{
      source: string
      target: string
      type: string
    }>
  }> {
    const result = await this.graphService.getFunctionNeighborhood(input.nodeId)
    
    return {
      nodes: result.nodes,
      relationships: result.relationships.map((r: { startNode: string; endNode: string; type: string }) => ({
        source: r.startNode,
        target: r.endNode,
        type: r.type,
      })),
    }
  }
}

@injectable()
export class GraphFindPathTool {
  readonly name = 'graph_find_path'
  readonly description = 'Find a path between two code entities'

  constructor(@inject(GraphService) private graphService: GraphService) {}

  async execute(input: { fromId: string; toId: string; maxDepth?: number }): Promise<{
    path: Array<{
      id: string
      name: string
      type: string
    }>
    relationships: string[]
  } | null> {
    const maxDepth = input.maxDepth ?? 6
    try {
      // Kuzu shortest path: variable-length relationship traversal with SHORTEST keyword
      const rows = await this.graphService.query(`
        MATCH p = (a)-[:CALLS* SHORTEST 1 MAX ${maxDepth}]->(b)
        WHERE a.id = '${input.fromId}' AND b.id = '${input.toId}'
        RETURN nodes(p) AS nodes, rels(p) AS rels
        LIMIT 1
      `)
      if (!rows || rows.length === 0) return null

      const row = rows[0] as { nodes?: any[]; rels?: any[] }
      const pathNodes: Array<{ id: string; name: string; type: string }> =
        (row.nodes ?? []).map((n: any) => ({
          id: n.id ?? n._id ?? String(n),
          name: n.name ?? n.id ?? String(n),
          type: n._label ?? 'Node',
        }))
      const relationships: string[] =
        (row.rels ?? []).map((r: any) => r._label ?? r.type ?? 'RELATED')

      return { path: pathNodes, relationships }
    } catch {
      return null
    }
  }
}

@injectable()
export class GraphGetRelatedFilesTool {
  readonly name = 'graph_get_related_files'
  readonly description = 'Find files that are often changed together (co-change analysis)'

  constructor(@inject(GraphService) private graphService: GraphService) {}

  async execute(input: { filePath: string; limit?: number }): Promise<{
    relatedFiles: Array<{
      path: string
      coChangeCount: number
    }>
  }> {
    // Query CO_CHANGED relationships from Git analysis
    return {
      relatedFiles: [],
    }
  }
}

@injectable()
export class GraphFindFunctionTool {
  readonly name = 'graph_find_function'
  readonly description = 'Find a function by exact or partial name match'

  constructor(@inject(GraphService) private graphService: GraphService) {}

  async execute(input: { name: string; exact?: boolean }): Promise<{
    functions: Array<{
      id: string
      name: string
      signature: string
      filePath?: string
      line?: number
    }>
  }> {
    const nodes = await this.graphService.findFunctionByName(input.name)
    
    return {
      functions: nodes.map((n: { id: string; properties: { name: string; signature: string; filePath: string; line: number } }) => ({
        id: n.id,
        name: n.properties.name as string,
        signature: n.properties.signature as string,
        filePath: n.properties.filePath as string,
        line: n.properties.line as number,
      })),
    }
  }
}

@injectable()
export class GraphGetCallersTool {
  readonly name = 'graph_get_callers'
  readonly description = 'Find all functions that call a given function'

  constructor(@inject(GraphService) private graphService: GraphService) {}

  async execute(input: { functionId: string }): Promise<{
    callers: Array<{
      id: string
      name: string
      filePath?: string
    }>
  }> {
    const result = await this.graphService.getFunctionNeighborhood(input.functionId)
    
    // Filter for CALLS relationships where this function is the target
    const callers = result.relationships
      .filter((r: any) => r.type === 'CALLS' && r.endNode === input.functionId)
      .map((r: any) => result.nodes.find((n: any) => n.id === r.startNode))
      .filter(Boolean)
    
    return {
      callers: callers.map((n: any) => ({
        id: n!.id,
        name: n!.properties.name as string,
        filePath: n!.properties.filePath as string,
      })),
    }
  }
}

@injectable()
export class GraphGetCalleesTool {
  readonly name = 'graph_get_callees'
  readonly description = 'Find all functions called by a given function'

  constructor(@inject(GraphService) private graphService: GraphService) {}

  async execute(input: { functionId: string }): Promise<{
    callees: Array<{
      id: string
      name: string
      filePath?: string
    }>
  }> {
    const result = await this.graphService.getFunctionNeighborhood(input.functionId)
    
    // Filter for CALLS relationships where this function is the source
    const callees = result.relationships
      .filter((r: any) => r.type === 'CALLS' && r.startNode === input.functionId)
      .map((r: any) => result.nodes.find((n: any) => n.id === r.endNode))
      .filter(Boolean)
    
    return {
      callees: callees.map((n: any) => ({
        id: n!.id,
        name: n!.properties.name as string,
        filePath: n!.properties.filePath as string,
      })),
    }
  }
}
