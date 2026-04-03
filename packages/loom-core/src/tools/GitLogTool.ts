import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GitLogInput {
  cwd?: string
  maxCount?: number
  filePath?: string
  author?: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  date: string
  message: string
}

export interface GitLogOutput {
  commits: GitCommit[]
}

export class GitLogTool {
  readonly name = 'git_log'
  readonly description = 'Get git commit history'

  async execute(input: GitLogInput): Promise<GitLogOutput> {
    const cwd = input.cwd ?? process.cwd()
    const maxCount = input.maxCount ?? 10

    let command = `git log --format="%H|%h|%an|%ad|%s" --date=short -n ${maxCount}`

    if (input.author) {
      command += ` --author="${input.author}"`
    }

    if (input.filePath) {
      command += ` -- ${input.filePath}`
    }

    const { stdout } = await execAsync(command, { cwd })

    const commits: GitCommit[] = stdout
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split('|')
        return {
          hash: parts[0],
          shortHash: parts[1],
          author: parts[2],
          date: parts[3],
          message: parts.slice(4).join('|'),
        }
      })

    return { commits }
  }
}
