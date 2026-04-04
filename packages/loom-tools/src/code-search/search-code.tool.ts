import { injectable } from 'inversify'
import { ToolProvider, ToolRequest, ToolInvocationContext, ToolCallResult } from '@theia/ai-core/lib/common'
import { spawn } from 'node:child_process'
import * as path from 'node:path'

@injectable()
export class SearchCodeTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_search_code',
      name: 'search_code',
      description: 'Search code using ripgrep (rg) with fallback to grep. Fast regex search across codebase.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory to search (default: workspace root)' },
          include: { type: 'string', description: 'File glob to include (e.g., "*.ts")' },
          exclude: { type: 'string', description: 'File glob to exclude' },
        },
        required: ['pattern'],
      },
      handler: async (arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult> => {
        const args = JSON.parse(arg_string) as { pattern: string; path?: string; include?: string; exclude?: string }
        const cwd = args.path ? path.resolve(args.path) : process.cwd()
        
        const result = await new Promise<string>((resolve) => {
          const rgArgs = [args.pattern, '--line-number', '--color=never']
          if (args.include) rgArgs.push('--glob', args.include)
          if (args.exclude) rgArgs.push('--glob', `!${args.exclude}`)
          
          const proc = spawn('rg', rgArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
          
          let output = ''
          proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
          proc.stderr.on('data', () => { /* ignore */ })
          proc.on('close', (code) => {
            if (code === 0 || output) {
              resolve(output.trim() || '(no matches)')
            } else {
              // Fallback to grep
              const grepProc = spawn('grep', ['-r', '-n', args.pattern, '.'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
              let grepOutput = ''
              grepProc.stdout.on('data', (d: Buffer) => { grepOutput += d.toString() })
              grepProc.on('close', () => resolve(grepOutput.trim() || '(no matches)'))
            }
          })
        })
        return { result }
      },
    }
  }
}
