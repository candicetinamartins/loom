import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TOMLParser } from '../config/TOMLParser'

export interface ProjectContext {
  name: string
  type: string
  description: string
  framework?: {
    name: string
    version: string
  }
  loom: {
    preferredAgent: string
    autoFlow: boolean
    defaultMode: 'CODE' | 'ASK'
  }
}

@injectable()
export class ProjectContextService {
  private context: ProjectContext | null = null
  private parser = new TOMLParser()

  constructor(@inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string) {}

  async detectAndLoad(): Promise<ProjectContext | null> {
    // Try to load existing project-context.toml
    const contextPath = path.join(this.workspaceRoot, '.loom', 'project-context.toml')
    
    try {
      const content = await fs.readFile(contextPath, 'utf-8')
      const parsed = this.parser.parse<Record<string, any>>(content)
      this.context = this.validateAndNormalize(parsed)
      return this.context
    } catch {
      // File doesn't exist, try to auto-detect
      return this.autoDetectContext()
    }
  }

  private async autoDetectContext(): Promise<ProjectContext | null> {
    const detected = await this.detectProjectType()
    if (!detected) return null

    // Create default context based on detection
    this.context = {
      name: detected.name,
      type: detected.type,
      description: `Auto-detected ${detected.type} project`,
      framework: detected.framework,
      loom: {
        preferredAgent: this.getPreferredAgentForType(detected.type),
        autoFlow: true,
        defaultMode: 'CODE'
      }
    }

    // Save the auto-detected context
    await this.saveContext()
    return this.context
  }

  private async detectProjectType(): Promise<{
    name: string
    type: string
    framework?: { name: string; version: string }
  } | null> {
    const indicators = [
      { file: 'package.json', type: 'typescript', parser: this.parsePackageJson.bind(this) },
      { file: 'Cargo.toml', type: 'rust', parser: this.parseCargoToml.bind(this) },
      { file: 'go.mod', type: 'go', parser: this.parseGoMod.bind(this) },
      { file: 'requirements.txt', type: 'python', parser: this.parsePython.bind(this) },
      { file: 'pom.xml', type: 'java', parser: this.parseJava.bind(this) },
      { file: 'build.gradle', type: 'java', parser: this.parseJava.bind(this) },
    ]

    for (const indicator of indicators) {
      const filePath = path.join(this.workspaceRoot, indicator.file)
      try {
        await fs.access(filePath)
        const content = await fs.readFile(filePath, 'utf-8')
        const parsed = await indicator.parser(content)
        return {
          name: parsed.name || path.basename(this.workspaceRoot),
          type: indicator.type,
          framework: parsed.framework
        }
      } catch {
        continue
      }
    }

    return null
  }

  private async parsePackageJson(content: string): Promise<{
    name: string
    framework?: { name: string; version: string }
  }> {
    const json = JSON.parse(content)
    const deps = { ...json.dependencies, ...json.devDependencies }
    
    let framework: { name: string; version: string } | undefined
    
    if (deps['@theia/core']) {
      framework = { name: 'theia', version: deps['@theia/core'].replace('^', '') }
    } else if (deps['react']) {
      framework = { name: 'react', version: deps['react'].replace('^', '') }
    } else if (deps['vue']) {
      framework = { name: 'vue', version: deps['vue'].replace('^', '') }
    } else if (deps['@angular/core']) {
      framework = { name: 'angular', version: deps['@angular/core'].replace('^', '') }
    }

    return { name: json.name || 'unnamed-project', framework }
  }

  private async parseCargoToml(content: string): Promise<{
    name: string
    framework?: { name: string; version: string }
  }> {
    const parsed = this.parser.parse<Record<string, any>>(content)
    return { name: parsed.package?.name || 'unnamed-rust-project' }
  }

  private async parseGoMod(content: string): Promise<{
    name: string
    framework?: { name: string; version: string }
  }> {
    const lines = content.split('\n')
    const moduleLine = lines.find(l => l.startsWith('module '))
    const name = moduleLine ? moduleLine.replace('module ', '').trim() : 'unnamed-go-project'
    return { name }
  }

  private async parsePython(content: string): Promise<{
    name: string
    framework?: { name: string; version: string }
  }> {
    // Simple detection - could be enhanced
    return { name: path.basename(this.workspaceRoot) }
  }

  private async parseJava(content: string): Promise<{
    name: string
    framework?: { name: string; version: string }
  }> {
    // Simple detection from pom.xml or build.gradle
    return { name: path.basename(this.workspaceRoot) }
  }

  private getPreferredAgentForType(projectType: string): string {
    const agentMap: Record<string, string> = {
      'typescript': 'engineer',
      'rust': 'engineer',
      'go': 'engineer',
      'python': 'data',
      'java': 'engineer',
    }
    return agentMap[projectType] || 'engineer'
  }

  private validateAndNormalize(parsed: any): ProjectContext {
    return {
      name: parsed.project?.name || 'unnamed-project',
      type: parsed.project?.type || 'unknown',
      description: parsed.project?.description || '',
      framework: parsed.framework,
      loom: {
        preferredAgent: parsed.loom?.preferred_agent || 'engineer',
        autoFlow: parsed.loom?.auto_flow ?? true,
        defaultMode: parsed.loom?.default_mode || 'CODE'
      }
    }
  }

  private async saveContext(): Promise<void> {
    if (!this.context) return

    const loomDir = path.join(this.workspaceRoot, '.loom')
    try {
      await fs.mkdir(loomDir, { recursive: true })
    } catch {
      // Directory might already exist
    }

    const contextPath = path.join(loomDir, 'project-context.toml')
    const tomlContent = this.generateTOML(this.context)
    
    await fs.writeFile(contextPath, tomlContent, 'utf-8')
  }

  private generateTOML(context: ProjectContext): string {
    return `# Auto-generated project context
[project]
name = "${context.name}"
type = "${context.type}"
description = "${context.description}"

[loom]
preferred_agent = "${context.loom.preferredAgent}"
auto_flow = ${context.loom.autoFlow}
default_mode = "${context.loom.defaultMode}"
`
  }

  getContext(): ProjectContext | null {
    return this.context
  }

  async reload(): Promise<ProjectContext | null> {
    this.context = null
    return this.detectAndLoad()
  }
}
