import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TreeSitterService } from './TreeSitterService'
import { GraphService } from './GraphService'
import { FileService } from '@theia/filesystem/lib/browser/file-service'
import { FileChangeType } from '@theia/filesystem/lib/common/files'

export interface IndexedFile {
  path: string
  language: string
  functions: Array<{
    id: string
    name: string
    signature: string
    startLine: number
    endLine: number
    complexity: number
    doc?: string
  }>
  classes: Array<{
    id: string
    name: string
    startLine: number
    endLine: number
    methods: Array<{ name: string; signature: string }>
    doc?: string
  }>
  imports: string[]
  metrics: {
    totalFunctions: number
    totalClasses: number
    averageComplexity: number
    undocumentedFunctions: number
  }
  lastIndexed: Date
}

/**
 * IndexerService — File watching + indexing with auto-update on save
 * 
 * Features:
 * - Watch workspace files for changes
 * - Auto-index on save
 * - Store in Kuzu graph
 * - Calculate doc_coverage metric
 */
@injectable()
export class IndexerService {
  private indexedFiles: Map<string, IndexedFile> = new Map()
  private isInitialized = false
  private watchedPaths: Set<string> = new Set()

  constructor(
    @inject(TreeSitterService) private treeSitter: TreeSitterService,
    @inject(GraphService) private graphService: GraphService,
    @inject(FileService) private fileService: FileService,
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string
  ) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    await this.treeSitter.initialize()
    await this.setupFileWatcher()
    
    // Index existing files
    await this.indexWorkspace()
    
    this.isInitialized = true
    console.log('[IndexerService] Initialized and indexed workspace')
  }

  /**
   * Set up file watcher for auto-indexing
   */
  private async setupFileWatcher(): Promise<void> {
    // Watch for file changes using Theia's file service
    this.fileService.onDidFilesChange(async (event) => {
      for (const change of event.changes) {
        const filePath = change.resource.path.toString()
        
        if (!this.treeSitter.isSupported(filePath)) continue

        if (change.type === FileChangeType.ADDED || change.type === FileChangeType.UPDATED) {
          await this.indexFile(filePath)
        } else if (change.type === FileChangeType.DELETED) {
          await this.removeFile(filePath)
        }
      }
    })
  }

  /**
   * Index entire workspace
   */
  async indexWorkspace(): Promise<void> {
    const supportedExts = this.treeSitter.getSupportedExtensions()
    const filesToIndex: string[] = []

    // Walk workspace and find supported files
    await this.walkDirectory(this.workspaceRoot, supportedExts, filesToIndex)

    // Index in batches
    const batchSize = 10
    for (let i = 0; i < filesToIndex.length; i += batchSize) {
      const batch = filesToIndex.slice(i, i + batchSize)
      await Promise.all(batch.map(f => this.indexFile(f)))
    }

    console.log(`[IndexerService] Indexed ${filesToIndex.length} files`)
  }

  private async walkDirectory(dir: string, exts: string[], results: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        
        // Skip node_modules and .git
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) {
          continue
        }

        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, exts, results)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name)
          if (exts.includes(ext)) {
            results.push(fullPath)
          }
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
    }
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string): Promise<IndexedFile | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = await this.treeSitter.parseFile(filePath, content)
      
      if (!parsed) return null

      const metrics = this.treeSitter.calculateMetrics(parsed)
      
      const indexedFile: IndexedFile = {
        path: filePath,
        language: parsed.language,
        functions: parsed.functions,
        classes: parsed.classes.map(c => ({
          id: c.id,
          name: c.name,
          startLine: c.startLine,
          endLine: c.endLine,
          methods: c.methods.map(m => ({ name: m.name, signature: m.signature })),
          doc: c.doc,
        })),
        imports: parsed.imports,
        metrics: {
          totalFunctions: metrics.totalFunctions,
          totalClasses: metrics.totalClasses,
          averageComplexity: metrics.averageComplexity,
          undocumentedFunctions: metrics.undocumentedFunctions,
        },
        lastIndexed: new Date(),
      }

      this.indexedFiles.set(filePath, indexedFile)
      
      // Store in graph
      await this.storeInGraph(indexedFile)
      
      return indexedFile
    } catch (error) {
      console.warn(`[IndexerService] Failed to index ${filePath}:`, error)
      return null
    }
  }

  /**
   * Remove a file from the index
   */
  async removeFile(filePath: string): Promise<void> {
    this.indexedFiles.delete(filePath)
    
    // Remove from graph
    try {
      await this.graphService.query(`
        MATCH (f:File {path: '${filePath}'})
        DETACH DELETE f
      `)
    } catch (error) {
      console.warn(`[IndexerService] Failed to remove ${filePath} from graph`)
    }
  }

  /**
   * Store indexed file in Kuzu graph
   */
  private async storeInGraph(indexed: IndexedFile): Promise<void> {
    try {
      // Create file node
      await this.graphService.query(`
        MERGE (f:File {path: '${indexed.path}'})
        SET f.language = '${indexed.language}',
            f.lastIndexed = '${indexed.lastIndexed.toISOString()}',
            f.totalFunctions = ${indexed.metrics.totalFunctions},
            f.totalClasses = ${indexed.metrics.totalClasses}
      `)

      // Create function nodes
      for (const func of indexed.functions) {
        await this.graphService.query(`
          MERGE (fn:Function {id: '${func.id}'})
          SET fn.name = '${func.name}',
              fn.signature = '${func.signature.replace(/'/g, "\\'")}',
              fn.startLine = ${func.startLine},
              fn.endLine = ${func.endLine},
              fn.complexity = ${func.complexity},
              fn.doc = ${func.doc ? `'${func.doc.replace(/'/g, "\\'").slice(0, 200)}'` : 'NULL'}
          WITH fn
          MATCH (f:File {path: '${indexed.path}'})
          MERGE (f)-[:CONTAINS]->(fn)
        `)
      }

      // Create class nodes
      for (const cls of indexed.classes) {
        await this.graphService.query(`
          MERGE (c:Class {id: '${cls.id}'})
          SET c.name = '${cls.name}',
              c.startLine = ${cls.startLine},
              c.endLine = ${cls.endLine}
          WITH c
          MATCH (f:File {path: '${indexed.path}'})
          MERGE (f)-[:CONTAINS]->(c)
        `)
      }
    } catch (error) {
      console.warn(`[IndexerService] Failed to store ${indexed.path} in graph:`, error)
    }
  }

  /**
   * Calculate doc_coverage metric for the workspace
   * Percentage of functions that have documentation
   */
  calculateDocCoverage(): {
    totalFiles: number
    totalFunctions: number
    documentedFunctions: number
    coveragePercent: number
    byLanguage: Record<string, { total: number; documented: number; coverage: number }>
  } {
    let totalFunctions = 0
    let documentedFunctions = 0
    const byLanguage: Record<string, { total: number; documented: number; coverage: number }> = {}

    for (const indexed of this.indexedFiles.values()) {
      const lang = indexed.language
      if (!byLanguage[lang]) {
        byLanguage[lang] = { total: 0, documented: 0, coverage: 0 }
      }

      const total = indexed.metrics.totalFunctions
      const undocumented = indexed.metrics.undocumentedFunctions
      const documented = total - undocumented

      totalFunctions += total
      documentedFunctions += documented
      
      byLanguage[lang].total += total
      byLanguage[lang].documented += documented
    }

    // Calculate coverage percentages
    for (const lang of Object.keys(byLanguage)) {
      const stats = byLanguage[lang]
      stats.coverage = stats.total > 0 
        ? Math.round((stats.documented / stats.total) * 100 * 100) / 100
        : 0
    }

    return {
      totalFiles: this.indexedFiles.size,
      totalFunctions,
      documentedFunctions,
      coveragePercent: totalFunctions > 0 
        ? Math.round((documentedFunctions / totalFunctions) * 100 * 100) / 100
        : 0,
      byLanguage,
    }
  }

  /**
   * Search indexed files by function name
   */
  async searchFunctions(query: string): Promise<Array<{ file: string; function: IndexedFile['functions'][0] }>> {
    const results: Array<{ file: string; function: IndexedFile['functions'][0] }> = []
    const queryLower = query.toLowerCase()

    for (const [filePath, indexed] of this.indexedFiles) {
      for (const func of indexed.functions) {
        if (func.name.toLowerCase().includes(queryLower)) {
          results.push({ file: filePath, function: func })
        }
      }
    }

    return results
  }

  /**
   * Get indexed file by path
   */
  getIndexedFile(path: string): IndexedFile | undefined {
    return this.indexedFiles.get(path)
  }

  /**
   * Get all indexed files
   */
  getAllIndexedFiles(): IndexedFile[] {
    return Array.from(this.indexedFiles.values())
  }

  /**
   * Force reindex of a file
   */
  async reindexFile(filePath: string): Promise<IndexedFile | null> {
    this.treeSitter.clearCache()
    return this.indexFile(filePath)
  }
}
