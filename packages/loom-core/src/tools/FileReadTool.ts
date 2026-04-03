import * as fs from 'fs/promises'
import * as path from 'path'

export interface FileReadInput {
  filePath: string
  offset?: number
  limit?: number
}

export interface FileReadOutput {
  content: string
  filePath: string
  size: number
}

export class FileReadTool {
  readonly name = 'file_read'
  readonly description = 'Read file contents from the workspace'

  async execute(input: FileReadInput): Promise<FileReadOutput> {
    const resolvedPath = path.resolve(input.filePath)
    const content = await fs.readFile(resolvedPath, 'utf-8')
    const stats = await fs.stat(resolvedPath)

    let result = content
    if (input.offset !== undefined || input.limit !== undefined) {
      const lines = content.split('\n')
      const start = input.offset ?? 0
      const end = input.limit !== undefined ? start + input.limit : lines.length
      result = lines.slice(start, end).join('\n')
    }

    return {
      content: result,
      filePath: resolvedPath,
      size: stats.size,
    }
  }
}
