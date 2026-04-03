import * as fs from 'fs/promises'
import * as path from 'path'

export interface DirListInput {
  dirPath: string
  recursive?: boolean
}

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: Date
}

export interface DirListOutput {
  path: string
  entries: FileInfo[]
}

export class DirListTool {
  readonly name = 'dir_list'
  readonly description = 'List directory contents'

  async execute(input: DirListInput): Promise<DirListOutput> {
    const resolvedPath = path.resolve(input.dirPath)
    const entries: FileInfo[] = []

    if (input.recursive) {
      await this.listRecursive(resolvedPath, entries)
    } else {
      const items = await fs.readdir(resolvedPath, { withFileTypes: true })
      for (const item of items) {
        const itemPath = path.join(resolvedPath, item.name)
        const stats = await fs.stat(itemPath)
        entries.push({
          name: item.name,
          path: itemPath,
          isDirectory: item.isDirectory(),
          size: stats.size,
          modified: stats.mtime,
        })
      }
    }

    return {
      path: resolvedPath,
      entries,
    }
  }

  private async listRecursive(dirPath: string, entries: FileInfo[]): Promise<void> {
    const items = await fs.readdir(dirPath, { withFileTypes: true })
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name)
      const stats = await fs.stat(itemPath)
      entries.push({
        name: item.name,
        path: itemPath,
        isDirectory: item.isDirectory(),
        size: stats.size,
        modified: stats.mtime,
      })

      if (item.isDirectory()) {
        await this.listRecursive(itemPath, entries)
      }
    }
  }
}
