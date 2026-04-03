import * as fs from 'fs/promises'
import { MentionContext, ContextProvider } from '../MentionContextProvider'

export class FileContextProvider implements ContextProvider {
  readonly type = 'file'
  readonly prefix = 'file:'

  async provideContext(mention: string): Promise<MentionContext> {
    const filePath = mention.substring(this.prefix.length)
    const content = await fs.readFile(filePath, 'utf-8').catch(() => null)

    if (!content) {
      return {
        type: this.type,
        content: `File not found: ${filePath}`,
        tokens: 10,
      }
    }

    return {
      type: this.type,
      content: `File: ${filePath}\n\`\`\`\n${content}\n\`\`\``,
      tokens: Math.ceil(content.length / 4),
    }
  }
}
