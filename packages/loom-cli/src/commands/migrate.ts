#!/usr/bin/env node
import { Command } from 'commander'
import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Phase 9 — TOML Migration Tool
 * 
 * Commands:
 *   loom migrate --from kiro
 *   loom migrate --from windsurf
 *   loom migrate --from claude
 * 
 * Converts other AI tool configurations to Loom TOML format.
 */

interface MigrationConfig {
  from: 'kiro' | 'windsurf' | 'claude' | 'cursor'
  inputPath: string
  outputPath: string
}

interface LoomConfig {
  project: {
    name: string
    description: string
  }
  rules: Array<{
    name: string
    description: string
    globs?: string[]
    alwaysApply?: boolean
  }>
  agents: {
    [key: string]: {
      role: string
      expertise: string[]
    }
  }
}

class MigrateCommand {
  private program: Command

  constructor() {
    this.program = new Command()
    this.setupCommands()
  }

  private setupCommands(): void {
    this.program
      .name('loom migrate')
      .description('Migrate from other AI tools to Loom')
      .version('1.0.0')

    this.program
      .command('migrate')
      .description('Migrate configuration from another tool')
      .requiredOption('--from <tool>', 'Source tool (kiro, windsurf, claude, cursor)')
      .option('-i, --input <path>', 'Input file/directory', '.')
      .option('-o, --output <path>', 'Output path', '.loom/project-context.toml')
      .action(this.runMigration.bind(this))

    this.program
      .command('detect')
      .description('Detect configuration from known tools')
      .option('-p, --path <path>', 'Project path', '.')
      .action(this.detectConfigs.bind(this))
  }

  async run(): Promise<void> {
    await this.program.parseAsync()
  }

  private async runMigration(options: {
    from: string
    input: string
    output: string
  }): Promise<void> {
    console.log('🔄 Loom Migration Tool')
    console.log('======================\n')

    const validTools = ['kiro', 'windsurf', 'claude', 'cursor']
    if (!validTools.includes(options.from)) {
      console.error(`❌ Unknown tool: ${options.from}`)
      console.error(`   Supported: ${validTools.join(', ')}`)
      process.exit(1)
    }

    console.log(`Source: ${options.from}`)
    console.log(`Input: ${options.input}`)
    console.log(`Output: ${options.output}`)
    console.log('')

    try {
      let loomConfig: LoomConfig

      switch (options.from) {
        case 'kiro':
          loomConfig = await this.migrateFromKiro(options.input)
          break
        case 'windsurf':
          loomConfig = await this.migrateFromWindsurf(options.input)
          break
        case 'claude':
          loomConfig = await this.migrateFromClaude(options.input)
          break
        case 'cursor':
          loomConfig = await this.migrateFromCursor(options.input)
          break
        default:
          throw new Error(`Unknown tool: ${options.from}`)
      }

      // Generate TOML
      const toml = this.renderTOML(loomConfig)

      // Ensure output directory exists
      const outputDir = path.dirname(options.output)
      await fs.mkdir(outputDir, { recursive: true })

      // Write output
      await fs.writeFile(options.output, toml, 'utf-8')

      console.log('✅ Migration complete!')
      console.log(`   Output: ${options.output}`)
      console.log('')
      console.log('Generated configuration:')
      console.log(toml)
    } catch (error) {
      console.error(`❌ Migration failed: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  private async migrateFromKiro(inputPath: string): Promise<LoomConfig> {
    // Kiro uses .kiro/rules/ directory with JSON files
    const kiroDir = path.join(inputPath, '.kiro')
    const rulesDir = path.join(kiroDir, 'rules')

    const config: LoomConfig = {
      project: {
        name: path.basename(path.resolve(inputPath)),
        description: 'Migrated from Kiro',
      },
      rules: [],
      agents: {
        engineer: {
          role: 'Code implementation',
          expertise: ['typescript', 'javascript'],
        },
      },
    }

    try {
      const files = await fs.readdir(rulesDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(rulesDir, file), 'utf-8')
          const kiroRule = JSON.parse(content)
          
          config.rules.push({
            name: kiroRule.name || file.replace('.json', ''),
            description: kiroRule.description || kiroRule.prompt,
            globs: kiroRule.fileMatchers,
            alwaysApply: kiroRule.alwaysApply,
          })
        }
      }
    } catch {
      console.log('   No Kiro rules found, using defaults')
    }

    return config
  }

  private async migrateFromWindsurf(inputPath: string): Promise<LoomConfig> {
    // Windsurf uses .windsurf/ directory
    const windsurfDir = path.join(inputPath, '.windsurf')
    const rulesFile = path.join(windsurfDir, 'rules.md')

    const config: LoomConfig = {
      project: {
        name: path.basename(path.resolve(inputPath)),
        description: 'Migrated from Windsurf',
      },
      rules: [],
      agents: {
        engineer: {
          role: 'Code implementation',
          expertise: ['typescript', 'javascript'],
        },
      },
    }

    try {
      const content = await fs.readFile(rulesFile, 'utf-8')
      // Parse markdown rules
      const sections = content.split(/^## /m)
      
      for (const section of sections.slice(1)) {
        const lines = section.split('\n')
        const name = lines[0].trim()
        const description = lines.slice(1).join('\n').trim()
        
        if (name && description) {
          config.rules.push({
            name,
            description,
            alwaysApply: true,
          })
        }
      }
    } catch {
      console.log('   No Windsurf rules found, using defaults')
    }

    return config
  }

  private async migrateFromClaude(inputPath: string): Promise<LoomConfig> {
    // Claude uses CLAUDE.md or .claude/CLAUDE.md
    const possiblePaths = [
      path.join(inputPath, 'CLAUDE.md'),
      path.join(inputPath, '.claude', 'CLAUDE.md'),
      path.join(inputPath, '.claude', 'rules.md'),
    ]

    const config: LoomConfig = {
      project: {
        name: path.basename(path.resolve(inputPath)),
        description: 'Migrated from Claude',
      },
      rules: [],
      agents: {
        engineer: {
          role: 'Code implementation',
          expertise: ['typescript', 'javascript'],
        },
      },
    }

    for (const claudeFile of possiblePaths) {
      try {
        const content = await fs.readFile(claudeFile, 'utf-8')
        
        // Parse sections
        const sections = content.split(/^## /m)
        
        for (const section of sections.slice(1)) {
          const lines = section.split('\n')
          const name = lines[0].trim()
          const description = lines.slice(1).join('\n').trim()
          
          if (name && description) {
            config.rules.push({
              name,
              description,
              alwaysApply: true,
            })
          }
        }
        
        console.log(`   Found Claude config: ${claudeFile}`)
        break
      } catch {
        // Try next path
      }
    }

    if (config.rules.length === 0) {
      console.log('   No Claude config found, using defaults')
    }

    return config
  }

  private async migrateFromCursor(inputPath: string): Promise<LoomConfig> {
    // Cursor uses .cursorrules file
    const cursorFile = path.join(inputPath, '.cursorrules')

    const config: LoomConfig = {
      project: {
        name: path.basename(path.resolve(inputPath)),
        description: 'Migrated from Cursor',
      },
      rules: [],
      agents: {
        engineer: {
          role: 'Code implementation',
          expertise: ['typescript', 'javascript'],
        },
      },
    }

    try {
      const content = await fs.readFile(cursorFile, 'utf-8')
      
      // Split by rule sections (usually separated by blank lines or headers)
      const sections = content.split(/\n\n+/)
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i].trim()
        if (section) {
          const lines = section.split('\n')
          const name = lines[0].replace(/^#+\s*/, '').trim()
          const description = lines.slice(1).join('\n').trim()
          
          config.rules.push({
            name: name || `Rule ${i + 1}`,
            description: description || section,
            alwaysApply: true,
          })
        }
      }
      
      console.log(`   Found Cursor config: ${cursorFile}`)
    } catch {
      console.log('   No Cursor config found, using defaults')
    }

    return config
  }

  private async detectConfigs(options: { path: string }): Promise<void> {
    console.log('🔍 Detecting AI tool configurations...')
    console.log('=====================================\n')

    const tools = [
      { name: 'Kiro', dir: '.kiro', files: ['rules'] },
      { name: 'Windsurf', dir: '.windsurf', files: ['rules.md'] },
      { name: 'Claude', dir: '.claude', files: ['CLAUDE.md', 'rules.md'] },
      { name: 'Cursor', dir: null, files: ['.cursorrules'] },
    ]

    const found: string[] = []

    for (const tool of tools) {
      let detected = false

      if (tool.dir) {
        try {
          await fs.access(path.join(options.path, tool.dir))
          detected = true
        } catch {
          // Not found
        }
      }

      for (const file of tool.files) {
        try {
          await fs.access(path.join(options.path, file))
          detected = true
        } catch {
          // Not found
        }
      }

      if (detected) {
        console.log(`✅ ${tool.name}: Found`)
        found.push(tool.name.toLowerCase())
      } else {
        console.log(`❌ ${tool.name}: Not found`)
      }
    }

    console.log('\n=====================================')
    if (found.length > 0) {
      console.log(`Found configurations: ${found.join(', ')}`)
      console.log('\nTo migrate, run:')
      for (const tool of found) {
        console.log(`  loom migrate --from ${tool}`)
      }
    } else {
      console.log('No AI tool configurations detected.')
      console.log('Starting fresh with Loom!')
    }
  }

  private renderTOML(config: LoomConfig): string {
    const lines: string[] = []

    lines.push(`# Loom Project Configuration`)
    lines.push(`# Migrated from external tool`)
    lines.push(``)
    lines.push(`[project]`)
    lines.push(`name = "${config.project.name}"`)
    lines.push(`description = "${config.project.description}"`)
    lines.push(``)

    for (const rule of config.rules) {
      lines.push(`[[rules]]`)
      lines.push(`name = "${rule.name}"`)
      lines.push(`description = """${rule.description}"""`)
      
      if (rule.globs && rule.globs.length > 0) {
        lines.push(`globs = [${rule.globs.map(g => `"${g}"`).join(', ')}]`)
      }
      
      if (rule.alwaysApply) {
        lines.push(`alwaysApply = true`)
      }
      
      lines.push(``)
    }

    lines.push(`[agents.engineer]`)
    lines.push(`role = "Code implementation and review"`)
    lines.push(`expertise = ["typescript", "javascript", "nodejs"]`)
    lines.push(``)
    lines.push(`[agents.security]`)
    lines.push(`role = "Security audit and vulnerability detection"`)
    lines.push(`expertise = ["security", "owasp", "penetration-testing"]`)
    lines.push(``)
    lines.push(`[agents.architect]`)
    lines.push(`role = "System design and architecture"`)
    lines.push(`expertise = ["architecture", "design-patterns", "scalability"]`)

    return lines.join('\n')
  }
}

// Run CLI
const command = new MigrateCommand()
command.run().catch(console.error)
