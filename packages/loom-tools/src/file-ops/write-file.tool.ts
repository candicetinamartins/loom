import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

@injectable()
export class WriteFileTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_write_file',
      name: 'write_file',
      description: 'Write content to a file. Creates directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
      handler: async (args: { path: string; content: string }) => {
        const fullPath = path.resolve(args.path)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, args.content, 'utf-8')
        return `File written: ${args.path}`
      },
    }
  }
}
