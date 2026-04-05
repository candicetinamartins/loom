/**
 * TOMLParser - Simple TOML parsing utility
 * 
 * Minimal implementation for CI builds
 */

export interface TOMLValue {
  [key: string]: any
}

export class TOMLParser {
  static parse<T = any>(content: string): T {
    const result: any = {}
    const lines = content.split('\n')
    let currentSection: any = result
    let currentSectionName: string | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const sectionName = trimmed.slice(1, -1)
        currentSectionName = sectionName
        if (!result[sectionName]) {
          result[sectionName] = {}
        }
        currentSection = result[sectionName]
        continue
      }

      const equalsIndex = trimmed.indexOf('=')
      if (equalsIndex > 0) {
        const key = trimmed.slice(0, equalsIndex).trim()
        const value = trimmed.slice(equalsIndex + 1).trim()
        
        if (value.startsWith('"') && value.endsWith('"')) {
          currentSection[key] = value.slice(1, -1)
        } else if (value.startsWith("'") && value.endsWith("'")) {
          currentSection[key] = value.slice(1, -1)
        } else if (value === 'true') {
          currentSection[key] = true
        } else if (value === 'false') {
          currentSection[key] = false
        } else if (value.startsWith('[') && value.endsWith(']')) {
          try {
            currentSection[key] = JSON.parse(value)
          } catch {
            currentSection[key] = value.slice(1, -1).split(',').map(s => s.trim())
          }
        } else if (!isNaN(Number(value))) {
          currentSection[key] = Number(value)
        } else {
          currentSection[key] = value
        }
      }
    }

    return result as T
  }

  static parseSync<T = any>(content: string): T {
    return this.parse<T>(content)
  }

  static stringify(obj: any): string {
    const lines: string[] = []
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        lines.push(`[${key}]`)
        for (const [subKey, subValue] of Object.entries(value)) {
          lines.push(`${subKey} = ${this.formatValue(subValue)}`)
        }
        lines.push('')
      } else {
        lines.push(`${key} = ${this.formatValue(value)}`)
      }
    }
    
    return lines.join('\n')
  }

  private static formatValue(value: any): string {
    if (typeof value === 'string') {
      return `"${value.replace(/"/g, '\\"')}"`
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    if (Array.isArray(value)) {
      return `[${value.map(v => this.formatValue(v)).join(', ')}]`
    }
    return String(value)
  }
}

export function parseTOML<T = any>(content: string): T {
  return TOMLParser.parse<T>(content)
}
