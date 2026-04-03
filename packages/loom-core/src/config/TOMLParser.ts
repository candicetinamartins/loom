import * as smol from 'smol-toml'

export interface LoomSettings {
  concurrency: {
    maxAgents: number
    maxParallelWaves: number
  }
  context: {
    budgetLimit: number
    compactThreshold: number
  }
  models: {
    default: string
    anthropic?: {
      apiKey?: string
    }
    openai?: {
      apiKey?: string
    }
    ollama?: {
      baseUrl?: string
    }
  }
}

export const DEFAULT_SETTINGS: LoomSettings = {
  concurrency: {
    maxAgents: 12,
    maxParallelWaves: 5,
  },
  context: {
    budgetLimit: 200000,
    compactThreshold: 0.70,
  },
  models: {
    default: 'claude-sonnet-4-5',
  },
}

export class TOMLParser {
  parse<T>(content: string): T {
    try {
      return smol.parse(content) as T
    } catch (error) {
      throw new Error(`Failed to parse TOML: ${error}`)
    }
  }

  stringify(data: unknown): string {
    try {
      return smol.stringify(data)
    } catch (error) {
      throw new Error(`Failed to stringify TOML: ${error}`)
    }
  }

  parseSettings(content: string): LoomSettings {
    const parsed = this.parse<Partial<LoomSettings>>(content)
    return this.mergeWithDefaults(parsed)
  }

  private mergeWithDefaults(partial: Partial<LoomSettings>): LoomSettings {
    return {
      concurrency: {
        ...DEFAULT_SETTINGS.concurrency,
        ...partial.concurrency,
      },
      context: {
        ...DEFAULT_SETTINGS.context,
        ...partial.context,
      },
      models: {
        ...DEFAULT_SETTINGS.models,
        ...partial.models,
        anthropic: {
          ...DEFAULT_SETTINGS.models.anthropic,
          ...partial.models?.anthropic,
        },
        openai: {
          ...DEFAULT_SETTINGS.models.openai,
          ...partial.models?.openai,
        },
        ollama: {
          ...DEFAULT_SETTINGS.models.ollama,
          ...partial.models?.ollama,
        },
      },
    }
  }
}
