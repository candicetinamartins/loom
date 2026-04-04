import * as fs from 'fs/promises'
import * as path from 'path'

export interface FileWriteInput {
  filePath: string
  content: string
  createDirectories?: boolean
}

export interface FileWriteOutput {
  filePath: string
  bytesWritten: number
  success: boolean
}

export class FileWriteTool {
  readonly name = 'write_file'
  readonly description = 'Write content to a file in the workspace'

  async execute(input: FileWriteInput): Promise<FileWriteOutput> {
    const resolvedPath = path.resolve(input.filePath)

    if (input.createDirectories) {
      const dir = path.dirname(resolvedPath)
      await fs.mkdir(dir, { recursive: true })
    }

    await fs.writeFile(resolvedPath, input.content, 'utf-8')

    return {
      filePath: resolvedPath,
      bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
      success: true,
    }
  }
}
