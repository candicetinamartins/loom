import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GitDiffInput {
  cwd?: string
  staged?: boolean
  filePath?: string
}

export interface GitDiffOutput {
  diff: string
  hasChanges: boolean
}

export class GitDiffTool {
  readonly name = 'git_diff'
  readonly description = 'Get git diff of current changes'

  async execute(input: GitDiffInput): Promise<GitDiffOutput> {
    const cwd = input.cwd ?? process.cwd()
    const stagedFlag = input.staged ? '--staged' : ''
    const fileFlag = input.filePath ? `-- ${input.filePath}` : ''

    const command = `git diff ${stagedFlag} ${fileFlag}`.trim()

    try {
      const { stdout } = await execAsync(command, { cwd })
      return {
        diff: stdout,
        hasChanges: stdout.length > 0,
      }
    } catch (error: any) {
      // git diff returns exit code 1 when no changes
      if (error.code === 1 && !error.stderr) {
        return {
          diff: '',
          hasChanges: false,
        }
      }
      throw new Error(`Git diff failed: ${error.stderr || error.message}`)
    }
  }
}
