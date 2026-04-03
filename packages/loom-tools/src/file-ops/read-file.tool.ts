import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

@injectable()
export class ReadFileTool implements ToolProvider {
  getTools(): ToolRequest[] {
    return [{
      id: 'loom_read_file',
      name: 'read_file',
      description: 'Read a file from the workspace. Returns file content as text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          startLine: { type: 'number', description: 'Optional: first line to read (1-indexed)' },
          endLine: { type: 'number', description: 'Optional: last line to read (1-indexed)' },
        },
        required: ['path'],
      },
      handler: async (args: { path: string; startLine?: number; endLine?: number }) => {
        const fullPath = path.resolve(args.path)
        const content = await fs.readFile(fullPath, 'utf-8')
        if (args.startLine || args.endLine) {
          const lines = content.split('\n')
          const start = (args.startLine ?? 1) - 1
          const end = args.endLine ?? lines.length
          return lines.slice(start, end).join('\n')
        }
        return content
      },
    }]
  }
}
