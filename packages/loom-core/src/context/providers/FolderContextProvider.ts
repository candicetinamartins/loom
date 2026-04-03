import * as fs from 'fs/promises'
import * as path from 'path'
import { MentionContext, ContextProvider } from '../MentionContextProvider'

export class FolderContextProvider implements ContextProvider {
  readonly type = 'folder'
  readonly prefix = 'folder:'

  async provideContext(mention: string): Promise<MentionContext> {
    const folderPath = mention.substring(this.prefix.length)
    const entries = await fs.readdir(folderPath, { withFileTypes: true }).catch(() => [])

    const fileList = entries
      .filter(e => e.isFile())
      .map(e => e.name)
      .join('\n')

    return {
      type: this.type,
      content: `Folder: ${folderPath}\nFiles:\n${fileList || '(empty)'}`,
      tokens: Math.ceil(fileList.length / 4) + 10,
    }
  }
}
