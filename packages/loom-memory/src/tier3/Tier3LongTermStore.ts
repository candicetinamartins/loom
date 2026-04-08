import { injectable, inject, optional } from 'inversify'

interface GraphService {
  query(cypher: string): Promise<any[]>
}

interface WeightedRelationship {
  fromId: string
  toId: string
  type: string
  weight: number
  lastStrengthened: Date
}

interface OrphanedNode {
  id: string
  type: 'Memory' | 'File' | 'Symbol' | 'Session'
  lastAccessed: Date
  edgeCount: number
}

interface ConsolidationCandidate {
  existingMemoryId: string
  newMemoryKey: string
  similarity: number
}

/**
 * Tier 3 — Long-Term Memory Store
 *
 * Features:
 * - Weighted edges that strengthen with each session approval
 * - Orphan node pruning (nodes with no edges, old unused nodes)
 * - Cross-session memory consolidation (merge duplicates)
 * - Cross-session querying ("has anyone solved this before?")
 *
 * This tier sits above the Working Graph (Tier 2/Kuzu) and adds
 * long-term persistence semantics through edge weights and consolidation.
 */
@injectable()
export class Tier3LongTermStore {
  private readonly WEIGHT_INCREMENT = 1.0
  private readonly WEIGHT_DECAY_DAYS = 30
  private readonly ORPHAN_THRESHOLD_DAYS = 90
  private readonly MIN_EDGE_WEIGHT = 0.1

  constructor(
    @inject('GraphService') @optional() private graphService?: GraphService,
  ) {}

  /**
   * Promote a session's memories to long-term storage.
   * Called when user approves session memories.
   */
  async promoteSessionToLongTerm(sessionId: string): Promise<{
    memoriesPromoted: number
    edgesStrengthened: number
    orphansPruned: number
    consolidated: number
  }> {
    if (!this.graphService) {
      return { memoriesPromoted: 0, edgesStrengthened: 0, orphansPruned: 0, consolidated: 0 }
    }

    const escaped = (s: string) => s.replace(/'/g, "''")

    // 1. Get all memories from this session
    const sessionMemories = await this.graphService.query(`
      MATCH (m:Memory)-[:EXTRACTED_FROM]->(s:Session {id: '${escaped(sessionId)}'})
      RETURN m.id as id, m.key as key, m.content as content
    `)

    let memoriesPromoted = sessionMemories.length
    let edgesStrengthened = 0
    let consolidated = 0

    // 2. Strengthen edges from these memories to related files
    for (const memory of sessionMemories) {
      const fileEdges = await this.graphService.query(`
        MATCH (f:File)-[:RELATES_TO]->(m:Memory {id: '${escaped(memory.id)}'})
        RETURN f.path as filePath
      `)

      for (const fileEdge of fileEdges) {
        await this.strengthenEdge(
          `File:${fileEdge.filePath}`,
          `Memory:${memory.id}`,
          'RELATES_TO',
        )
        edgesStrengthened++
      }

      // 3. Check for consolidation candidates (similar memories from other sessions)
      const candidates = await this.findConsolidationCandidates(memory.key, memory.content)
      if (candidates.length > 0) {
        await this.consolidateMemory(memory.id, candidates[0])
        consolidated++
      }
    }

    // 4. Strengthen inter-memory edges within this session
    const memoryIds = sessionMemories.map((m: { id: string }) => m.id)
    if (memoryIds.length > 1) {
      for (let i = 0; i < memoryIds.length; i++) {
        for (let j = i + 1; j < memoryIds.length; j++) {
          await this.strengthenEdge(
            `Memory:${memoryIds[i]}`,
            `Memory:${memoryIds[j]}`,
            'CO_OCCURRED',
          )
          edgesStrengthened++
        }
      }
    }

    // 5. Prune orphaned nodes
    const orphansPruned = await this.pruneOrphanedNodes()

    console.log(`[Tier3] Promoted session ${sessionId}: ${memoriesPromoted} memories, ${edgesStrengthened} edges strengthened, ${orphansPruned} orphans pruned, ${consolidated} consolidated`)

    return { memoriesPromoted, edgesStrengthened, orphansPruned, consolidated }
  }

  /**
   * Strengthen an edge between two nodes, creating it if it doesn't exist.
   */
  private async strengthenEdge(fromId: string, toId: string, type: string): Promise<void> {
    if (!this.graphService) return

    const escaped = (s: string) => s.replace(/'/g, "''")

    // Check if weighted relationship table exists, create if not
    try {
      await this.graphService.query(`
        CREATE REL TABLE IF NOT EXISTS WEIGHTED_${type} (
          FROM Memory TO Memory,
          weight DOUBLE,
          lastStrengthened TIMESTAMP,
          MANY_MANY
        )
      `)
    } catch {
      // Table may already exist
    }

    // Try to update existing edge
    const existing = await this.graphService.query(`
      MATCH (a {id: '${escaped(fromId)}'})-[r:WEIGHTED_${type}]->(b {id: '${escaped(toId)}'})
      RETURN r.weight as weight
    `)

    if (existing.length > 0) {
      // Strengthen existing edge
      const newWeight = (existing[0].weight || 0) + this.WEIGHT_INCREMENT
      await this.graphService.query(`
        MATCH (a {id: '${escaped(fromId)}'})-[r:WEIGHTED_${type}]->(b {id: '${escaped(toId)}'})
        SET r.weight = ${newWeight},
            r.lastStrengthened = timestamp('${new Date().toISOString()}')
      `)
    } else {
      // Create new edge with initial weight
      await this.graphService.query(`
        MATCH (a {id: '${escaped(fromId)}'}), (b {id: '${escaped(toId)}'})
        CREATE (a)-[:WEIGHTED_${type} {weight: ${this.WEIGHT_INCREMENT}, lastStrengthened: timestamp('${new Date().toISOString()}')}]->(b)
      `)
    }
  }

  /**
   * Find orphaned nodes (no incoming/outgoing edges) that are old enough to prune.
   */
  private async findOrphanedNodes(): Promise<OrphanedNode[]> {
    if (!this.graphService) return []

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.ORPHAN_THRESHOLD_DAYS)

    const escaped = (s: string) => s.replace(/'/g, "''")

    // Find Memory nodes with no relationships
    const orphanedMemories = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.updatedAt < timestamp('${cutoffDate.toISOString()}')
      OPTIONAL MATCH (m)-[r]-()
      WITH m, count(r) as edgeCount
      WHERE edgeCount = 0
      RETURN m.id as id, m.updatedAt as lastAccessed, edgeCount
    `)

    // Find File nodes with no relationships
    const orphanedFiles = await this.graphService.query(`
      MATCH (f:File)
      WHERE f.lastModified < timestamp('${cutoffDate.toISOString()}')
      OPTIONAL MATCH (f)-[r]-()
      WITH f, count(r) as edgeCount
      WHERE edgeCount = 0
      RETURN f.path as id, f.lastModified as lastAccessed, edgeCount
    `)

    return [
      ...orphanedMemories.map((n: any) => ({ ...n, type: 'Memory' as const })),
      ...orphanedFiles.map((n: any) => ({ ...n, type: 'File' as const })),
    ]
  }

  /**
   * Remove orphaned nodes from the graph.
   */
  private async pruneOrphanedNodes(): Promise<number> {
    const orphans = await this.findOrphanedNodes()

    if (!this.graphService || orphans.length === 0) return 0

    const escaped = (s: string) => s.replace(/'/g, "''")

    for (const orphan of orphans) {
      try {
        if (orphan.type === 'Memory') {
          await this.graphService.query(`
            MATCH (m:Memory {id: '${escaped(orphan.id)}'})
            WHERE NOT (m)--()
            DELETE m
          `)
        } else if (orphan.type === 'File') {
          await this.graphService.query(`
            MATCH (f:File {path: '${escaped(orphan.id)}'})
            WHERE NOT (f)--()
            DELETE f
          `)
        }
      } catch (error) {
        console.warn(`[Tier3] Failed to prune orphan ${orphan.id}:`, error)
      }
    }

    return orphans.length
  }

  /**
   * Find similar memories from other sessions that could be consolidated.
   */
  private async findConsolidationCandidates(key: string, content: string): Promise<ConsolidationCandidate[]> {
    if (!this.graphService) return []

    const escaped = (s: string) => s.replace(/'/g, "''")

    // Look for memories with similar keys or content overlap
    const keywords = key.toLowerCase().split(/[_\-\s]+/).filter(k => k.length > 3)
    if (keywords.length === 0) return []

    const pattern = keywords.join('|')

    const similarMemories = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.key =~ '(?i).*(${escaped(pattern)}).*'
        AND m.id != '${escaped(key)}'
      RETURN m.id as id, m.key as key
      LIMIT 5
    `)

    return similarMemories.map((m: any) => ({
      existingMemoryId: m.id,
      newMemoryKey: key,
      similarity: this.calculateSimilarity(key, m.key),
    })).filter((c: ConsolidationCandidate) => c.similarity > 0.7)
  }

  /**
   * Consolidate a new memory into an existing similar memory.
   */
  private async consolidateMemory(newMemoryId: string, candidate: ConsolidationCandidate): Promise<void> {
    if (!this.graphService) return

    const escaped = (s: string) => s.replace(/'/g, "''")

    // Strengthen the existing memory's edges instead of creating duplicate
    await this.strengthenEdge(
      `Memory:${candidate.existingMemoryId}`,
      `Memory:${newMemoryId}`,
      'CONSOLIDATED_WITH',
    )

    // Mark the new memory as consolidated
    await this.graphService.query(`
      MATCH (m:Memory {id: '${escaped(newMemoryId)}'})
      SET m.consolidatedWith = '${escaped(candidate.existingMemoryId)}',
          m.isDuplicate = true
    `)
  }

  private calculateSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/[_\-\s]+/))
    const bWords = new Set(b.toLowerCase().split(/[_\-\s]+/))
    const intersection = new Set([...aWords].filter(x => bWords.has(x)))
    const union = new Set([...aWords, ...bWords])
    return intersection.size / union.size
  }

  /**
   * Cross-session query: Has anyone solved this class of problem before?
   */
  async findSimilarPastSolutions(
    problemDescription: string,
    limit: number = 5,
  ): Promise<Array<{
    memoryId: string
    key: string
    content: string
    agentName: string
    sessionId: string
    relevanceScore: number
  }>> {
    if (!this.graphService) return []

    const escaped = (s: string) => s.replace(/'/g, "''")
    const keywords = problemDescription.toLowerCase().split(/\s+/).filter(k => k.length > 3)
    if (keywords.length === 0) return []

    const pattern = keywords.join('|')

    // Find memories from different sessions with high edge weights
    const results = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE (m.content =~ '(?i).*(${escaped(pattern)}).*' OR m.key =~ '(?i).*(${escaped(pattern)}).*')
        AND m.isDuplicate <> true
      OPTIONAL MATCH (m)-[r:WEIGHTED_RELATES_TO|WEIGHTED_CO_OCCURRED|CONSOLIDATED_WITH]-()
      WITH m, count(r) as edgeCount, sum(COALESCE(r.weight, 0)) as totalWeight
      RETURN m.id as memoryId,
             m.key as key,
             m.content as content,
             m.agentName as agentName,
             m.sessionId as sessionId,
             edgeCount,
             totalWeight
      ORDER BY totalWeight DESC, edgeCount DESC
      LIMIT ${limit}
    `)

    return results.map((r: any) => ({
      memoryId: r.memoryId,
      key: r.key,
      content: r.content?.slice(0, 500),
      agentName: r.agentName || 'unknown',
      sessionId: r.sessionId,
      relevanceScore: (r.totalWeight || 0) * 0.1 + (r.edgeCount || 0) * 0.5,
    }))
  }

  /**
   * Get the strongest connected memories for a given memory (association chain).
   */
  async getAssociatedMemories(
    memoryId: string,
    depth: number = 2,
  ): Promise<Array<{ id: string; key: string; path: string[]; strength: number }>> {
    if (!this.graphService) return []

    const escaped = (s: string) => s.replace(/'/g, "''")

    const results = await this.graphService.query(`
      MATCH path = (start:Memory {id: '${escaped(memoryId)}'})-[r:WEIGHTED_RELATES_TO|WEIGHTED_CO_OCCURRED*1..${depth}]-(end:Memory)
      WHERE end.isDuplicate <> true
      RETURN end.id as id,
             end.key as key,
             length(path) as hops,
             reduce(s = 0, rel IN relationships(path) | s + COALESCE(rel.weight, 1)) as strength
      ORDER BY strength DESC
      LIMIT 10
    `)

    return results.map((r: any) => ({
      id: r.id,
      key: r.key,
      path: r.hops > 0 ? Array(r.hops).fill('→') : [],
      strength: r.strength,
    }))
  }

  /**
   * Apply time decay to all weighted edges (call periodically, e.g., weekly).
   */
  async applyEdgeDecay(): Promise<number> {
    if (!this.graphService) return 0

    const decayFactor = Math.pow(0.5, 1 / this.WEIGHT_DECAY_DAYS) // Half-life of 30 days

    const relationshipTypes = ['WEIGHTED_RELATES_TO', 'WEIGHTED_CO_OCCURRED', 'CONSOLIDATED_WITH']
    let decayedCount = 0

    for (const relType of relationshipTypes) {
      try {
        const result = await this.graphService.query(`
          MATCH ()-[r:${relType}]->()
          SET r.weight = r.weight * ${decayFactor}
          DELETE r
          WHERE r.weight < ${this.MIN_EDGE_WEIGHT}
        `)
        decayedCount += result.length
      } catch {
        // Relationship type may not exist
      }
    }

    console.log(`[Tier3] Applied decay to ${decayedCount} edges`)
    return decayedCount
  }

  /**
   * Get statistics about the long-term memory store.
   */
  async getStats(): Promise<{
    totalMemories: number
    totalFiles: number
    totalSessions: number
    averageEdgeWeight: number
    orphanCount: number
    duplicateCount: number
  }> {
    if (!this.graphService) {
      return {
        totalMemories: 0,
        totalFiles: 0,
        totalSessions: 0,
        averageEdgeWeight: 0,
        orphanCount: 0,
        duplicateCount: 0,
      }
    }

    const [memories, files, sessions, weights, orphans, duplicates] = await Promise.all([
      this.graphService.query('MATCH (m:Memory) RETURN count(m) as c'),
      this.graphService.query('MATCH (f:File) RETURN count(f) as c'),
      this.graphService.query('MATCH (s:Session) RETURN count(s) as c'),
      this.graphService.query('MATCH ()-[r]->() RETURN avg(r.weight) as w'),
      this.findOrphanedNodes(),
      this.graphService.query('MATCH (m:Memory) WHERE m.isDuplicate = true RETURN count(m) as c'),
    ])

    return {
      totalMemories: memories[0]?.c || 0,
      totalFiles: files[0]?.c || 0,
      totalSessions: sessions[0]?.c || 0,
      averageEdgeWeight: weights[0]?.w || 0,
      orphanCount: orphans.length,
      duplicateCount: duplicates[0]?.c || 0,
    }
  }
}
