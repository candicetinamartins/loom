import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'
import simpleGit from 'simple-git'

@injectable()
export class GitStatusTool implements ToolProvider {
  getTools(): ToolRequest[] {
    return [{
      id: 'loom_git_status',
      name: 'git_status',
      description: 'Get the current git status: staged, unstaged, and untracked files.',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async () => {
        const git = simpleGit(process.cwd())
        const status = await git.status()
        const lines = [
          status.staged.length ? `Staged:    ${status.staged.join(', ')}` : '',
          status.modified.length ? `Modified:  ${status.modified.join(', ')}` : '',
          status.not_added.length ? `Untracked: ${status.not_added.join(', ')}` : '',
          status.deleted.length ? `Deleted:   ${status.deleted.join(', ')}` : '',
        ].filter(Boolean)
        return lines.length ? lines.join('\n') : 'Nothing to commit, working tree clean'
      },
    }]
  }
}
