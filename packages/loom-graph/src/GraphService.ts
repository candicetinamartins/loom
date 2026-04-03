import { injectable, inject } from 'inversify'
import * as kuzu from '@vela-engineering/kuzu'
import * as path from 'path'
import * as os from 'os'

export interface GraphNode {
  id: string
  labels: string[]
  properties: Record<string, any>
}

export interface GraphRelationship {
  id: string
  type: string
  startNode: string
  endNode: string
  properties: Record<string, any>
}

export interface GraphQueryResult {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
}

/**
 * GraphService - Knowledge graph using Vela-Engineering/kuzu
 * 
 * Embedded graph database with:
 * - Function, Module, File, Class nodes
 * - CALLS, CONTAINS, IMPORTS, CO_CHANGED relationships
 * - Vector embeddings on nodes (FLOAT[1536])
 * - BM25 full-text search via FTS
 */
@injectable()
export class GraphService {
  private db: kuzu.Database | null = null
  private conn: kuzu.Connection | null = null
  private isInitialized = false

  constructor(
    @inject('LOOM_DB_PATH') private dbPath: string = path.join(os.homedir(), '.config', 'loom', 'graph.db')
  ) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Create database directory if needed
      this.db = new kuzu.Database(this.dbPath)
      this.conn = new kuzu.Connection(this.db)

      await this.createSchema()
      await this.createIndexes()
      
      this.isInitialized = true
      console.log(`[GraphService] Initialized at ${this.dbPath}`)
    } catch (error) {
      console.error('[GraphService] Failed to initialize:', error)
      throw error
    }
  }

  private async createSchema(): Promise<void> {
    if (!this.conn) return

    // Node tables
    const nodeTables = [
      `CREATE NODE TABLE IF NOT EXISTS Function(
        id STRING,
        name STRING,
        signature STRING,
        doc STRING,
        embedding FLOAT[1536],
        complexity INT32,
        PRIMARY KEY (id)
      )`,
      
      `CREATE NODE TABLE IF NOT EXISTS Module(
        id STRING,
        path STRING,
        language STRING,
        churn_score FLOAT,
        PRIMARY KEY (id)
      )`,
      
      `CREATE NODE TABLE IF NOT EXISTS File(
        id STRING,
        path STRING,
        last_modified INT64,
        PRIMARY KEY (id)
      )`,
      
      `CREATE NODE TABLE IF NOT EXISTS Class(
        id STRING,
        name STRING,
        doc STRING,
        embedding FLOAT[1536],
        PRIMARY KEY (id)
      )`,
      
      `CREATE NODE TABLE IF NOT EXISTS Variable(
        id STRING,
        name STRING,
        type STRING,
        PRIMARY KEY (id)
      )`,
      
      `CREATE NODE TABLE IF NOT EXISTS DocPage(
        id STRING,
        path STRING,
        title STRING,
        package STRING,
        embedding FLOAT[1536],
        PRIMARY KEY (id)
      )`,
      
      `CREATE NODE TABLE IF NOT EXISTS DocSection(
        id STRING,
        heading STRING,
        content STRING,
        embedding FLOAT[1536],
        PRIMARY KEY (id)
      )`,
      
      `CREATE NODE TABLE IF NOT EXISTS Memory(
        id STRING,
        key STRING,
        value STRING,
        tier STRING,
        embedding FLOAT[1536],
        PRIMARY KEY (id)
      )`,
    ]

    for (const table of nodeTables) {
      try {
        await this.conn.query(table)
      } catch (error) {
        console.warn(`[GraphService] Failed to create node table:`, error)
      }
    }

    // Relationship tables
    const relTables = [
      `CREATE REL TABLE IF NOT EXISTS CONTAINS(
        FROM Module TO Function,
        MANY_ONE
      )`,
      
      `CREATE REL TABLE IF NOT EXISTS CONTAINS_CLASS(
        FROM Module TO Class,
        MANY_ONE
      )`,
      
      `CREATE REL TABLE IF NOT EXISTS CALLS(
        FROM Function TO Function,
        MANY_MANY
      )`,
      
      `CREATE REL TABLE IF NOT EXISTS IMPORTS(
        FROM Function TO Module,
        MANY_MANY
      )`,
      
      `CREATE REL TABLE IF NOT EXISTS CO_CHANGED(
        FROM File TO File,
        count INT32,
        MANY_MANY
      )`,
      
      `CREATE REL TABLE IF NOT EXISTS HAS_SECTION(
        FROM DocPage TO DocSection,
        MANY_ONE
      )`,
      
      `CREATE REL TABLE IF NOT EXISTS RELATED(
        FROM Function TO DocPage,
        MANY_MANY
      )`,
    ]

    for (const table of relTables) {
      try {
        await this.conn.query(table)
      } catch (error) {
        console.warn(`[GraphService] Failed to create relationship table:`, error)
      }
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.conn) return

    // Create indexes for faster lookups
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_function_name ON Function(name)`,
      `CREATE INDEX IF NOT EXISTS idx_module_path ON Module(path)`,
      `CREATE INDEX IF NOT EXISTS idx_file_path ON File(path)`,
    ]

    for (const index of indexes) {
      try {
        await this.conn.query(index)
      } catch (error) {
        console.warn(`[GraphService] Failed to create index:`, error)
      }
    }
  }

  // Node operations
  async createFunction(data: {
    id: string
    name: string
    signature: string
    doc?: string
    embedding?: number[]
    complexity?: number
  }): Promise<void> {
    if (!this.conn) throw new Error('Graph not initialized')

    const embeddingStr = data.embedding ? `[${data.embedding.join(', ')}]` : '[]'
    
    const query = `
      CREATE (f:Function {
        id: '${data.id}',
        name: '${data.name.replace(/'/g, "\\'")}',
        signature: '${data.signature.replace(/'/g, "\\'")}',
        doc: '${(data.doc || '').replace(/'/g, "\\'")}',
        embedding: ${embeddingStr},
        complexity: ${data.complexity || 0}
      })
    `
    
    await this.conn.query(query)
  }

  async createModule(data: {
    id: string
    path: string
    language: string
    churn_score?: number
  }): Promise<void> {
    if (!this.conn) throw new Error('Graph not initialized')

    const query = `
      CREATE (m:Module {
        id: '${data.id}',
        path: '${data.path.replace(/'/g, "\\'")}',
        language: '${data.language}',
        churn_score: ${data.churn_score || 0.0}
      })
    `
    
    await this.conn.query(query)
  }

  async createFile(data: {
    id: string
    path: string
    last_modified: number
  }): Promise<void> {
    if (!this.conn) throw new Error('Graph not initialized')

    const query = `
      CREATE (f:File {
        id: '${data.id}',
        path: '${data.path.replace(/'/g, "\\'")}',
        last_modified: ${data.last_modified}
      })
    `
    
    await this.conn.query(query)
  }

  // Relationship operations
  async createContains(moduleId: string, functionId: string): Promise<void> {
    if (!this.conn) throw new Error('Graph not initialized')

    const query = `
      MATCH (m:Module {id: '${moduleId}'}), (f:Function {id: '${functionId}'})
      CREATE (m)-[:CONTAINS]->(f)
    `
    
    await this.conn.query(query)
  }

  async createCalls(fromFunctionId: string, toFunctionId: string): Promise<void> {
    if (!this.conn) throw new Error('Graph not initialized')

    const query = `
      MATCH (f1:Function {id: '${fromFunctionId}'}), (f2:Function {id: '${toFunctionId}'})
      CREATE (f1)-[:CALLS]->(f2)
    `
    
    await this.conn.query(query)
  }

  async createCoChanged(file1Id: string, file2Id: string, count: number): Promise<void> {
    if (!this.conn) throw new Error('Graph not initialized')

    const query = `
      MATCH (f1:File {id: '${file1Id}'}), (f2:File {id: '${file2Id}'})
      CREATE (f1)-[:CO_CHANGED {count: ${count}}]->(f2)
    `
    
    await this.conn.query(query)
  }

  // Queries
  async findFunctionByName(name: string): Promise<GraphNode[]> {
    if (!this.conn) throw new Error('Graph not initialized')

    const query = `
      MATCH (f:Function)
      WHERE f.name CONTAINS '${name.replace(/'/g, "\\'")}'
      RETURN f.id, f.name, f.signature, f.doc, f.complexity
    `
    
    const result = await this.conn.query(query)
    return result.getAllRows().map((row: any) => ({
      id: row['f.id'],
      labels: ['Function'],
      properties: {
        name: row['f.name'],
        signature: row['f.signature'],
        doc: row['f.doc'],
        complexity: row['f.complexity'],
      },
    }))
  }

  async getFunctionNeighborhood(functionId: string): Promise<GraphQueryResult> {
    if (!this.conn) throw new Error('Graph not initialized')

    // Get connected functions (callers and callees)
    const query = `
      MATCH (f:Function {id: '${functionId}'})
      OPTIONAL MATCH (f)-[:CALLS]->(callee:Function)
      OPTIONAL MATCH (caller:Function)-[:CALLS]->(f)
      OPTIONAL MATCH (f)<-[:CONTAINS]-(m:Module)
      RETURN f, collect(DISTINCT callee) as callees, collect(DISTINCT caller) as callers, m
    `
    
    const result = await this.conn.query(query)
    const rows = result.getAllRows()
    
    if (rows.length === 0) {
      return { nodes: [], relationships: [] }
    }

    const row = rows[0]
    const nodes: GraphNode[] = []
    const relationships: GraphRelationship[] = []

    // Main function
    nodes.push({
      id: row['f.id'],
      labels: ['Function'],
      properties: row['f'],
    })

    // Module
    if (row['m']) {
      nodes.push({
        id: row['m.id'],
        labels: ['Module'],
        properties: row['m'],
      })
      relationships.push({
        id: `rel-${Date.now()}-module`,
        type: 'CONTAINS',
        startNode: row['m.id'],
        endNode: row['f.id'],
        properties: {},
      })
    }

    // Callees
    row['callees'].forEach((callee: any) => {
      if (!nodes.find(n => n.id === callee.id)) {
        nodes.push({
          id: callee.id,
          labels: ['Function'],
          properties: callee,
        })
      }
      relationships.push({
        id: `rel-${Date.now()}-${callee.id}`,
        type: 'CALLS',
        startNode: row['f.id'],
        endNode: callee.id,
        properties: {},
      })
    })

    // Callers
    row['callers'].forEach((caller: any) => {
      if (!nodes.find(n => n.id === caller.id)) {
        nodes.push({
          id: caller.id,
          labels: ['Function'],
          properties: caller,
        })
      }
      relationships.push({
        id: `rel-${Date.now()}-${caller.id}`,
        type: 'CALLS',
        startNode: caller.id,
        endNode: row['f.id'],
        properties: {},
      })
    })

    return { nodes, relationships }
  }

  async semanticSearch(query: string, embedding: number[], limit: number = 10): Promise<GraphNode[]> {
    if (!this.conn) throw new Error('Graph not initialized')

    // Kuzu doesn't have built-in vector search yet
    // This is a placeholder that would use cosine similarity via custom function
    // For now, return placeholder results
    console.log(`[GraphService] Semantic search for: ${query} (embedding: ${embedding.length} dims)`)
    
    // Fallback to name-based search
    return this.findFunctionByName(query)
  }

  async close(): Promise<void> {
    await this.conn?.close()
    this.db?.close()
    this.isInitialized = false
  }
}
