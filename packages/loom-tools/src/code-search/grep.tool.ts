import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'
import { spawn } from 'node:child_process'
import * as path from 'node:path'

@injectable()
export class GrepTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_grep',
      name: 'grep',
      description: 'Simple grep search. Use search_code for faster regex searches.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pattern to search for' },
          path: { type: 'string', description: 'Directory to search (default: workspace root)' },
          include: { type: 'string', description: 'File pattern (e.g., "*.js")' },
        },
        required: ['pattern'],
      },
      handler: async (args: { pattern: string; path?: string; include?: string }) => {
        const cwd = args.path ? path.resolve(args.path) : process.cwd()
        
        return new Promise((resolve) => {
          const grepArgs = ['-r', '-n', args.pattern]
          if (args.include) grepArgs.push('--include', args.include)
          grepArgs.push('.')
          
          const proc = spawn('grep', grepArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
          
          let output = ''
          proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
          proc.stderr.on('data', () => { /* ignore */ })
          proc.on('close', () => resolve(output.trim() || '(no matches)'))
        })
      },
    }
  }
}
