import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { TOMLParser } from '@loom/core'

const execFileAsync = promisify(execFile)

/**
 * CommitService - Generate conventional commits with spec references
 * 
 * Implements `loom commit` command:
 * - Analyzes staged changes
 * - Suggests conventional commit format
 * - Includes spec and task references
 */

export interface CommitSuggestion {
  type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore'
  scope?: string
  subject: string
  body?: string
  breaking?: boolean
  specRef?: string
  taskRef?: string
}

@injectable()
export class CommitService {
  private parser = new TOMLParser()

  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string,
  ) {}

  /**
   * Generate conventional commit from staged changes
   */
  async suggestCommit(): Promise<CommitSuggestion> {
    // Get staged diff
    const diff = await this.getStagedDiff()
    
    // Analyze files changed
    const files = await this.getStagedFiles()
    
    // Detect commit type from changes
    const type = this.detectCommitType(files, diff)
    
    // Try to find spec reference from branch name or recent specs
    const specRef = await this.findSpecReference()
    
    // Generate subject line
    const subject = this.generateSubject(files, type, diff)
    
    return {
      type,
      scope: this.detectScope(files),
      subject,
      body: specRef ? `Relates to spec: ${specRef}` : undefined,
      specRef,
    }
  }

  /**
   * Format commit suggestion as conventional commit string
   */
  formatCommit(suggestion: CommitSuggestion): string {
    const scope = suggestion.scope ? `(${suggestion.scope})` : ''
    const breaking = suggestion.breaking ? '!' : ''
    const specRef = suggestion.specRef ? `[${suggestion.specRef}]` : ''
    
    let commit = `${suggestion.type}${scope}${breaking}: ${specRef} ${suggestion.subject}`
    
    if (suggestion.body) {
      commit += `\n\n${suggestion.body}`
    }
    
    return commit
  }

  /**
   * Execute commit with the generated message
   */
  async executeCommit(message: string): Promise<void> {
    await execFileAsync('git', ['commit', '-m', message], { cwd: this.workspaceRoot })
  }

  /**
   * Get currently active spec from .loom/active-spec.toml
   */
  async getActiveSpec(): Promise<string | null> {
    try {
      const activeSpecPath = path.join(this.workspaceRoot, '.loom', 'active-spec.toml')
      const content = await fs.readFile(activeSpecPath, 'utf-8')
      const parsed = this.parser.parse<{ spec?: string }>(content)
      return parsed.spec || null
    } catch {
      return null
    }
  }

  /**
   * Set active spec for contextual commits
   */
  async setActiveSpec(specName: string): Promise<void> {
    const loomDir = path.join(this.workspaceRoot, '.loom')
    await fs.mkdir(loomDir, { recursive: true })
    
    const toml = `spec = "${specName}"
set_at = "${new Date().toISOString()}"
`
    await fs.writeFile(
      path.join(loomDir, 'active-spec.toml'),
      toml,
      'utf-8'
    )
  }

  private async getStagedDiff(): Promise<string> {
    const { stdout } = await execFileAsync('git', ['diff', '--staged'], { cwd: this.workspaceRoot })
    return stdout
  }

  private async getStagedFiles(): Promise<string[]> {
    const { stdout } = await execFileAsync('git', ['diff', '--staged', '--name-only'], { cwd: this.workspaceRoot })
    return stdout.split('\n').map(f => f.trim()).filter(Boolean)
  }

  private detectCommitType(files: string[], diff: string): CommitSuggestion['type'] {
    // Analyze changes to determine type
    
    // Test files changed
    if (files.some(f => f.includes('.test.') || f.includes('.spec.'))) {
      return 'test'
    }
    
    // Documentation changes
    if (files.some(f => f.endsWith('.md') || f.endsWith('.mdx'))) {
      return 'docs'
    }
    
    // Style/formatting only
    if (diff.includes('prettier') || diff.includes('eslint')) {
      return 'style'
    }
    
    // Look for fix patterns in diff
    if (diff.includes('fix:') || diff.includes('bugfix') || diff.includes('BUG')) {
      return 'fix'
    }
    
    // Refactor patterns
    if (diff.includes('refactor:') || diff.includes('extract') || diff.includes('move')) {
      return 'refactor'
    }
    
    // Default to feat for new code
    return 'feat'
  }

  private detectScope(files: string[]): string | undefined {
    // Extract scope from file paths
    const scopes = new Set<string>()
    
    for (const file of files) {
      // Extract package name from packages/*/src paths
      const match = file.match(/packages\/([^/]+)\/src/)
      if (match) {
        scopes.add(match[1])
      }
      
      // Extract feature area
      if (file.includes('auth')) scopes.add('auth')
      if (file.includes('api')) scopes.add('api')
      if (file.includes('ui')) scopes.add('ui')
      if (file.includes('db')) scopes.add('db')
    }
    
    // Return most common scope
    return scopes.size > 0 ? Array.from(scopes)[0] : undefined
  }

  private generateSubject(
    files: string[],
    type: CommitSuggestion['type'],
    diff: string,
  ): string {
    // Generate descriptive subject line
    const fileCount = files.length
    
    if (fileCount === 1) {
      const file = files[0].split('/').pop() || 'file'
      return `update ${file}`
    }
    
    if (fileCount <= 3) {
      const names = files.map(f => f.split('/').pop()).join(', ')
      return `update ${names}`
    }
    
    return `update ${fileCount} files`
  }

  private async findSpecReference(): Promise<string | undefined> {
    // Check for active spec first
    const activeSpec = await this.getActiveSpec()
    if (activeSpec) {
      return activeSpec
    }
    
    // Try to extract from branch name
    let branchName = ''
    try {
      const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: this.workspaceRoot })
      branchName = stdout.trim()
    } catch { /* not a git repo or detached HEAD */ }
    const specMatch = branchName.match(/spec[/-]([a-z-]+)/)
    if (specMatch) {
      return specMatch[1]
    }
    
    return undefined
  }
}
