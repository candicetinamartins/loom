import { injectable } from 'inversify'
import { ToolProvider, ToolRequest, ToolInvocationContext, ToolCallResult } from '@theia/ai-core/lib/common'
import simpleGit from 'simple-git'

@injectable()
export class GitLogTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_git_log',
      name: 'git_log',
      description: 'Show recent git commit history.',
      parameters: {
        type: 'object',
        properties: {
          maxCount: { type: 'number', description: 'Number of commits (default: 10)' },
          file: { type: 'string', description: 'Show history for specific file only' },
        },
        required: [],
      },
      handler: async (arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult> => {
        const args = JSON.parse(arg_string) as { maxCount?: number; file?: string }
        const git = simpleGit(process.cwd())
        const log = await git.log({ 
          maxCount: args.maxCount ?? 10,
          file: args.file,
        })
        
        const result = log.all.map(commit => 
          `${commit.hash.substring(0, 7)} ${commit.date} ${commit.message}`
        ).join('\n') || '(no commits)'
        return { result }
      },
    }
  }
}
