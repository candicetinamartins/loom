import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

@injectable()
export class EditFileTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_edit_file',
      name: 'edit_file',
      description: 'Edit a file by replacing old_string with new_string. Throws if old_string not found or not unique.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          old_string: { type: 'string', description: 'String to replace (must be unique)' },
          new_string: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      handler: async (args: { path: string; old_string: string; new_string: string }) => {
        const fullPath = path.resolve(args.path)
        const content = await fs.readFile(fullPath, 'utf-8')
        
        const matches = content.split(args.old_string).length - 1
        if (matches === 0) {
          throw new Error(`old_string not found in ${args.path}`)
        }
        if (matches > 1) {
          throw new Error(`old_string found ${matches} times in ${args.path} (must be unique)`)
        }
        
        const newContent = content.replace(args.old_string, args.new_string)
        await fs.writeFile(fullPath, newContent, 'utf-8')
        return `File edited: ${args.path}`
      },
    }
  }
}
