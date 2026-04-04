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

// Import tool implementations
import { FileReadTool } from './FileReadTool'
import { FileWriteTool } from './FileWriteTool'
import { FileEditTool } from './FileEditTool'
import { DirListTool } from './DirListTool'
import { GrepTool } from './GrepTool'
import { BashTool } from './BashTool'
import { GitDiffTool } from './GitDiffTool'
import { GitLogTool } from './GitLogTool'
import { WebFetchTool } from './WebFetchTool'
import { GraphQueryTool } from './GraphQueryTool'
import { CheckpointCreateTool } from './CheckpointCreateTool'
import { CheckpointRestoreTool } from './CheckpointRestoreTool'
import { MemoryReadTool } from './MemoryReadTool'
import { MemoryWriteTool } from './MemoryWriteTool'
import { SkillLoadTool } from './SkillLoadTool'
import { SpecReadTool } from './SpecReadTool'
import { TerminalOutputTool } from './TerminalOutputTool'
import { AgentDispatchTool } from './AgentDispatchTool'
import { LspDiagnosticsTool } from './LspDiagnosticsTool'

export interface ToolDefinition {
  name: string
  description: string
  group: ToolGroupName
  estimatedTokens: number
  parameters?: Record<string, any>
  execute?: (args: any) => Promise<any>
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
  // Instantiate tools
  const fileReadTool = new FileReadTool()
  const fileWriteTool = new FileWriteTool()
  const fileEditTool = new FileEditTool()
  const dirListTool = new DirListTool()
  const grepTool = new GrepTool()
  const bashTool = new BashTool()
  const gitDiffTool = new GitDiffTool()
  const gitLogTool = new GitLogTool()
  const webFetchTool = new WebFetchTool()
  const graphQueryTool = new GraphQueryTool()
  const checkpointCreateTool = new CheckpointCreateTool()
  const checkpointRestoreTool = new CheckpointRestoreTool()
  const memoryReadTool = new MemoryReadTool()
  const memoryWriteTool = new MemoryWriteTool()
  const skillLoadTool = new SkillLoadTool()
  const specReadTool = new SpecReadTool()
  const terminalOutputTool = new TerminalOutputTool()
  const agentDispatchTool = new AgentDispatchTool()
  const lspDiagnosticsTool = new LspDiagnosticsTool()

  registry.registerGroup({
    name: ToolGroups.FILE_OPS,
    tools: [
      {
        name: 'read_file',
        description: 'Read file contents',
        group: ToolGroups.FILE_OPS,
        estimatedTokens: 500,
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file' },
            offset: { type: 'number', description: 'Line offset to start reading' },
            limit: { type: 'number', description: 'Number of lines to read' },
          },
          required: ['filePath'],
        },
        execute: (args: any) => fileReadTool.execute({
          filePath: args.filePath || args.path,
          offset: args.offset,
          limit: args.limit,
        }),
      },
      {
        name: 'write_file',
        description: 'Write file contents',
        group: ToolGroups.FILE_OPS,
        estimatedTokens: 800,
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file' },
            content: { type: 'string', description: 'Content to write' },
            createDirectories: { type: 'boolean', description: 'Create parent directories' },
          },
          required: ['filePath', 'content'],
        },
        execute: (args: any) => fileWriteTool.execute({
          filePath: args.filePath || args.path,
          content: args.content,
          createDirectories: args.createDirectories,
        }),
      },
      {
        name: 'edit_file',
        description: 'Edit file with string replacement',
        group: ToolGroups.FILE_OPS,
        estimatedTokens: 600,
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file' },
            oldString: { type: 'string', description: 'String to find' },
            newString: { type: 'string', description: 'Replacement string' },
          },
          required: ['filePath', 'oldString', 'newString'],
        },
        execute: (args: any) => fileEditTool.execute({
          filePath: args.filePath || args.path,
          oldString: args.oldString || args.old_string,
          newString: args.newString || args.new_string,
        }),
      },
      {
        name: 'list_dir',
        description: 'List directory contents',
        group: ToolGroups.FILE_OPS,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {
            dirPath: { type: 'string', description: 'Directory path' },
            recursive: { type: 'boolean', description: 'List recursively' },
          },
          required: ['dirPath'],
        },
        execute: (args: any) => dirListTool.execute({
          dirPath: args.dirPath || args.path,
          recursive: args.recursive,
        }),
      },
      {
        name: 'find_files',
        description: 'Find files matching pattern',
        group: ToolGroups.FILE_OPS,
        estimatedTokens: 500,
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern' },
            cwd: { type: 'string', description: 'Working directory' },
          },
          required: ['pattern'],
        },
        execute: async (args: any) => {
          const { glob } = await import('glob')
          const files = await glob(args.pattern, { cwd: args.cwd || process.cwd() })
          return { files }
        },
      },
    ],
    totalEstimatedTokens: 2800,
  })

  registry.registerGroup({
    name: ToolGroups.CODE_SEARCH,
    tools: [
      {
        name: 'search_code',
        description: 'Search code using ripgrep',
        group: ToolGroups.CODE_SEARCH,
        estimatedTokens: 500,
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern' },
            path: { type: 'string', description: 'Directory to search' },
            include: { type: 'string', description: 'File glob to include' },
            exclude: { type: 'string', description: 'File glob to exclude' },
          },
          required: ['pattern'],
        },
        execute: (args: any) => grepTool.execute({
          pattern: args.pattern,
          paths: args.path ? [args.path] : [process.cwd()],
          include: args.include ? [args.include] : undefined,
          exclude: args.exclude ? [args.exclude] : undefined,
        }),
      },
      {
        name: 'grep',
        description: 'Search text in files',
        group: ToolGroups.CODE_SEARCH,
        estimatedTokens: 500,
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Pattern to search' },
            path: { type: 'string', description: 'Directory to search' },
            include: { type: 'string', description: 'File pattern' },
          },
          required: ['pattern'],
        },
        execute: (args: any) => grepTool.execute({
          pattern: args.pattern,
          paths: args.path ? [args.path] : [process.cwd()],
          include: args.include ? [args.include] : undefined,
        }),
      },
    ],
    totalEstimatedTokens: 1000,
  })

  registry.registerGroup({
    name: ToolGroups.GIT,
    tools: [
      {
        name: 'git_status',
        description: 'Get git status',
        group: ToolGroups.GIT,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        execute: async () => {
          const { exec } = await import('child_process')
          const { promisify } = await import('util')
          const execAsync = promisify(exec)
          const { stdout } = await execAsync('git status --porcelain')
          const files = stdout.trim().split('\n').filter(Boolean).map(line => ({
            status: line.substring(0, 2).trim(),
            path: line.substring(3),
          }))
          return { files, hasChanges: files.length > 0 }
        },
      },
      {
        name: 'git_diff',
        description: 'Get git diff',
        group: ToolGroups.GIT,
        estimatedTokens: 500,
        parameters: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'Specific file to diff' },
            staged: { type: 'boolean', description: 'Show staged changes' },
          },
          required: [],
        },
        execute: (args: any) => gitDiffTool.execute({
          filePath: args.file,
          staged: args.staged,
        }),
      },
      {
        name: 'git_log',
        description: 'Get git log',
        group: ToolGroups.GIT,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {
            maxCount: { type: 'number', description: 'Number of commits' },
            file: { type: 'string', description: 'Show history for file' },
          },
          required: [],
        },
        execute: (args: any) => gitLogTool.execute({
          maxCount: args.maxCount || 10,
          filePath: args.file,
        }),
      },
    ],
    totalEstimatedTokens: 1300,
  })

  registry.registerGroup({
    name: ToolGroups.SHELL,
    tools: [
      {
        name: 'bash',
        description: 'Execute shell command',
        group: ToolGroups.SHELL,
        estimatedTokens: 1000,
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'number', description: 'Timeout in ms' },
          },
          required: ['command'],
        },
        execute: (args: any) => bashTool.execute({
          command: args.command,
          cwd: args.cwd,
          timeout: args.timeout,
        }),
      },
    ],
    totalEstimatedTokens: 1000,
  })

  registry.registerGroup({
    name: ToolGroups.WEB,
    tools: [
      {
        name: 'web_fetch',
        description: 'Fetch web content',
        group: ToolGroups.WEB,
        estimatedTokens: 800,
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            maxLength: { type: 'number', description: 'Max content length' },
          },
          required: ['url'],
        },
        execute: (args: any) => webFetchTool.execute({
          url: args.url,
          maxLength: args.maxLength,
        }),
      },
      {
        name: 'json_query',
        description: 'Fetch and query JSON from URL',
        group: ToolGroups.WEB,
        estimatedTokens: 600,
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            query: { type: 'string', description: 'JSONPath query' },
          },
          required: ['url'],
        },
        execute: async (args: any) => {
          const result = await webFetchTool.execute({ url: args.url })
          try {
            const json = JSON.parse(result.content)
            return { json, success: true }
          } catch (e) {
            return { error: 'Invalid JSON', success: false }
          }
        },
      },
    ],
    totalEstimatedTokens: 1400,
  })

  registry.registerGroup({
    name: ToolGroups.GRAPH,
    tools: [
      {
        name: 'graph_query',
        description: 'Query graph with Kuzu',
        group: ToolGroups.GRAPH,
        estimatedTokens: 600,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Cypher query' },
          },
          required: ['query'],
        },
        execute: (args: any) => graphQueryTool.execute({ query: args.query }),
      },
    ],
    totalEstimatedTokens: 600,
  })

  registry.registerGroup({
    name: ToolGroups.MEMORY,
    tools: [
      {
        name: 'memory_read',
        description: 'Read from memory',
        group: ToolGroups.MEMORY,
        estimatedTokens: 300,
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Memory ID' },
          },
          required: ['id'],
        },
        execute: (args: any) => memoryReadTool.execute({ id: args.id }),
      },
      {
        name: 'memory_write',
        description: 'Write to memory',
        group: ToolGroups.MEMORY,
        estimatedTokens: 300,
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Content to store' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
          },
          required: ['content'],
        },
        execute: (args: any) => memoryWriteTool.execute({
          content: args.content,
          tags: args.tags,
        }),
      },
    ],
    totalEstimatedTokens: 600,
  })

  registry.registerGroup({
    name: ToolGroups.DEBUG,
    tools: [
      {
        name: 'debug_set_breakpoint',
        description: 'Set debug breakpoint',
        group: ToolGroups.DEBUG,
        estimatedTokens: 300,
        parameters: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File path' },
            line: { type: 'number', description: 'Line number' },
          },
          required: ['file', 'line'],
        },
        execute: async (args: any) => ({ success: true, message: 'Breakpoint set' }),
      },
      {
        name: 'debug_start_session',
        description: 'Start debug session',
        group: ToolGroups.DEBUG,
        estimatedTokens: 500,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        execute: async () => ({ success: true, sessionId: 'stub-session' }),
      },
      {
        name: 'debug_read_variables',
        description: 'Read debug variables',
        group: ToolGroups.DEBUG,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        execute: async () => ({ variables: [] }),
      },
      {
        name: 'debug_step',
        description: 'Step debug execution',
        group: ToolGroups.DEBUG,
        estimatedTokens: 300,
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['over', 'into', 'out'], description: 'Step type' },
          },
          required: [],
        },
        execute: async () => ({ success: true }),
      },
    ],
    totalEstimatedTokens: 1500,
  })

  registry.registerGroup({
    name: ToolGroups.NOTEBOOK,
    tools: [
      {
        name: 'notebook_read_cell',
        description: 'Read notebook cell',
        group: ToolGroups.NOTEBOOK,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: 'Notebook path' },
            index: { type: 'number', description: 'Cell index' },
          },
          required: ['notebook', 'index'],
        },
        execute: async (args: any) => ({ content: '', cellType: 'code' }),
      },
      {
        name: 'notebook_write_cell',
        description: 'Write notebook cell',
        group: ToolGroups.NOTEBOOK,
        estimatedTokens: 500,
        parameters: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: 'Notebook path' },
            index: { type: 'number', description: 'Cell index' },
            content: { type: 'string', description: 'Cell content' },
          },
          required: ['notebook', 'index', 'content'],
        },
        execute: async () => ({ success: true }),
      },
      {
        name: 'notebook_run_cell',
        description: 'Run notebook cell',
        group: ToolGroups.NOTEBOOK,
        estimatedTokens: 600,
        parameters: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: 'Notebook path' },
            index: { type: 'number', description: 'Cell index' },
          },
          required: ['notebook', 'index'],
        },
        execute: async () => ({ success: true, output: '' }),
      },
    ],
    totalEstimatedTokens: 1500,
  })

  registry.registerGroup({
    name: ToolGroups.CHECKPOINT,
    tools: [
      {
        name: 'checkpoint_create',
        description: 'Create a checkpoint',
        group: ToolGroups.CHECKPOINT,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Checkpoint label' },
          },
          required: [],
        },
        execute: (args: any) => checkpointCreateTool.execute({ label: args.label }),
      },
      {
        name: 'checkpoint_restore',
        description: 'Restore from checkpoint',
        group: ToolGroups.CHECKPOINT,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Checkpoint ID' },
          },
          required: ['id'],
        },
        execute: (args: any) => checkpointRestoreTool.execute({ checkpointId: args.id }),
      },
    ],
    totalEstimatedTokens: 800,
  })

  registry.registerGroup({
    name: ToolGroups.SKILL,
    tools: [
      {
        name: 'skill_load',
        description: 'Load a skill',
        group: ToolGroups.SKILL,
        estimatedTokens: 300,
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill name' },
          },
          required: ['name'],
        },
        execute: (args: any) => skillLoadTool.execute({ skillName: args.name }),
      },
    ],
    totalEstimatedTokens: 300,
  })

  registry.registerGroup({
    name: ToolGroups.SPEC,
    tools: [
      {
        name: 'spec_read',
        description: 'Read a spec',
        group: ToolGroups.SPEC,
        estimatedTokens: 500,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Spec file path' },
          },
          required: ['path'],
        },
        execute: (args: any) => specReadTool.execute({ specPath: args.path }),
      },
    ],
    totalEstimatedTokens: 500,
  })

  registry.registerGroup({
    name: ToolGroups.AGENT,
    tools: [
      {
        name: 'agent_dispatch',
        description: 'Dispatch to an agent',
        group: ToolGroups.AGENT,
        estimatedTokens: 600,
        parameters: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Agent name' },
            task: { type: 'string', description: 'Task description' },
          },
          required: ['agent', 'task'],
        },
        execute: (args: any) => agentDispatchTool.execute({
          agentName: args.agent,
          task: args.task,
        }),
      },
    ],
    totalEstimatedTokens: 600,
  })

  registry.registerGroup({
    name: ToolGroups.TERMINAL,
    tools: [
      {
        name: 'terminal_output',
        description: 'Get terminal output',
        group: ToolGroups.TERMINAL,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {
            terminalId: { type: 'string', description: 'Terminal ID' },
          },
          required: [],
        },
        execute: (args: any) => terminalOutputTool.execute({
          terminalId: args.terminalId,
        }),
      },
    ],
    totalEstimatedTokens: 400,
  })

  registry.registerGroup({
    name: ToolGroups.LSP,
    tools: [
      {
        name: 'lsp_diagnostics',
        description: 'Get LSP diagnostics',
        group: ToolGroups.LSP,
        estimatedTokens: 400,
        parameters: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File path' },
          },
          required: [],
        },
        execute: (args: any) => lspDiagnosticsTool.execute({
          filePath: args.file,
        }),
      },
    ],
    totalEstimatedTokens: 400,
  })
}
