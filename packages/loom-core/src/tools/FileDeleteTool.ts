import * as fs from 'fs/promises'
import * as path from 'path'

export interface FileDeleteInput {
  filePath: string
}

export interface FileDeleteOutput {
  filePath: string
  success: boolean
}

export class FileDeleteTool {
  readonly name = 'file_delete'
  readonly description = 'Delete a file from the workspace'

  async execute(input: FileDeleteInput): Promise<FileDeleteOutput> {
    const resolvedPath = path.resolve(input.filePath)
    await fs.unlink(resolvedPath)

    return {
      filePath: resolvedPath,
      success: true,
    }
  }
}
