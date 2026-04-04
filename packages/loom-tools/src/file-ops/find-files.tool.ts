import { injectable } from 'inversify'
import { ToolProvider, ToolRequest, ToolInvocationContext, ToolCallResult } from '@theia/ai-core/lib/common'
import { glob } from 'glob'
import * as path from 'node:path'

@injectable()
export class FindFilesTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_find_files',
      name: 'find_files',
      description: 'Find files matching a glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.test.js")' },
          cwd: { type: 'string', description: 'Working directory (default: workspace root)' },
        },
        required: ['pattern'],
      },
      handler: async (arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult> => {
        const args = JSON.parse(arg_string) as { pattern: string; cwd?: string }
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd()
        const files = await glob(args.pattern, { cwd, nodir: true })
        return { result: files.join('\n') || '(no files found)' }
      },
    }
  }
}
