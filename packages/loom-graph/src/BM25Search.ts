import { injectable, inject } from 'inversify'
import { GraphService } from './GraphService'

/**
 * BM25Search - In-memory BM25 full-text search over the knowledge graph.
 *
 * Uses a standard BM25 (Okapi BM25) inverted-index, implemented entirely in
 * TypeScript.  No Kuzu FTS extension is required; the index is rebuilt from
 * the live graph on every initializeFTS() call and updated incrementally via
 * indexDocument().
 *
 * k1 = 1.5  (term-frequency saturation — higher = more weight on raw TF)
 * b  = 0.75 (length normalisation — 1 = full normalisation, 0 = none)
 *
 * Indexed entity types: Function, Module, File, Class, DocSection
 */

interface DocMeta {
  type: string
  name: string
  content: string
  length: number   // token count, used for BM25 length normalisation
}

@injectable()
export class BM25Search {

  // Standard BM25 hyperparameters
  private readonly k1 = 1.5
  private readonly b  = 0.75

  // inverted index  term → docId → raw term-frequency
  private index: Map<string, Map<string, number>> = new Map()

  // document store  docId → metadata + token count
  private docs: Map<string, DocMeta> = new Map()

  // running total of all document lengths (for avgdl)
  private totalTokens = 0

  constructor(@inject(GraphService) private graphService: GraphService) {}

  // ---------------------------------------------------------------------------
  // Tokenisation
  // ---------------------------------------------------------------------------

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      // split on anything that is not alphanumeric or underscore
      .replace(/[^a-z0-9_]/g, ' ')
      // split camelCase / PascalCase / snake_case into sub-terms
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_+/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  /**
   * (Re)build the in-memory BM25 index from all nodes currently in the graph.
   * Call this once after graph indexing is complete, or on workspace open.
   */
  async initializeFTS(): Promise<void> {
    this.index.clear()
    this.docs.clear()
    this.totalTokens = 0

    try {
      // Pull Functions
      const fns = await this.graphService.query(
        'MATCH (f:Function) RETURN f.id AS id, f.name AS name, f.doc AS doc'
      )
      for (const row of fns) {
        await this.indexDocument(
          row['id'] as string,
          'Function',
          row['name'] as string,
          (row['doc'] as string) ?? ''
        )
      }

      // Pull Modules
      const mods = await this.graphService.query(
        'MATCH (m:Module) RETURN m.id AS id, m.path AS path, m.summary AS summary'
      )
      for (const row of mods) {
        const path = row['path'] as string
        await this.indexDocument(
          row['id'] as string,
          'Module',
          path.split('/').pop() ?? path,
          (row['summary'] as string) ?? ''
        )
      }

      // Pull Classes
      const classes = await this.graphService.query(
        'MATCH (c:Class) RETURN c.id AS id, c.name AS name, c.doc AS doc'
      )
      for (const row of classes) {
        await this.indexDocument(
          row['id'] as string,
          'Class',
          row['name'] as string,
          (row['doc'] as string) ?? ''
        )
      }

      // Pull DocSections
      const sections = await this.graphService.query(
        'MATCH (s:DocSection) RETURN s.id AS id, s.title AS title, s.content AS content'
      )
      for (const row of sections) {
        await this.indexDocument(
          row['id'] as string,
          'DocSection',
          row['title'] as string,
          (row['content'] as string) ?? ''
        )
      }

      console.log(`[BM25Search] Index ready — ${this.docs.size} documents`)
    } catch (err) {
      // Graph may be empty (e.g. CI stub); index stays empty, search returns []
      console.log('[BM25Search] Graph not available; index is empty')
    }
  }

  /**
   * Add or update a single document in the index.
   * Calling with an existing id replaces the previous entry.
   */
  async indexDocument(
    id: string,
    type: string,
    name: string,
    content: string
  ): Promise<void> {
    // Remove stale entry if the document is being updated
    if (this.docs.has(id)) {
      const old = this.docs.get(id)!
      this.totalTokens -= old.length
      const oldTokens = this.tokenize(`${old.name} ${old.content}`)
      const seen = new Set<string>()
      for (const term of oldTokens) {
        if (!seen.has(term)) {
          seen.add(term)
          const postings = this.index.get(term)
          if (postings) {
            postings.delete(id)
            if (postings.size === 0) this.index.delete(term)
          }
        }
      }
    }

    const tokens  = this.tokenize(`${name} ${content}`)
    const length  = tokens.length
    this.docs.set(id, { type, name, content, length })
    this.totalTokens += length

    // Build per-term frequencies
    const tf = new Map<string, number>()
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1)
    }

    for (const [term, freq] of tf) {
      let postings = this.index.get(term)
      if (!postings) {
        postings = new Map()
        this.index.set(term, postings)
      }
      postings.set(id, freq)
    }
  }

  /**
   * Remove a document from the index by id.
   */
  removeDocument(id: string): void {
    const meta = this.docs.get(id)
    if (!meta) return
    this.totalTokens -= meta.length
    const tokens = this.tokenize(`${meta.name} ${meta.content}`)
    const seen = new Set<string>()
    for (const term of tokens) {
      if (!seen.has(term)) {
        seen.add(term)
        const postings = this.index.get(term)
        if (postings) {
          postings.delete(id)
          if (postings.size === 0) this.index.delete(term)
        }
      }
    }
    this.docs.delete(id)
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /**
   * Search the index using BM25 and return up to `limit` results in descending
   * relevance order.
   */
  async search(
    query: string,
    limit = 10
  ): Promise<Array<{
    id:      string
    type:    string
    name:    string
    content: string
    score:   number
  }>> {
    if (this.docs.size === 0) return []

    const queryTerms = this.tokenize(query)
    if (queryTerms.length === 0) return []

    const N     = this.docs.size
    const avgdl = this.totalTokens / N
    const scores = new Map<string, number>()

    for (const term of queryTerms) {
      const postings = this.index.get(term)
      if (!postings) continue

      // IDF  = log((N − n + 0.5) / (n + 0.5) + 1)   (Robertson–Spärck Jones)
      const n   = postings.size
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1)

      for (const [docId, tf] of postings) {
        const doc = this.docs.get(docId)!
        // BM25 term-frequency normalisation
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (doc.length / avgdl)))
        scores.set(docId, (scores.get(docId) ?? 0) + idf * tfNorm)
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => {
        const doc = this.docs.get(id)!
        return { id, type: doc.type, name: doc.name, content: doc.content, score }
      })
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  get documentCount(): number { return this.docs.size }
  get termCount():     number { return this.index.size }
}
