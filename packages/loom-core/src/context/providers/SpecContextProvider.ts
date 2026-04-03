import * as fs from 'fs/promises'
import * as path from 'path'
import { MentionContext, ContextProvider } from '../MentionContextProvider'

export class SpecContextProvider implements ContextProvider {
  readonly type = 'spec'
  readonly prefix = 'spec:'

  async provideContext(mention: string): Promise<MentionContext> {
    const specName = mention.substring(this.prefix.length)
    const specDir = path.join('.loom/specs', specName)

    const [requirements, design] = await Promise.all([
      fs.readFile(path.join(specDir, 'requirements.md'), 'utf-8').catch(() => null),
      fs.readFile(path.join(specDir, 'design.md'), 'utf-8').catch(() => null),
    ])

    let content = `Spec: ${specName}\n\n`
    if (requirements) content += `Requirements:\n${requirements}\n\n`
    if (design) content += `Design:\n${design}\n\n`

    return {
      type: this.type,
      content,
      tokens: Math.ceil(content.length / 4),
    }
  }
}
