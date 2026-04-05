/**
 * SystemPromptBuilder - Assemble agent system prompts with mandatory context
 * 
 * Every agent system prompt MUST include:
 * 1. Graph context protocol (graph_search_semantic, memory_search, project-context.toml)
 * 2. Silent output protocol (no narration, [RESULT] block only)
 * 3. Extended thinking budget (if applicable)
 * 4. Skill instructions (active skills only)
 * 5. Flow context (current intent)
 */

import { TokenUsageTracker } from './TokenUsageTracker'
import { buildSystemPromptWithProtocol } from './AgentResultSchema'

import { FlowContext } from '../services/FlowTrackingService'

export interface AgentConfig {
  name: string
  model: string
  thinkingBudget: number
  role: string
  responsibilities: string[]
  toolGroups: string[]
  maxSteps: number
}

export interface ActiveSkill {
  name: string
  level: number
  prompt: string
  estimatedTokens: number
}

// FlowContext is imported from FlowTrackingService

export class SystemPromptBuilder {
  constructor(
    private tracker: TokenUsageTracker,
  ) {}

  /**
   * Build complete system prompt for an agent
   */
  buildPrompt(
    config: AgentConfig,
    task: string,
    activeSkills: ActiveSkill[] = [],
    flowContext?: FlowContext,
  ): string {
    const parts: string[] = []

    // 1. Base persona and role
    parts.push(this.buildBasePersona(config))

    // 2. Mandatory graph context protocol
    parts.push(this.buildGraphProtocol())

    // 3. Current task context
    parts.push(this.buildTaskContext(task))

    // 4. Flow context (if available)
    if (flowContext) {
      parts.push(this.buildFlowContext(flowContext))
    }

    // 5. Skill instructions (progressive disclosure)
    if (activeSkills.length > 0) {
      parts.push(this.buildSkillsContext(activeSkills))
    }

    // 6. Tool guidelines
    parts.push(this.buildToolGuidelines(config.toolGroups))

    // 7. Silent output protocol (mandatory)
    // This is added by buildSystemPromptWithProtocol wrapper

    const basePrompt = parts.join('\n\n')

    return buildSystemPromptWithProtocol(
      basePrompt,
      config.name,
      config.thinkingBudget,
    )
  }

  /**
   * Base agent persona
   */
  private buildBasePersona(config: AgentConfig): string {
    return `You are ${config.name}, a specialized AI agent in the Loom IDE.

Role: ${config.role}

Responsibilities:
${config.responsibilities.map(r => `- ${r}`).join('\n')}

Max steps for this task: ${config.maxSteps}
Model: ${config.model}`
  }

  /**
   * Mandatory graph context protocol
   * Every agent must query the graph before starting
   */
  private buildGraphProtocol(): string {
    return `## Graph Context Protocol (MANDATORY)

Before starting ANY task, you MUST:

1. Run graph_search_semantic with your task description
2. Run memory_search for relevant project decisions
3. Read .loom/project-context.toml if it exists

You have access to the knowledge graph containing:
- Every function, class, and module with complexity scores
- Documentation coverage for each component
- Git history and churn analysis
- Cross-references (who calls whom)
- Local package documentation (LoomDocs)
- Project memory (past decisions anchored to code)

Use graph_get_neighbourhood to expand context when you find relevant nodes.

NEVER guess about code structure — always query the graph first.`
  }

  /**
   * Current task context
   */
  private buildTaskContext(task: string): string {
    return `## Current Task

${task}

Execute this task using the available tools. Query the graph first, then proceed methodically.`
  }

  /**
   * Flow context (developer's current activity)
   */
  private buildFlowContext(flow: FlowContext): string {
    const events = flow.recentEvents.slice(-6).join(' → ')
    
    return `## Flow Context

Recent activity: ${events}
Inferred intent: ${flow.intent}

This context represents what the developer was doing before invoking you.
Align your approach with this intent.`
  }

  /**
   * Active skills (progressive disclosure)
   */
  private buildSkillsContext(skills: ActiveSkill[]): string {
    const lines = skills.map(s => `### ${s.name} (Level ${s.level})\n${s.prompt}`)
    
    return `## Active Skills

${lines.join('\n\n')}

Apply these skills as appropriate for the current task.`
  }

  /**
   * Build a default system prompt string (no agent config needed)
   */
  buildPromptString(userContext?: string): string {
    const parts: string[] = []
    parts.push('You are a helpful AI assistant in the Loom IDE.')
    parts.push(this.buildGraphProtocol())
    if (userContext) {
      parts.push(`## User Context\n\n${userContext}`)
    }
    return parts.join('\n\n')
  }

  /**
   * Tool group guidelines
   */
  private buildToolGuidelines(toolGroups: string[]): string {
    const guidelines: Record<string, string> = {
      file_ops: 'Use read_file before any write. Use edit_file for targeted changes.',
      code_search: 'Use search_code to find patterns. Use grep for exact text.',
      git: 'Use git_status and git_diff to understand current state.',
      shell: 'Use bash for CLI tools (npm, docker, etc.). Respect timeouts.',
      web: 'Use web_fetch for documentation. Use json_query for APIs.',
      graph: 'Query the graph first. Use semantic search for relevance.',
      memory: 'Search memories for past decisions. Store important findings.',
      debug: 'Use debug tools only when explicitly debugging.',
    }

    const relevant = toolGroups
      .filter(g => guidelines[g])
      .map(g => `- ${g}: ${guidelines[g]}`)

    return `## Tool Guidelines

${relevant.join('\n')}`
  }
}

/**
 * Agent configurations for all 12 fleet agents
 */
export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  orchestrator: {
    name: 'orchestrator',
    model: 'claude-opus-4-6',
    thinkingBudget: 8000,
    role: 'Task decomposition and wave planning',
    responsibilities: [
      'Decompose complex tasks into parallelizable subtasks',
      'Generate TOML wave plans with dependencies',
      'Coordinate agent execution through PipelineRunner',
      'Verify outputs between waves',
    ],
    toolGroups: ['file_ops', 'graph', 'memory'],
    maxSteps: 10,
  },

  engineer: {
    name: 'engineer',
    model: 'claude-sonnet-4-5',
    thinkingBudget: 3000,
    role: 'Implementation, testing, and bug fixing',
    responsibilities: [
      'Write clean, maintainable code',
      'Follow existing code patterns and style',
      'Add tests for new functionality',
      'Handle error cases gracefully',
    ],
    toolGroups: ['file_ops', 'code_search', 'git', 'shell', 'graph', 'memory'],
    maxSteps: 20,
  },

  architect: {
    name: 'architect',
    model: 'claude-opus-4-6',
    thinkingBudget: 6000,
    role: 'System design and ADRs',
    responsibilities: [
      'Design scalable system architectures',
      'Write Architecture Decision Records',
      'Create Mermaid diagrams',
      'Define API contracts',
    ],
    toolGroups: ['file_ops', 'code_search', 'graph', 'memory'],
    maxSteps: 15,
  },

  reviewer: {
    name: 'reviewer',
    model: 'claude-sonnet-4-5',
    thinkingBudget: 2000,
    role: 'Code review and quality assurance',
    responsibilities: [
      'Review code for correctness',
      'Identify security issues',
      'Check performance implications',
      'Verify test coverage',
    ],
    toolGroups: ['file_ops', 'code_search', 'graph', 'memory'],
    maxSteps: 12,
  },

  security: {
    name: 'security',
    model: 'claude-sonnet-4-5',
    thinkingBudget: 3000,
    role: 'Security auditing and OWASP compliance',
    responsibilities: [
      'Check for OWASP Top 10 vulnerabilities',
      'Verify input validation and sanitization',
      'Review authentication and authorization',
      'Identify injection risks',
    ],
    toolGroups: ['file_ops', 'code_search', 'graph', 'memory'],
    maxSteps: 15,
  },

  qa: {
    name: 'qa',
    model: 'claude-haiku-4-5',
    thinkingBudget: 1000,
    role: 'Test strategy and coverage',
    responsibilities: [
      'Design comprehensive test suites',
      'Write unit and integration tests',
      'Test edge cases and error conditions',
      'Verify code coverage',
    ],
    toolGroups: ['file_ops', 'code_search', 'shell', 'graph'],
    maxSteps: 15,
  },

  devops: {
    name: 'devops',
    model: 'claude-sonnet-4-5',
    thinkingBudget: 2000,
    role: 'Infrastructure and deployment',
    responsibilities: [
      'Configure Docker and Kubernetes',
      'Set up CI/CD pipelines',
      'Manage infrastructure as code',
      'Configure monitoring and logging',
    ],
    toolGroups: ['file_ops', 'shell', 'web', 'graph', 'memory'],
    maxSteps: 15,
  },

  researcher: {
    name: 'researcher',
    model: 'perplexity/sonar-pro',
    thinkingBudget: 1000,
    role: 'Documentation and API research',
    responsibilities: [
      'Find official documentation',
      'Research current best practices',
      'Compare different approaches',
      'Provide citations and references',
    ],
    toolGroups: ['web', 'graph', 'memory'],
    maxSteps: 10,
  },

  documentarian: {
    name: 'documentarian',
    model: 'claude-haiku-4-5',
    thinkingBudget: 500,
    role: 'Documentation writing',
    responsibilities: [
      'Write clear README files',
      'Document APIs and interfaces',
      'Maintain changelogs',
      'Create usage examples',
    ],
    toolGroups: ['file_ops', 'graph', 'memory'],
    maxSteps: 10,
  },

  data: {
    name: 'data',
    model: 'claude-sonnet-4-5',
    thinkingBudget: 2000,
    role: 'SQL, schemas, and migrations',
    responsibilities: [
      'Design normalized schemas',
      'Create efficient SQL queries',
      'Write migration scripts',
      'Optimize performance and indexing',
    ],
    toolGroups: ['file_ops', 'code_search', 'graph', 'memory'],
    maxSteps: 15,
  },

  debugger: {
    name: 'debugger',
    model: 'claude-sonnet-4-5',
    thinkingBudget: 4000,
    role: 'Root cause analysis and debugging',
    responsibilities: [
      'Analyze error messages and stack traces',
      'Identify root causes of issues',
      'Set breakpoints strategically',
      'Verify fixes with tests',
    ],
    toolGroups: ['file_ops', 'code_search', 'git', 'shell', 'debug', 'graph'],
    maxSteps: 15,
  },

  explorer: {
    name: 'explorer',
    model: 'claude-haiku-4-5',
    thinkingBudget: 0,
    role: 'Fast navigation and read-only exploration',
    responsibilities: [
      'Read files quickly and efficiently',
      'Search for code patterns',
      'Navigate the codebase structure',
      'Summarize code sections',
    ],
    toolGroups: ['file_ops', 'code_search', 'graph'],
    maxSteps: 20,
  },
}
