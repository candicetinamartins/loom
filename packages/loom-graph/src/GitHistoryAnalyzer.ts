import { injectable, inject } from 'inversify'
import simpleGit, { SimpleGit } from 'simple-git'
import * as path from 'path'

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: Date
  filesChanged: string[]
}

export interface FileChurn {
  filePath: string
  commitCount: number
  lastModified: Date
  coChangedFiles: Map<string, number> // file -> co-change count
}

export interface CodeOwnership {
  filePath: string
  primaryAuthor: string
  authorCommits: Map<string, number>
}

/**
 * GitHistoryAnalyzer - Analyzes git history for code insights
 * 
 * Features:
 * - File churn scores (how often files change)
 * - Co-change detection (files that change together)
 * - Code ownership (who knows this code best)
 * - Commit message analysis for context
 */
@injectable()
export class GitHistoryAnalyzer {
  private git: SimpleGit | null = null

  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string
  ) {}

  async initialize(): Promise<void> {
    try {
      this.git = simpleGit(this.workspaceRoot)
      const isRepo = await this.git.checkIsRepo()
      
      if (!isRepo) {
        console.warn('[GitHistoryAnalyzer] Not a git repository')
        this.git = null
        return
      }
      
      console.log('[GitHistoryAnalyzer] Initialized')
    } catch (error) {
      console.error('[GitHistoryAnalyzer] Failed to initialize:', error)
      this.git = null
    }
  }

  async getFileChurn(sinceDays: number = 90): Promise<FileChurn[]> {
    if (!this.git) return []

    const since = new Date()
    since.setDate(since.getDate() - sinceDays)

    // Get commit log with file changes
    const log = await this.git.log({
      from: since.toISOString(),
      '--name-only': null,
    })

    const fileStats = new Map<string, {
      commitCount: number
      lastModified: Date
      coChanges: Map<string, number>
    }>()

    // Process each commit
    for (const commit of log.all) {
      const date = new Date(commit.date)
      
      // Get files changed in this commit
      const show = await this.git.show(['--name-only', '--pretty=format:', commit.hash])
      const files = show
        .split('\n')
        .map(f => f.trim())
        .filter(f => f && !f.includes('=>')) // Skip renames for now
        .map(f => path.join(this.workspaceRoot, f))

      // Update stats for each file
      for (const file of files) {
        if (!fileStats.has(file)) {
          fileStats.set(file, {
            commitCount: 0,
            lastModified: date,
            coChanges: new Map(),
          })
        }

        const stats = fileStats.get(file)!
        stats.commitCount++
        
        if (date > stats.lastModified) {
          stats.lastModified = date
        }

        // Track co-changes
        for (const otherFile of files) {
          if (otherFile !== file) {
            const current = stats.coChanges.get(otherFile) || 0
            stats.coChanges.set(otherFile, current + 1)
          }
        }
      }
    }

    // Convert to array
    return Array.from(fileStats.entries()).map(([filePath, stats]) => ({
      filePath,
      commitCount: stats.commitCount,
      lastModified: stats.lastModified,
      coChangedFiles: stats.coChanges,
    }))
  }

  async getCodeOwnership(filePath?: string): Promise<CodeOwnership[]> {
    if (!this.git) return []

    // Get blame/author info for files
    const log = await this.git.log({
      '--name-only': null,
    })

    const fileAuthors = new Map<string, Map<string, number>>()

    for (const commit of log.all) {
      const show = await this.git.show(['--name-only', '--pretty=format:', commit.hash])
      const files = show
        .split('\n')
        .map(f => f.trim())
        .filter(f => f)

      for (const file of files) {
        const fullPath = path.join(this.workspaceRoot, file)
        
        // Filter if specific file requested
        if (filePath && fullPath !== filePath) continue

        if (!fileAuthors.has(fullPath)) {
          fileAuthors.set(fullPath, new Map())
        }

        const authors = fileAuthors.get(fullPath)!
        const current = authors.get(commit.author_name) || 0
        authors.set(commit.author_name, current + 1)
      }
    }

    return Array.from(fileAuthors.entries()).map(([filePath, authors]) => {
      // Find primary author
      let primaryAuthor = ''
      let maxCommits = 0
      
      for (const [author, count] of authors.entries()) {
        if (count > maxCommits) {
          maxCommits = count
          primaryAuthor = author
        }
      }

      return {
        filePath,
        primaryAuthor,
        authorCommits: authors,
      }
    })
  }

  async getRecentCommits(limit: number = 20): Promise<GitCommit[]> {
    if (!this.git) return []

    const log = await this.git.log({ maxCount: limit })

    return Promise.all(
      log.all.map(async commit => {
        const show = await this.git!.show(['--name-only', '--pretty=format:', commit.hash])
        const files = show
          .split('\n')
          .map(f => f.trim())
          .filter(f => f)
          .map(f => path.join(this.workspaceRoot, f))

        return {
          hash: commit.hash,
          message: commit.message,
          author: commit.author_name,
          date: new Date(commit.date),
          filesChanged: files,
        }
      })
    )
  }

  async getCoChangeMatrix(): Promise<Map<string, Map<string, number>>> {
    if (!this.git) return new Map()

    const log = await this.git.log({
      maxCount: 100, // Last 100 commits
    })

    const coChangeMap = new Map<string, Map<string, number>>()

    for (const commit of log.all) {
      const show = await this.git.show(['--name-only', '--pretty=format:', commit.hash])
      const files = show
        .split('\n')
        .map(f => f.trim())
        .filter(f => f)
        .map(f => path.join(this.workspaceRoot, f))

      // Update co-change matrix
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const file1 = files[i]
          const file2 = files[j]

          if (!coChangeMap.has(file1)) {
            coChangeMap.set(file1, new Map())
          }
          if (!coChangeMap.has(file2)) {
            coChangeMap.set(file2, new Map())
          }

          const count1 = coChangeMap.get(file1)!.get(file2) || 0
          coChangeMap.get(file1)!.set(file2, count1 + 1)

          const count2 = coChangeMap.get(file2)!.get(file1) || 0
          coChangeMap.get(file2)!.set(file1, count2 + 1)
        }
      }
    }

    return coChangeMap
  }

  async findRelatedFiles(filePath: string, threshold: number = 2): Promise<string[]> {
    const coChanges = await this.getCoChangeMatrix()
    const related = coChanges.get(filePath)
    
    if (!related) return []

    return Array.from(related.entries())
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([file]) => file)
  }

  async getCommitMessageContext(filePath: string): Promise<string[]> {
    if (!this.git) return []

    const log = await this.git.log({
      '--follow': null,
      '--': filePath,
    })

    return log.all.map(c => c.message).slice(0, 10)
  }
}
