import { exec } from 'child_process'
import { promisify } from 'util'
import { MentionContext, ContextProvider } from '../MentionContextProvider'

const execAsync = promisify(exec)

export class GitDiffContextProvider implements ContextProvider {
  readonly type = 'git:diff'
  readonly prefix = 'git:diff'

  async provideContext(_mention: string): Promise<MentionContext> {
    try {
      const { stdout } = await execAsync('git diff --cached')
      return {
        type: this.type,
        content: `Staged changes:\n\`\`\`diff\n${stdout}\n\`\`\``,
        tokens: Math.ceil(stdout.length / 4),
      }
    } catch {
      return {
        type: this.type,
        content: 'No staged changes',
        tokens: 5,
      }
    }
  }
}
