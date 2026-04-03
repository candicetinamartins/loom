import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TOMLParser } from '@loom/core'
import { GraphService } from '@loom/graph'

/**
 * Spec format: TOML + 3 markdown files
 * 
 * .[loom]/specs/{spec-name}/
 * ├── spec.toml          # Metadata, status, assignments
 * ├── requirements.md    # What needs to be built
 * ├── design.md          # How it should be built
 * └── tasks.md           # Checklist of work items
 */

export interface SpecManifest {
  name: string
  title: string
  description: string
  status: 'draft' | 'in-progress' | 'complete'
  createdAt: string
  updatedAt: string
  
  // Context for graph queries
  context: {
    description: string
    relatedModules: string[]
  }
  
  // Agent assignments
  assignments: {
    requirements: string  // agent name
    design: string
    tasks: string
  }
  
  // Which agents can work on this spec
  allowedAgents: string[]
}

export interface SpecContent {
  manifest: SpecManifest
  requirements: string
  design: string
  tasks: string
}

export interface SpecTask {
  id: string
  description: string
  status: 'todo' | 'in-progress' | 'done'
  assignedTo?: string
}

@injectable()
export class SpecService {
  private specs: Map<string, SpecContent> = new Map()
  private parser = new TOMLParser()

  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string,
    @inject(GraphService) private graphService: GraphService,
  ) {}

  async initialize(): Promise<void> {
    await this.loadAllSpecs()
    console.log(`[SpecService] Loaded ${this.specs.size} specs`)
  }

  /**
   * Create a new spec with wizard-assisted module detection
   */
  async createSpec(
    name: string,
    title: string,
    description: string,
  ): Promise<SpecContent> {
    const specDir = path.join(this.workspaceRoot, '.loom', 'specs', name)
    
    // Create directory
    await fs.mkdir(specDir, { recursive: true })
    
    // Graph-aware module suggestions
    const relatedModules = await this.suggestRelatedModules(description)
    
    const now = new Date().toISOString()
    
    // Create spec.toml
    const manifest: SpecManifest = {
      name,
      title,
      description,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      context: {
        description,
        relatedModules,
      },
      assignments: {
        requirements: 'architect',
        design: 'architect',
        tasks: 'orchestrator',
      },
      allowedAgents: ['orchestrator', 'engineer', 'architect', 'security', 'qa'],
    }
    
    await this.writeSpecToml(specDir, manifest)
    
    // Create empty markdown files
    await fs.writeFile(
      path.join(specDir, 'requirements.md'),
      `# Requirements: ${title}\n\n## Context\n\n${description}\n\n## Related Modules\n\n${relatedModules.map(m => `- \`${m}\``).join('\n')}\n\n## User Story\n\n[Describe what the user wants to achieve]\n\n## Acceptance Criteria\n\n- [ ] Criterion 1\n- [ ] Criterion 2\n`,
      'utf-8'
    )
    
    await fs.writeFile(
      path.join(specDir, 'design.md'),
      `# Design: ${title}\n\n## Overview\n\n[High-level architecture description]\n\n## Components\n\n### Component A\n- Responsibility:\n- Interface:\n\n### Component B\n- Responsibility:\n- Interface:\n\n## Data Flow\n\n[Describe how data moves through the system]\n\n## Decisions\n\n[Architecture Decision Records]\n`,
      'utf-8'
    )
    
    await fs.writeFile(
      path.join(specDir, 'tasks.md'),
      `# Tasks: ${title}\n\n## Requirements Phase\n- [ ] Draft requirements\n- [ ] Review with stakeholders\n\n## Design Phase\n- [ ] Create architecture diagram\n- [ ] Write ADRs\n- [ ] Get design approval\n\n## Implementation Phase\n- [ ] Setup\n- [ ] Core implementation\n- [ ] Tests\n- [ ] Documentation\n\n## Review Phase\n- [ ] Code review\n- [ ] Security review\n- [ ] QA testing\n`,
      'utf-8'
    )
    
    // Load and return
    const spec = await this.loadSpec(name)
    this.specs.set(name, spec)
    
    return spec
  }

  /**
   * Graph-aware wizard: suggest related modules based on description
   */
  async suggestRelatedModules(description: string): Promise<string[]> {
    try {
      // Use vector search to find semantically related functions
      const embedding = await this.graphService.generateEmbedding(description)
      
      const relatedFunctions = await this.graphService.semanticSearch(
        'Function',
        embedding,
        10,
      )
      
      // Get unique module paths
      const modulePaths = new Set<string>()
      for (const fn of relatedFunctions) {
        const module = await this.graphService.findModuleForNode(fn.id)
        if (module) {
          modulePaths.add(module.path)
        }
      }
      
      // Also check for high-churn modules
      const churnModules = await this.graphService.query(`
        MATCH (m:Module)
        WHERE m.churn_score > 0.5
        RETURN m.path
        ORDER BY m.churn_score DESC
        LIMIT 5
      `)
      
      for (const row of churnModules) {
        modulePaths.add(row['m.path'])
      }
      
      return Array.from(modulePaths).slice(0, 8)
    } catch {
      // Fallback if graph not available
      return []
    }
  }

  /**
   * Get a spec by name
   */
  async getSpec(name: string): Promise<SpecContent | null> {
    // Check cache
    if (this.specs.has(name)) {
      return this.specs.get(name)!
    }
    
    // Load from disk
    try {
      const spec = await this.loadSpec(name)
      this.specs.set(name, spec)
      return spec
    } catch {
      return null
    }
  }

  /**
   * Get all specs
   */
  getAllSpecs(): SpecContent[] {
    return Array.from(this.specs.values())
  }

  /**
   * Update spec status
   */
  async updateStatus(
    name: string,
    status: SpecManifest['status'],
  ): Promise<void> {
    const spec = await this.getSpec(name)
    if (!spec) throw new Error(`Spec not found: ${name}`)
    
    spec.manifest.status = status
    spec.manifest.updatedAt = new Date().toISOString()
    
    const specDir = path.join(this.workspaceRoot, '.loom', 'specs', name)
    await this.writeSpecToml(specDir, spec.manifest)
  }

  /**
   * Update task status
   */
  async updateTask(
    specName: string,
    taskId: string,
    status: SpecTask['status'],
  ): Promise<void> {
    const spec = await this.getSpec(specName)
    if (!spec) throw new Error(`Spec not found: ${specName}`)
    
    // Parse tasks from markdown and update
    const tasks = this.parseTasks(spec.tasks)
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      task.status = status
      spec.tasks = this.formatTasks(tasks)
      
      // Write back
      const specDir = path.join(this.workspaceRoot, '.loom', 'specs', specName)
      await fs.writeFile(path.join(specDir, 'tasks.md'), spec.tasks, 'utf-8')
    }
  }

  /**
   * Format spec for agent context injection
   */
  formatForContext(spec: SpecContent): string {
    return `[SPEC: ${spec.manifest.name}]
Title: ${spec.manifest.title}
Status: ${spec.manifest.status}
Related Modules: ${spec.manifest.context.relatedModules.join(', ')}

## Requirements
${spec.requirements.slice(0, 2000)}...

## Design
${spec.design.slice(0, 2000)}...

## Tasks
${this.formatTasksSummary(this.parseTasks(spec.tasks))}
[/SPEC]`
  }

  /**
   * Parse spec from disk
   */
  private async loadSpec(name: string): Promise<SpecContent> {
    const specDir = path.join(this.workspaceRoot, '.loom', 'specs', name)
    
    const [manifestContent, requirements, design, tasks] = await Promise.all([
      fs.readFile(path.join(specDir, 'spec.toml'), 'utf-8'),
      fs.readFile(path.join(specDir, 'requirements.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(specDir, 'design.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(specDir, 'tasks.md'), 'utf-8').catch(() => ''),
    ])
    
    const parsed = this.parser.parseSync(manifestContent)
    
    const manifest: SpecManifest = {
      name: parsed.name || name,
      title: parsed.title || name,
      description: parsed.description || '',
      status: parsed.status || 'draft',
      createdAt: parsed.created_at || new Date().toISOString(),
      updatedAt: parsed.updated_at || new Date().toISOString(),
      context: {
        description: parsed.context?.description || '',
        relatedModules: parsed.context?.related_modules || [],
      },
      assignments: {
        requirements: parsed.assignments?.requirements || 'architect',
        design: parsed.assignments?.design || 'architect',
        tasks: parsed.assignments?.tasks || 'orchestrator',
      },
      allowedAgents: parsed.allowed_agents || ['orchestrator', 'engineer', 'architect'],
    }
    
    return { manifest, requirements, design, tasks }
  }

  /**
   * Load all specs from disk
   */
  private async loadAllSpecs(): Promise<void> {
    const specsDir = path.join(this.workspaceRoot, '.loom', 'specs')
    
    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const spec = await this.loadSpec(entry.name)
            this.specs.set(entry.name, spec)
          } catch (error) {
            console.warn(`[SpecService] Failed to load spec ${entry.name}:`, error)
          }
        }
      }
    } catch {
      // Specs directory doesn't exist yet
    }
  }

  private async writeSpecToml(specDir: string, manifest: SpecManifest): Promise<void> {
    const toml = `# ${manifest.title}
name = "${manifest.name}"
title = "${manifest.title}"
description = "${manifest.description}"
status = "${manifest.status}"
created_at = "${manifest.createdAt}"
updated_at = "${manifest.updatedAt}"

[context]
description = "${manifest.context.description}"
related_modules = ${JSON.stringify(manifest.context.relatedModules)}

[assignments]
requirements = "${manifest.assignments.requirements}"
design = "${manifest.assignments.design}"
tasks = "${manifest.assignments.tasks}"

allowed_agents = ${JSON.stringify(manifest.allowedAgents)}
`
    await fs.writeFile(path.join(specDir, 'spec.toml'), toml, 'utf-8')
  }

  private parseTasks(tasksMd: string): SpecTask[] {
    const lines = tasksMd.split('\n')
    const tasks: SpecTask[] = []
    let currentSection = ''
    
    for (const line of lines) {
      // Track sections
      const sectionMatch = line.match(/^## (.+)$/)
      if (sectionMatch) {
        currentSection = sectionMatch[1]
        continue
      }
      
      // Parse task lines: "- [ ] Task description" or "- [x] Task description"
      const taskMatch = line.match(/^- \[([ x])\] (.+)$/)
      if (taskMatch) {
        tasks.push({
          id: `${currentSection}-${tasks.length}`,
          description: taskMatch[2],
          status: taskMatch[1] === 'x' ? 'done' : 'todo',
        })
      }
    }
    
    return tasks
  }

  private formatTasks(tasks: SpecTask[]): string {
    // Group by section
    const bySection = new Map<string, SpecTask[]>()
    
    for (const task of tasks) {
      const section = task.id.split('-')[0]
      if (!bySection.has(section)) {
        bySection.set(section, [])
      }
      bySection.get(section)!.push(task)
    }
    
    const lines: string[] = ['# Tasks']
    
    for (const [section, sectionTasks] of bySection) {
      lines.push(`\n## ${section}`)
      for (const task of sectionTasks) {
        const checkbox = task.status === 'done' ? '[x]' : '[ ]'
        lines.push(`- ${checkbox} ${task.description}`)
      }
    }
    
    return lines.join('\n')
  }

  private formatTasksSummary(tasks: SpecTask[]): string {
    const done = tasks.filter(t => t.status === 'done').length
    const total = tasks.length
    return `${done}/${total} tasks complete`
  }
}
