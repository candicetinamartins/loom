import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TOMLParser } from '../utils/TOMLParser'

export interface SkillManifest {
  name: string
  title: string
  description: string
  version: string
  author: string
  
  // Progressive disclosure levels
  levels: SkillLevel[]
  
  // Activation
  activation: {
    keywords: string[]
    agents: string[]
  }
  
  // Tools this skill provides
  tools?: string[]
  
  // Metadata
  tags: string[]
  category: string
}

export interface SkillLevel {
  level: number
  title: string
  description: string
  prompt: string
  when_to_use: string
}

/**
 * SkillService - VoltAgent-compatible skill system
 * 
 * Skills are defined in YAML + TOML frontmatter format:
 * ```yaml
 * ---
 * name = "refactor-extract"
 * title = "Extract Function Refactoring"
 * [activation]
 * keywords = ["extract", "refactor function"]
 * agents = ["engineer"]
 * ---
 * 
 * ## Level 1: Basic
 * ...prompt...
 * 
 * ## Level 2: Advanced
 * ...prompt...
 * ```
 */
@injectable()
export class SkillService {
  private skills: Map<string, SkillManifest> = new Map()
  private parser = new TOMLParser()

  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string
  ) {}

  async initialize(): Promise<void> {
    // Load built-in skills
    await this.loadBuiltinSkills()
    
    // Load user skills from .loom/skills/
    await this.loadUserSkills()
    
    console.log(`[SkillService] Loaded ${this.skills.size} skills`)
  }

  private async loadBuiltinSkills(): Promise<void> {
    // Built-in skills are in packages/loom-agents/src/skills/
    const skillsDir = path.join(this.workspaceRoot, 'packages', 'loom-agents', 'src', 'skills')
    
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.yaml')) {
          const skillPath = path.join(skillsDir, entry.name)
          await this.loadSkillFile(skillPath)
        }
      }
    } catch (error) {
      // Skills directory might not exist yet
    }
  }

  private async loadUserSkills(): Promise<void> {
    const userSkillsDir = path.join(this.workspaceRoot, '.loom', 'skills')
    
    try {
      const entries = await fs.readdir(userSkillsDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.toml'))) {
          const skillPath = path.join(userSkillsDir, entry.name)
          await this.loadSkillFile(skillPath)
        }
      }
    } catch (error) {
      // User skills directory might not exist
    }
  }

  private async loadSkillFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const skill = this.parseSkill(content, filePath)
      this.skills.set(skill.name, skill)
    } catch (error) {
      console.warn(`[SkillService] Failed to load skill ${filePath}:`, error)
    }
  }

  private parseSkill(content: string, filePath: string): SkillManifest {
    // Parse YAML with TOML frontmatter
    // Simple parser - production would use proper YAML parser
    
    const lines = content.split('\n')
    let inFrontmatter = false
    let frontmatterLines: string[] = []
    let bodyLines: string[] = []
    
    for (const line of lines) {
      if (line.trim() === '---') {
        inFrontmatter = !inFrontmatter
        continue
      }
      
      if (inFrontmatter) {
        frontmatterLines.push(line)
      } else {
        bodyLines.push(line)
      }
    }
    
    // Parse frontmatter as TOML
    const frontmatter = frontmatterLines.join('\n')
    const parsed = this.parser.parseSync(frontmatter)
    
    // Parse body for levels
    const levels = this.parseLevels(bodyLines.join('\n'))
    
    return {
      name: parsed.name || path.basename(filePath, '.yaml'),
      title: parsed.title || parsed.name,
      description: parsed.description || '',
      version: parsed.version || '1.0.0',
      author: parsed.author || 'Loom',
      levels,
      activation: parsed.activation || { keywords: [], agents: [] },
      tools: parsed.tools,
      tags: parsed.tags || [],
      category: parsed.category || 'general',
    }
  }

  private parseLevels(body: string): SkillLevel[] {
    const levels: SkillLevel[] = []
    const lines = body.split('\n')
    
    let currentLevel: Partial<SkillLevel> | null = null
    let currentContent: string[] = []
    
    for (const line of lines) {
      const levelMatch = line.match(/^## Level (\d+):\s*(.+)$/)
      
      if (levelMatch) {
        // Save previous level
        if (currentLevel) {
          levels.push({
            level: currentLevel.level!,
            title: currentLevel.title!,
            description: currentLevel.description || '',
            prompt: currentContent.join('\n').trim(),
            when_to_use: currentLevel.when_to_use || '',
          })
        }
        
        // Start new level
        currentLevel = {
          level: parseInt(levelMatch[1]),
          title: levelMatch[2],
        }
        currentContent = []
      } else if (line.startsWith('**When to use:**')) {
        if (currentLevel) {
          currentLevel.when_to_use = line.replace('**When to use:**', '').trim()
        }
      } else if (line.startsWith('**Description:**')) {
        if (currentLevel) {
          currentLevel.description = line.replace('**Description:**', '').trim()
        }
      } else if (currentLevel) {
        currentContent.push(line)
      }
    }
    
    // Don't forget the last level
    if (currentLevel) {
      levels.push({
        level: currentLevel.level!,
        title: currentLevel.title!,
        description: currentLevel.description || '',
        prompt: currentContent.join('\n').trim(),
        when_to_use: currentLevel.when_to_use || '',
      })
    }
    
    return levels
  }

  getSkill(name: string): SkillManifest | undefined {
    return this.skills.get(name)
  }

  getAllSkills(): SkillManifest[] {
    return Array.from(this.skills.values())
  }

  findSkillsForContext(context: string, agentName: string): SkillManifest[] {
    const contextLower = context.toLowerCase()
    
    return this.getAllSkills().filter(skill => {
      // Check if agent is allowed
      if (!skill.activation.agents.includes(agentName) && 
          !skill.activation.agents.includes('*')) {
        return false
      }
      
      // Check if any keyword matches
      return skill.activation.keywords.some(kw => 
        contextLower.includes(kw.toLowerCase())
      )
    })
  }

  getSkillPrompt(skillName: string, level: number = 1): string | null {
    const skill = this.skills.get(skillName)
    if (!skill) return null
    
    const levelData = skill.levels.find(l => l.level === level)
    if (!levelData) return null
    
    return levelData.prompt
  }

  async importSkill(source: string): Promise<SkillManifest> {
    // Import from various sources:
    // - voltagent/awesome-claude-code-subagents/skill-name
    // - github:user/repo/skill.yaml
    // - github:user/repo (finds skills/*.yaml)
    // - Local file path
    
    console.log(`[SkillService] Importing skill from ${source}`)
    
    let skillContent: string
    let skillName: string
    
    if (source.startsWith('github:')) {
      // GitHub repo format: github:user/repo/path
      const match = source.match(/^github:([^/]+)\/([^/]+)(?:\/(.*))?$/)
      if (!match) {
        throw new Error(`Invalid GitHub source format: ${source}`)
      }
      
      const [, user, repo, path] = match
      
      if (path && path.endsWith('.yaml')) {
        // Direct file URL
        const url = `https://raw.githubusercontent.com/${user}/${repo}/main/${path}`
        skillContent = await this.fetchFromUrl(url)
        skillName = path.replace('.yaml', '').split('/').pop() || 'unknown'
      } else {
        // Try to find skills in the repo
        const skillsUrl = `https://api.github.com/repos/${user}/${repo}/contents/${path || 'skills'}`
        const files = await this.fetchGitHubContents(skillsUrl)
        
        // Import first skill file found
        const skillFile = files.find((f: any) => f.name.endsWith('.yaml') || f.name.endsWith('.yml'))
        if (!skillFile) {
          throw new Error(`No skill files found in ${source}`)
        }
        
        skillContent = await this.fetchFromUrl(skillFile.download_url)
        skillName = skillFile.name.replace(/\.ya?ml$/, '')
      }
    } else if (source.startsWith('voltagent/')) {
      // VoltAgent ecosystem: voltagent/awesome-claude-code-subagents/skill-name
      const parts = source.split('/')
      if (parts.length < 2) {
        throw new Error(`Invalid voltagent source format: ${source}`)
      }
      
      // Map to GitHub raw URL
      const repo = parts[0] + '/' + parts[1]
      const skillPath = parts.slice(2).join('/') || ''
      
      const url = skillPath 
        ? `https://raw.githubusercontent.com/${repo}/main/${skillPath}.yaml`
        : `https://api.github.com/repos/${repo}/contents/skills`
      
      if (skillPath) {
        skillContent = await this.fetchFromUrl(url)
        skillName = skillPath.split('/').pop() || 'unknown'
      } else {
        // List and import first skill
        const files = await this.fetchGitHubContents(url)
        const skillFile = files.find((f: any) => f.name.endsWith('.yaml'))
        if (!skillFile) {
          throw new Error(`No skill files found in ${source}`)
        }
        skillContent = await this.fetchFromUrl(skillFile.download_url)
        skillName = skillFile.name.replace('.yaml', '')
      }
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
      // Direct URL
      skillContent = await this.fetchFromUrl(source)
      skillName = source.split('/').pop()?.replace('.yaml', '') || 'unknown'
    } else {
      // Local file path
      skillContent = await fs.readFile(source, 'utf-8')
      skillName = path.basename(source, '.yaml')
    }
    
    // Parse and validate the skill
    const skill = this.parseSkill(skillContent, `${skillName}.yaml`)
    
    // Save to user's .loom/skills/ directory
    const userSkillsDir = path.join(this.workspaceRoot, '.loom', 'skills')
    await fs.mkdir(userSkillsDir, { recursive: true })
    
    const skillPath = path.join(userSkillsDir, `${skill.name}.yaml`)
    await fs.writeFile(skillPath, skillContent, 'utf-8')
    
    // Add to loaded skills
    this.skills.set(skill.name, skill)
    
    console.log(`[SkillService] Successfully imported skill: ${skill.name}`)
    return skill
  }
  
  private async fetchFromUrl(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch from ${url}: ${response.status}`)
    }
    return response.text()
  }
  
  private async fetchGitHubContents(apiUrl: string): Promise<any[]> {
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        // Note: For private repos, would need GitHub token
      }
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch GitHub contents: ${response.status}`)
    }
    return response.json()
  }
}
