import { exec } from 'child_process'
import { promisify } from 'util'
import { MentionContext, ContextProvider } from '../MentionContextProvider'

const execAsync = promisify(exec)

export class GitLogContextProvider implements ContextProvider {
  readonly type = 'git:log'
  readonly prefix = 'git:log'

  async provideContext(_mention: string): Promise<MentionContext> {
    try {
      const { stdout } = await execAsync('git log --oneline -10')
      return {
        type: this.type,
        content: `Recent commits:\n${stdout}`,
        tokens: Math.ceil(stdout.length / 4),
      }
    } catch {
      return {
        type: this.type,
        content: 'No git history available',
        tokens: 5,
      }
    }
  }
}
