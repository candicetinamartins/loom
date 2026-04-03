import * as fs from 'fs/promises'
import * as path from 'path'

export interface FileEditInput {
  filePath: string
  oldString: string
  newString: string
}

export interface FileEditOutput {
  filePath: string
  success: boolean
  replacements: number
}

export class FileEditTool {
  readonly name = 'file_edit'
  readonly description = 'Replace text in a file using string matching'

  async execute(input: FileEditInput): Promise<FileEditOutput> {
    const resolvedPath = path.resolve(input.filePath)
    const content = await fs.readFile(resolvedPath, 'utf-8')

    let replacements = 0
    let newContent = content

    // Replace all occurrences
    while (newContent.includes(input.oldString)) {
      newContent = newContent.replace(input.oldString, input.newString)
      replacements++
    }

    if (replacements === 0) {
      throw new Error(`String not found in file: ${input.oldString}`)
    }

    await fs.writeFile(resolvedPath, newContent, 'utf-8')

    return {
      filePath: resolvedPath,
      success: true,
      replacements,
    }
  }
}
