import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'
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
      handler: async (args: { file?: string; staged?: boolean }) => {
        const git = simpleGit(process.cwd())
        
        if (args.file) {
          const diff = await git.diff([args.file])
          return diff || '(no changes)'
        }
        
        if (args.staged) {
          const diff = await git.diff(['--staged'])
          return diff || '(no staged changes)'
        }
        
        const diff = await git.diff()
        return diff || '(no changes)'
      },
    }
  }
}
