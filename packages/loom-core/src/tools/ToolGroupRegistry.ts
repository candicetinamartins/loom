export const ToolGroups = {
  FILE_OPS: 'file_ops',
  CODE_SEARCH: 'code_search',
  GIT: 'git',
  SHELL: 'shell',
  WEB: 'web',
  GRAPH: 'graph',
  MEMORY: 'memory',
  DEBUG: 'debug',
  NOTEBOOK: 'notebook',
  LSP: 'lsp',
  CHECKPOINT: 'checkpoint',
  SKILL: 'skill',
  SPEC: 'spec',
  AGENT: 'agent',
  TERMINAL: 'terminal',
} as const

export type ToolGroupName = typeof ToolGroups[keyof typeof ToolGroups]

export interface ToolDefinition {
  name: string
  description: string
  group: ToolGroupName
  estimatedTokens: number
}

export interface ToolGroup {
  name: ToolGroupName
  tools: ToolDefinition[]
  totalEstimatedTokens: number
}

export class ToolGroupRegistry {
  private groups: Map<ToolGroupName, ToolGroup> = new Map()

  registerGroup(group: ToolGroup): void {
    this.groups.set(group.name, group)
  }

  getGroup(name: ToolGroupName): ToolGroup | undefined {
    return this.groups.get(name)
  }

  getAllGroups(): ToolGroup[] {
    return Array.from(this.groups.values())
  }

  estimateTokens(groupNames: ToolGroupName[]): number {
    let total = 0
    for (const name of groupNames) {
      const group = this.getGroup(name)
      if (group) {
        total += group.totalEstimatedTokens
      }
    }
    return total
  }

  getToolsForGroup(groupName: ToolGroupName): ToolDefinition[] {
    const group = this.getGroup(groupName)
    return group?.tools ?? []
  }

  getAllTools(): ToolDefinition[] {
    const allTools: ToolDefinition[] = []
    for (const group of this.groups.values()) {
      allTools.push(...group.tools)
    }
    return allTools
  }
}

export function registerBuiltinGroups(registry: ToolGroupRegistry): void {
  registry.registerGroup({
    name: ToolGroups.FILE_OPS,
    tools: [
      { name: 'read_file', description: 'Read file contents', group: ToolGroups.FILE_OPS, estimatedTokens: 500 },
      { name: 'write_file', description: 'Write file contents', group: ToolGroups.FILE_OPS, estimatedTokens: 800 },
      { name: 'edit_file', description: 'Edit file with string replacement', group: ToolGroups.FILE_OPS, estimatedTokens: 600 },
      { name: 'list_dir', description: 'List directory contents', group: ToolGroups.FILE_OPS, estimatedTokens: 400 },
      { name: 'find_files', description: 'Find files matching pattern', group: ToolGroups.FILE_OPS, estimatedTokens: 500 },
    ],
    totalEstimatedTokens: 2800,
  })

  registry.registerGroup({
    name: ToolGroups.CODE_SEARCH,
    tools: [
      { name: 'search_code', description: 'Search code using ripgrep', group: ToolGroups.CODE_SEARCH, estimatedTokens: 500 },
      { name: 'grep', description: 'Search text in files', group: ToolGroups.CODE_SEARCH, estimatedTokens: 500 },
    ],
    totalEstimatedTokens: 1000,
  })

  registry.registerGroup({
    name: ToolGroups.GIT,
    tools: [
      { name: 'git_status', description: 'Get git status', group: ToolGroups.GIT, estimatedTokens: 400 },
      { name: 'git_diff', description: 'Get git diff', group: ToolGroups.GIT, estimatedTokens: 500 },
      { name: 'git_log', description: 'Get git log', group: ToolGroups.GIT, estimatedTokens: 400 },
    ],
    totalEstimatedTokens: 1300,
  })

  registry.registerGroup({
    name: ToolGroups.SHELL,
    tools: [
      { name: 'bash', description: 'Execute shell command', group: ToolGroups.SHELL, estimatedTokens: 1000 },
    ],
    totalEstimatedTokens: 1000,
  })

  registry.registerGroup({
    name: ToolGroups.WEB,
    tools: [
      { name: 'web_fetch', description: 'Fetch web content', group: ToolGroups.WEB, estimatedTokens: 800 },
      { name: 'json_query', description: 'Fetch and query JSON from URL', group: ToolGroups.WEB, estimatedTokens: 600 },
    ],
    totalEstimatedTokens: 1400,
  })

  registry.registerGroup({
    name: ToolGroups.GRAPH,
    tools: [
      { name: 'graph_query', description: 'Query graph with Kuzu', group: ToolGroups.GRAPH, estimatedTokens: 600 },
    ],
    totalEstimatedTokens: 600,
  })

  registry.registerGroup({
    name: ToolGroups.MEMORY,
    tools: [
      { name: 'memory_read', description: 'Read from memory', group: ToolGroups.MEMORY, estimatedTokens: 300 },
      { name: 'memory_write', description: 'Write to memory', group: ToolGroups.MEMORY, estimatedTokens: 300 },
    ],
    totalEstimatedTokens: 600,
  })

  registry.registerGroup({
    name: ToolGroups.DEBUG,
    tools: [
      { name: 'debug_set_breakpoint', description: 'Set debug breakpoint', group: ToolGroups.DEBUG, estimatedTokens: 300 },
      { name: 'debug_start_session', description: 'Start debug session', group: ToolGroups.DEBUG, estimatedTokens: 500 },
      { name: 'debug_read_variables', description: 'Read debug variables', group: ToolGroups.DEBUG, estimatedTokens: 400 },
      { name: 'debug_step', description: 'Step debug execution', group: ToolGroups.DEBUG, estimatedTokens: 300 },
    ],
    totalEstimatedTokens: 1500,
  })

  registry.registerGroup({
    name: ToolGroups.NOTEBOOK,
    tools: [
      { name: 'notebook_read_cell', description: 'Read notebook cell', group: ToolGroups.NOTEBOOK, estimatedTokens: 400 },
      { name: 'notebook_write_cell', description: 'Write notebook cell', group: ToolGroups.NOTEBOOK, estimatedTokens: 500 },
      { name: 'notebook_run_cell', description: 'Run notebook cell', group: ToolGroups.NOTEBOOK, estimatedTokens: 600 },
    ],
    totalEstimatedTokens: 1500,
  })

  registry.registerGroup({
    name: ToolGroups.CHECKPOINT,
    tools: [
      { name: 'checkpoint_create', description: 'Create a checkpoint', group: ToolGroups.CHECKPOINT, estimatedTokens: 400 },
      { name: 'checkpoint_restore', description: 'Restore from checkpoint', group: ToolGroups.CHECKPOINT, estimatedTokens: 400 },
    ],
    totalEstimatedTokens: 800,
  })

  registry.registerGroup({
    name: ToolGroups.SKILL,
    tools: [
      { name: 'skill_load', description: 'Load a skill', group: ToolGroups.SKILL, estimatedTokens: 300 },
    ],
    totalEstimatedTokens: 300,
  })

  registry.registerGroup({
    name: ToolGroups.SPEC,
    tools: [
      { name: 'spec_read', description: 'Read a spec', group: ToolGroups.SPEC, estimatedTokens: 500 },
    ],
    totalEstimatedTokens: 500,
  })

  registry.registerGroup({
    name: ToolGroups.AGENT,
    tools: [
      { name: 'agent_dispatch', description: 'Dispatch to an agent', group: ToolGroups.AGENT, estimatedTokens: 600 },
    ],
    totalEstimatedTokens: 600,
  })

  registry.registerGroup({
    name: ToolGroups.TERMINAL,
    tools: [
      { name: 'terminal_output', description: 'Get terminal output', group: ToolGroups.TERMINAL, estimatedTokens: 400 },
    ],
    totalEstimatedTokens: 400,
  })
}
