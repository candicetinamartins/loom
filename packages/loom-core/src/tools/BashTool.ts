import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface BashInput {
  command: string
  cwd?: string
  timeout?: number
}

export interface BashOutput {
  stdout: string
  stderr: string
  exitCode: number
}

export class BashTool {
  readonly name = 'bash'
  readonly description = 'Execute bash/shell commands'

  async execute(input: BashInput): Promise<BashOutput> {
    const options = {
      cwd: input.cwd,
      timeout: input.timeout ?? 30000,
    }

    try {
      const { stdout, stderr } = await execAsync(input.command, options)
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      }
    } catch (error: any) {
      return {
        stdout: error.stdout?.trim() ?? '',
        stderr: error.stderr?.trim() ?? '',
        exitCode: error.code ?? 1,
      }
    }
  }
}
