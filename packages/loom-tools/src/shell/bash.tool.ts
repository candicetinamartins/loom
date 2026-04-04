import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'
import { spawn } from 'node:child_process'
import * as path from 'node:path'

// Commands that are never allowed regardless of context
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//, /sudo\s+rm/, /mkfs/, /dd\s+if=.*of=\/dev/,
  /curl.*\|\s*bash/, /wget.*\|\s*sh/, /chmod\s+777\s+\//,
]

@injectable()
export class BashTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_bash',
      name: 'bash',
      description: 'Execute a shell command in the workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
          workdir: { type: 'string', description: 'Working directory (default: workspace root)' },
        },
        required: ['command'],
      },
      handler: async (args: { command: string; timeout?: number; workdir?: string }) => {
        // Safety check
        for (const pattern of BLOCKED_PATTERNS) {
          if (pattern.test(args.command)) {
            return `Error: command blocked by Loom safety policy: ${args.command}` 
          }
        }

        return new Promise((resolve) => {
          const timeout = args.timeout ?? 30_000
          let output = ''
          let timedOut = false

          const proc = spawn('sh', ['-c', args.command], {
            cwd: args.workdir ? path.resolve(args.workdir) : process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
          })

          const timer = setTimeout(() => {
            timedOut = true
            proc.kill()
            resolve(`Error: command timed out after ${timeout}ms`)
          }, timeout)

          proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
          proc.stderr.on('data', (d: Buffer) => { output += d.toString() })
          proc.on('close', (code) => {
            if (timedOut) return
            clearTimeout(timer)
            resolve(output.trim() || `(exit code: ${code})`)
          })
        })
      },
    }
  }
}
