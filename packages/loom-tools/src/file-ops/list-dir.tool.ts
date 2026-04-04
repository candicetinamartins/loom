import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

@injectable()
export class ListDirTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_list_dir',
      name: 'list_dir',
      description: 'List directory contents with file sizes and types.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to workspace root' },
          recursive: { type: 'boolean', description: 'List recursively' },
        },
        required: ['path'],
      },
      handler: async (args: { path: string; recursive?: boolean }) => {
        const fullPath = path.resolve(args.path)
        
        async function listDir(dirPath: string, prefix = ''): Promise<string[]> {
          const entries = await fs.readdir(dirPath, { withFileTypes: true })
          const lines: string[] = []
          
          for (const entry of entries) {
            const fullEntryPath = path.join(dirPath, entry.name)
            const stat = await fs.stat(fullEntryPath)
            const size = entry.isFile() ? ` (${stat.size} bytes)` : ''
            const type = entry.isDirectory() ? '/' : ''
            lines.push(`${prefix}${entry.name}${type}${size}`)
            
            if (args.recursive && entry.isDirectory()) {
              const subLines = await listDir(fullEntryPath, prefix + '  ')
              lines.push(...subLines)
            }
          }
          
          return lines
        }
        
        const lines = await listDir(fullPath)
        return lines.join('\n') || '(empty directory)'
      },
    }
  }
}
