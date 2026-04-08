import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { FileService } from '@theia/filesystem/lib/browser/file-service'

const execAsync = promisify(exec)

export interface ToolResult {
  success: boolean
  output?: string
  error?: string
  data?: any
}

export interface FileToolArgs {
  path: string
  content?: string
}

export interface SearchToolArgs {
  query: string
  path?: string
  filePattern?: string
}

/**
 * ToolExecutor — Real implementations of agent tools
 * 
 * Replaces PipelineRunner stubs with actual:
 * - File operations (read, write, edit)
 * - Code search (rg, fd)
 * - Git operations
 * - Docker commands
 * - Graph queries
 */
@injectable()
export class ToolExecutor {
  constructor(
    @inject(FileService) private fileService: FileService,
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string
  ) {}

  // ── File Operations ───────────────────────────────────────────────────────

  async readFile(args: FileToolArgs): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workspaceRoot, args.path)
      const content = await fs.readFile(fullPath, 'utf-8')
      return { success: true, output: content }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to read file' 
      }
    }
  }

  async writeFile(args: FileToolArgs): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workspaceRoot, args.path)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, args.content || '', 'utf-8')
      return { success: true, output: `Wrote ${args.path}` }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to write file' 
      }
    }
  }

  async editFile(args: { path: string; oldString: string; newString: string }): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workspaceRoot, args.path)
      const content = await fs.readFile(fullPath, 'utf-8')
      
      if (!content.includes(args.oldString)) {
        return { success: false, error: 'Old string not found in file' }
      }
      
      const newContent = content.replace(args.oldString, args.newString)
      await fs.writeFile(fullPath, newContent, 'utf-8')
      return { success: true, output: `Edited ${args.path}` }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to edit file' 
      }
    }
  }

  // ── Code Search (rg + fd) ──────────────────────────────────────────────────

  async searchCode(args: SearchToolArgs): Promise<ToolResult> {
    try {
      const searchPath = args.path || this.workspaceRoot
      const pattern = args.filePattern || '*'
      
      // Use ripgrep for content search
      const rgCmd = `rg -n --type-add 'custom:${pattern}' -tcustom "${args.query}" "${searchPath}" 2>/dev/null || true`
      const { stdout } = await execAsync(rgCmd, { timeout: 30000 })
      
      const results = stdout.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/^([^:]+):(\d+):(.*)$/)
          if (match) {
            return {
              file: match[1],
              line: parseInt(match[2], 10),
              content: match[3].trim()
            }
          }
          return null
        })
        .filter((r): r is { file: string; line: number; content: string } => r !== null)
        .slice(0, 50) // Limit results
      
      return { success: true, data: results, output: `Found ${results.length} matches` }
    } catch (error) {
      // rg returns exit code 1 when no matches, which is not an error
      return { success: true, data: [], output: 'No matches found' }
    }
  }

  async findFiles(args: { pattern: string; path?: string }): Promise<ToolResult> {
    try {
      const searchPath = args.path || this.workspaceRoot
      
      // Use fd for file finding
      const fdCmd = `fd "${args.pattern}" "${searchPath}" --type f 2>/dev/null || find "${searchPath}" -name "${args.pattern}" -type f 2>/dev/null || true`
      const { stdout } = await execAsync(fdCmd, { timeout: 30000 })
      
      const files = stdout.split('\n').filter(f => f.trim()).slice(0, 100)
      return { success: true, data: files, output: `Found ${files.length} files` }
    } catch (error) {
      return { success: false, error: 'File search failed' }
    }
  }

  // ── Git Operations ────────────────────────────────────────────────────────

  async gitStatus(): Promise<ToolResult> {
    try {
      const { stdout } = await execAsync('git status --short', { 
        cwd: this.workspaceRoot,
        timeout: 10000 
      })
      return { success: true, output: stdout || 'No changes', data: stdout }
    } catch (error) {
      return { success: false, error: 'Not a git repository' }
    }
  }

  async gitDiff(args?: { staged?: boolean }): Promise<ToolResult> {
    try {
      const cmd = args?.staged ? 'git diff --staged' : 'git diff'
      const { stdout } = await execAsync(cmd, { 
        cwd: this.workspaceRoot,
        timeout: 30000 
      })
      return { success: true, output: stdout || 'No changes', data: stdout }
    } catch (error) {
      return { success: false, error: 'Git diff failed' }
    }
  }

  async gitLog(args?: { count?: number; file?: string }): Promise<ToolResult> {
    try {
      const count = args?.count || 10
      const fileArg = args?.file ? ` -- "${args.file}"` : ''
      const cmd = `git log --oneline -${count}${fileArg}`
      const { stdout } = await execAsync(cmd, { 
        cwd: this.workspaceRoot,
        timeout: 10000 
      })
      return { success: true, output: stdout, data: stdout.split('\n').filter(l => l) }
    } catch (error) {
      return { success: false, error: 'Git log failed' }
    }
  }

  // ── Docker Operations ─────────────────────────────────────────────────────

  async dockerPs(): Promise<ToolResult> {
    try {
      const { stdout } = await execAsync('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"', {
        timeout: 10000
      })
      return { success: true, output: stdout, data: stdout }
    } catch (error) {
      return { success: false, error: 'Docker not available' }
    }
  }

  async dockerCompose(args: { command: string; service?: string }): Promise<ToolResult> {
    try {
      const serviceArg = args.service || ''
      const cmd = `docker compose ${args.command} ${serviceArg}`.trim()
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: this.workspaceRoot,
        timeout: 60000
      })
      return { success: true, output: stdout || stderr }
    } catch (error) {
      return { success: false, error: 'Docker compose failed' }
    }
  }

  // ── Bash/Shell ─────────────────────────────────────────────────────────────

  async bash(args: { command: string; cwd?: string; timeout?: number }): Promise<ToolResult> {
    try {
      const cwd = args.cwd || this.workspaceRoot
      const timeout = args.timeout || 30000
      const { stdout, stderr } = await execAsync(args.command, { cwd, timeout })
      return { success: true, output: stdout || stderr, data: { stdout, stderr } }
    } catch (error) {
      const err = error as Error & { stderr?: string; stdout?: string }
      return { 
        success: false, 
        error: err.message,
        data: { stdout: err.stdout, stderr: err.stderr }
      }
    }
  }

  // ── Tool Registry ──────────────────────────────────────────────────────────

  getToolsForGroup(group: string): Record<string, (args: any) => Promise<ToolResult>> {
    switch (group) {
      case 'file_ops':
        return {
          read_file: (args: any) => this.readFile(args),
          write_file: (args: any) => this.writeFile(args),
          edit_file: (args: any) => this.editFile(args),
        }
      case 'code_search':
        return {
          search_code: (args: any) => this.searchCode(args),
          find_files: (args: any) => this.findFiles(args),
        }
      case 'git':
        return {
          git_status: () => this.gitStatus(),
          git_diff: (args: any) => this.gitDiff(args),
          git_log: (args: any) => this.gitLog(args),
        }
      case 'docker':
        return {
          docker_ps: () => this.dockerPs(),
          docker_compose: (args: any) => this.dockerCompose(args),
        }
      case 'bash':
        return {
          bash: (args: any) => this.bash(args),
        }
      default:
        return {}
    }
  }

  /**
   * Get all tools for an agent based on its toolGroups
   */
  getToolsForAgent(toolGroups: string[]): Record<string, (args: any) => Promise<ToolResult>> {
    const tools: Record<string, (args: any) => Promise<ToolResult>> = {}
    
    for (const group of toolGroups) {
      const groupTools = this.getToolsForGroup(group)
      Object.assign(tools, groupTools)
    }
    
    return tools
  }
}
