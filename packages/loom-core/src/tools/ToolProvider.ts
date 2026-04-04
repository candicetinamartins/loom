import { injectable } from 'inversify'

export interface LoomTool {
  name: string
  description: string
  parameters: unknown
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

@injectable()
export class ToolProvider {
  private tools: Map<string, LoomTool> = new Map()

  registerTool(tool: LoomTool): void {
    this.tools.set(tool.name, tool)
  }

  getTool(name: string): LoomTool | undefined {
    return this.tools.get(name)
  }

  getTools(names?: string[]): LoomTool[] {
    if (names) {
      return names.map(n => this.tools.get(n)).filter((t): t is LoomTool => t !== undefined)
    }
    return Array.from(this.tools.values())
  }
}
