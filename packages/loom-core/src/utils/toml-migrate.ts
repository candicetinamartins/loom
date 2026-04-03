import * as fs from 'fs/promises'
import * as path from 'path'
import { TOMLParser } from '../config/TOMLParser'

export interface MigrationSource {
  type: 'kiro' | 'windsurf' | 'claude'
  configPath: string
}

export interface MigrationResult {
  success: boolean
  migratedFiles: string[]
  errors: string[]
}

export class TOMLMigrator {
  private parser = new TOMLParser()

  async migrate(source: MigrationSource, outputPath: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedFiles: [],
      errors: [],
    }

    try {
      const sourceContent = await fs.readFile(source.configPath, 'utf-8')
      const converted = await this.convertFromSource(source.type, sourceContent)
      
      const outputDir = path.dirname(outputPath)
      await fs.mkdir(outputDir, { recursive: true })
      await fs.writeFile(outputPath, converted, 'utf-8')
      
      result.migratedFiles.push(outputPath)
    } catch (error) {
      result.success = false
      result.errors.push(`Failed to migrate ${source.configPath}: ${error}`)
    }

    return result
  }

  async migrateAll(sources: MigrationSource[], outputDir: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedFiles: [],
      errors: [],
    }

    for (const source of sources) {
      const outputPath = path.join(outputDir, `${path.basename(source.configPath, '.json')}.toml`)
      const migration = await this.migrate(source, outputPath)
      
      result.migratedFiles.push(...migration.migratedFiles)
      result.errors.push(...migration.errors)
      
      if (!migration.success) {
        result.success = false
      }
    }

    return result
  }

  private async convertFromSource(type: MigrationSource['type'], content: string): Promise<string> {
    switch (type) {
      case 'kiro':
        return this.convertFromKiro(content)
      case 'windsurf':
        return this.convertFromWindsurf(content)
      case 'claude':
        return this.convertFromClaude(content)
      default:
        throw new Error(`Unknown source type: ${type}`)
    }
  }

  private convertFromKiro(content: string): string {
    try {
      const json = JSON.parse(content)
      return this.parser.stringify(this.transformKiroToLoom(json))
    } catch (error) {
      throw new Error(`Failed to parse Kiro JSON: ${error}`)
    }
  }

  private convertFromWindsurf(content: string): string {
    try {
      const json = JSON.parse(content)
      return this.parser.stringify(this.transformWindsurfToLoom(json))
    } catch (error) {
      throw new Error(`Failed to parse Windsurf JSON: ${error}`)
    }
  }

  private convertFromClaude(content: string): string {
    try {
      const json = JSON.parse(content)
      return this.parser.stringify(this.transformClaudeToLoom(json))
    } catch (error) {
      throw new Error(`Failed to parse Claude JSON: ${error}`)
    }
  }

  private transformKiroToLoom(config: any): any {
    return {
      concurrency: {
        maxAgents: config.maxConcurrentAgents ?? 12,
        maxParallelWaves: config.maxParallelTasks ?? 5,
      },
      context: {
        budgetLimit: config.contextLimit ?? 200000,
        compactThreshold: 0.70,
      },
      models: {
        default: config.defaultModel ?? 'claude-sonnet-4-5',
        anthropic: {
          apiKey: config.anthropicApiKey,
        },
        openai: {
          apiKey: config.openaiApiKey,
        },
      },
    }
  }

  private transformWindsurfToLoom(config: any): any {
    return {
      concurrency: {
        maxAgents: config.agents?.max ?? 12,
        maxParallelWaves: config.tasks?.parallel ?? 5,
      },
      context: {
        budgetLimit: config.context?.maxTokens ?? 200000,
        compactThreshold: 0.70,
      },
      models: {
        default: config.models?.default ?? 'claude-sonnet-4-5',
        anthropic: {
          apiKey: config.models?.anthropic?.apiKey,
        },
        openai: {
          apiKey: config.models?.openai?.apiKey,
        },
      },
    }
  }

  private transformClaudeToLoom(config: any): any {
    return {
      concurrency: {
        maxAgents: 12,
        maxParallelWaves: 5,
      },
      context: {
        budgetLimit: config.maxTokens ?? 200000,
        compactThreshold: 0.70,
      },
      models: {
        default: config.model ?? 'claude-sonnet-4-5',
        anthropic: {
          apiKey: config.apiKey,
        },
      },
    }
  }
}

export async function migrateFromKiro(configPath: string, outputPath: string): Promise<MigrationResult> {
  const migrator = new TOMLMigrator()
  return await migrator.migrate({ type: 'kiro', configPath }, outputPath)
}

export async function migrateFromWindsurf(configPath: string, outputPath: string): Promise<MigrationResult> {
  const migrator = new TOMLMigrator()
  return await migrator.migrate({ type: 'windsurf', configPath }, outputPath)
}

export async function migrateFromClaude(configPath: string, outputPath: string): Promise<MigrationResult> {
  const migrator = new TOMLMigrator()
  return await migrator.migrate({ type: 'claude', configPath }, outputPath)
}
