import { injectable } from 'inversify'
import { ToolProvider, ToolRequest, ToolInvocationContext, ToolCallResult } from '@theia/ai-core/lib/common'
import simpleGit from 'simple-git'

@injectable()
export class GitDiffTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_git_diff',
      name: 'git_diff',
      description: 'Show git diff for staged changes or specific file.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Specific file to diff (optional)' },
          staged: { type: 'boolean', description: 'Show staged changes' },
        },
        required: [],
      },
      handler: async (arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult> => {
        const args = JSON.parse(arg_string) as { file?: string; staged?: boolean }
        const git = simpleGit(process.cwd())
        
        let result: string
        if (args.file) {
          const diff = await git.diff([args.file])
          result = diff || '(no changes)'
        } else if (args.staged) {
          const diff = await git.diff(['--staged'])
          result = diff || '(no staged changes)'
        } else {
          const diff = await git.diff()
          result = diff || '(no changes)'
        }
        return { result }
      },
    }
  }
}
