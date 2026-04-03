import * as fs from 'fs/promises'
import * as path from 'path'

export interface GrepInput {
  pattern: string
  paths: string[]
  caseSensitive?: boolean
  include?: string[]
  exclude?: string[]
}

export interface GrepMatch {
  filePath: string
  line: number
  column: number
  match: string
  context: string
}

export interface GrepOutput {
  matches: GrepMatch[]
  totalFiles: number
}

export class GrepTool {
  readonly name = 'grep'
  readonly description = 'Search for patterns in files'

  async execute(input: GrepInput): Promise<GrepOutput> {
    const matches: GrepMatch[] = []
    const filesSearched = new Set<string>()

    for (const searchPath of input.paths) {
      const resolvedPath = path.resolve(searchPath)
      const stat = await fs.stat(resolvedPath).catch(() => null)

      if (stat?.isFile()) {
        await this.searchFile(resolvedPath, input, matches)
        filesSearched.add(resolvedPath)
      } else if (stat?.isDirectory()) {
        await this.searchDirectory(resolvedPath, input, matches, filesSearched)
      }
    }

    return {
      matches,
      totalFiles: filesSearched.size,
    }
  }

  private async searchDirectory(
    dirPath: string,
    input: GrepInput,
    matches: GrepMatch[],
    filesSearched: Set<string>
  ): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        // Skip node_modules and .git
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue
        }
        await this.searchDirectory(fullPath, input, matches, filesSearched)
      } else if (entry.isFile()) {
        // Check include/exclude patterns
        if (input.include && !input.include.some(p => fullPath.includes(p))) {
          continue
        }
        if (input.exclude && input.exclude.some(p => fullPath.includes(p))) {
          continue
        }

        await this.searchFile(fullPath, input, matches)
        filesSearched.add(fullPath)
      }
    }
  }

  private async searchFile(
    filePath: string,
    input: GrepInput,
    matches: GrepMatch[]
  ): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (!content) return

    const lines = content.split('\n')
    const flags = input.caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(input.pattern, flags)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      let match: RegExpExecArray | null

      while ((match = regex.exec(line)) !== null) {
        matches.push({
          filePath,
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          context: line.trim(),
        })
      }
    }
  }
}
