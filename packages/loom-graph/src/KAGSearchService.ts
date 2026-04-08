import { injectable, inject } from 'inversify'
import { GraphService } from './GraphService'
import { EmbeddingService } from './EmbeddingService'
import { BM25Search } from './BM25Search'

export interface KAGSearchResult {
  nodeId: string
  nodeType: 'Function' | 'Class' | 'File' | 'Memory'
  name: string
  content?: string
  score: number
  matchType: 'semantic' | 'keyword' | 'graph' | 'hybrid'
  path?: string
  lineNumber?: number
}

export interface KAGSearchQuery {
  text: string
  embedding?: number[]
  filters?: {
    nodeTypes?: string[]
    languages?: string[]
    minComplexity?: number
    maxComplexity?: number
  }
  limit?: number
}

/**
 * KAGSearchService — Knowledge Augmented Generation search
 * 
 * Combines:
 * 1. Semantic search (vector embeddings)
 * 2. BM25 keyword search
 * 3. Graph neighborhood expansion
 * 
 * This provides comprehensive context retrieval for agents,
 * finding relevant code through multiple complementary methods.
 */
@injectable()
export class KAGSearchService {
  constructor(
    @inject(GraphService) private graphService: GraphService,
    @inject(EmbeddingService) private embeddingService: EmbeddingService,
    @inject(BM25Search) private bm25Search: BM25Search,
  ) {}

  async initialize(): Promise<void> {
    // Services initialize on-demand
  }

  /**
   * Execute KAG search combining all three methods
   */
  async search(query: KAGSearchQuery): Promise<KAGSearchResult[]> {
    const limit = query.limit || 10
    const results: Map<string, KAGSearchResult> = new Map()

    // 1. Semantic search (if embedding available)
    if (query.embedding || query.text) {
      const semanticResults = await this.semanticSearch(query, Math.ceil(limit / 2))
      for (const r of semanticResults) {
        results.set(r.nodeId, r)
      }
    }

    // 2. BM25 keyword search
    const keywordResults = await this.keywordSearch(query, Math.ceil(limit / 2))
    for (const r of keywordResults) {
      const existing = results.get(r.nodeId)
      if (existing) {
        // Boost score if found by both methods
        existing.score = Math.max(existing.score, r.score) + 0.1
        existing.matchType = 'hybrid' as const
      } else {
        results.set(r.nodeId, r)
      }
    }

    // 3. Graph neighborhood expansion for top results
    const graphResults = await this.graphExpansion(
      Array.from(results.values()).slice(0, 3),
      Math.ceil(limit / 3)
    )
    for (const r of graphResults) {
      if (!results.has(r.nodeId)) {
        results.set(r.nodeId, r)
      }
    }

    // Sort by score and return top results
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /**
   * Semantic search using vector embeddings
   */
  private async semanticSearch(query: KAGSearchQuery, limit: number): Promise<KAGSearchResult[]> {
    try {
      let embedding: number[]
      
      if (query.embedding) {
        embedding = query.embedding
      } else {
        embedding = await this.embeddingService.generateEmbedding(query.text)
      }

      // Query vector index in Kuzu
      const cypher = `
        CALL QUERY_VECTOR_INDEX('Function', 'fn_embedding_idx', $embedding, ${limit * 2})
        YIELD node, score
        RETURN node.id as id, node.name as name, node.signature as content, score
        UNION ALL
        CALL QUERY_VECTOR_INDEX('Class', 'class_embedding_idx', $embedding, ${limit})
        YIELD node, score
        RETURN node.id as id, node.name as name, null as content, score
      `

      const results = await this.graphService.query(cypher, { embedding })

      return results.map((r: any) => ({
        nodeId: r.id,
        nodeType: r.content ? 'Function' : 'Class',
        name: r.name,
        content: r.content,
        score: r.score,
        matchType: 'semantic',
      }))
    } catch (error) {
      console.warn('[KAGSearch] Semantic search failed:', error)
      return []
    }
  }

  /**
   * BM25 keyword search for exact matches
   */
  private async keywordSearch(query: KAGSearchQuery, limit: number): Promise<KAGSearchResult[]> {
    try {
      const results = await this.bm25Search.search(query.text, limit * 2)

      return results.map((r: any) => ({
        nodeId: r.id,
        nodeType: this.inferNodeType(r),
        name: r.name || r.title || 'Unknown',
        content: r.content,
        score: r.score * 0.8, // Slightly lower weight than semantic
        matchType: 'keyword',
        path: r.path,
      }))
    } catch (error) {
      console.warn('[KAGSearch] Keyword search failed:', error)
      return []
    }
  }

  /**
   * Graph neighborhood expansion
   * Find related nodes through graph relationships
   */
  private async graphExpansion(seedResults: KAGSearchResult[], limit: number): Promise<KAGSearchResult[]> {
    if (seedResults.length === 0) return []

    const results: KAGSearchResult[] = []
    const seenIds = new Set<string>()

    for (const seed of seedResults.slice(0, 2)) {
      try {
        // Find neighbors in graph
        const cypher = `
          MATCH (n {id: '${seed.nodeId}'})-[r]-(m)
          WHERE m.id IS NOT NULL
          RETURN m.id as id, m.name as name, labels(m)[0] as type, 
                 type(r) as relType, r.weight as weight
          LIMIT ${Math.ceil(limit / 2)}
        `

        const neighbors = await this.graphService.query(cypher)

        for (const n of neighbors) {
          if (seenIds.has(n.id)) continue
          seenIds.add(n.id)

          results.push({
            nodeId: n.id,
            nodeType: n.type || 'Unknown',
            name: n.name || 'Unknown',
            score: (n.weight || 0.5) * 0.6, // Lower weight for graph expansion
            matchType: 'graph',
          })
        }
      } catch (error) {
        console.warn('[KAGSearch] Graph expansion failed for seed:', seed.nodeId)
      }
    }

    return results.slice(0, limit)
  }

  /**
   * Search for code examples by intent description
   */
  async findCodeExamples(intentDescription: string, language?: string): Promise<KAGSearchResult[]> {
    const embedding = await this.embeddingService.generateEmbedding(intentDescription)
    
    const query: KAGSearchQuery = {
      text: intentDescription,
      embedding,
      filters: language ? { languages: [language] } : undefined,
      limit: 5,
    }

    const results = await this.search(query)
    
    // Prefer functions with examples/docstrings
    return results.filter(r => 
      r.nodeType === 'Function' || 
      r.content?.includes('example') ||
      r.content?.includes('```')
    )
  }

  /**
   * Find related functions to a given function
   */
  async findRelatedFunctions(functionId: string): Promise<KAGSearchResult[]> {
    try {
      // Get function embedding
      const funcResult = await this.graphService.query(`
        MATCH (f:Function {id: '${functionId}'})
        RETURN f.embedding as embedding, f.name as name
      `)

      if (funcResult.length === 0 || !funcResult[0].embedding) {
        // Fallback to name-based similarity
        return this.findByNameSimilarity(funcResult[0]?.name || '')
      }

      const query: KAGSearchQuery = {
        text: funcResult[0].name,
        embedding: JSON.parse(funcResult[0].embedding),
        limit: 5,
      }

      const results = await this.search(query)
      return results.filter(r => r.nodeId !== functionId)
    } catch (error) {
      console.warn('[KAGSearch] Find related failed:', error)
      return []
    }
  }

  /**
   * Find functions by name similarity (fallback)
   */
  private async findByNameSimilarity(name: string): Promise<KAGSearchResult[]> {
    const cypher = `
      MATCH (f:Function)
      WHERE f.name CONTAINS '${name.split(/(?=[A-Z])/).pop()}' 
         OR f.name CONTAINS '${name.toLowerCase()}'
      RETURN f.id as id, f.name as name, f.signature as content
      LIMIT 5
    `

    const results = await this.graphService.query(cypher)
    return results.map((r: any) => ({
      nodeId: r.id,
      nodeType: 'Function',
      name: r.name,
      content: r.content,
      score: 0.5,
      matchType: 'keyword',
    }))
  }

  private inferNodeType(result: any): 'Function' | 'Class' | 'File' | 'Memory' {
    if (result.signature || result.parameters) return 'Function'
    if (result.methods || result.fields) return 'Class'
    if (result.path?.endsWith('.md')) return 'Memory'
    return 'File'
  }

  /**
   * Index a new node with embedding
   */
  async indexNode(
    nodeId: string,
    nodeType: string,
    text: string,
    properties: Record<string, any>
  ): Promise<void> {
    try {
      const embedding = await this.embeddingService.generateEmbedding(text)
      
      await this.graphService.query(`
        MERGE (n:${nodeType} {id: '${nodeId}'})
        SET n.embedding = '${JSON.stringify(embedding)}',
            n.indexedAt = datetime()
            ${Object.entries(properties).map(([k, v]) => `, n.${k} = '${v}'`).join('')}
      `)
    } catch (error) {
      console.warn('[KAGSearch] Index node failed:', error)
    }
  }
}
