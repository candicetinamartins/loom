/**
 * Simple TOML parser for frontmatter parsing
 * Production would use a proper TOML library
 */
export class TOMLParser {
  parseSync(content: string): any {
    const result: any = {}
    const lines = content.split('\n')
    let currentSection: any = null
    let sectionName: string | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      // Check for section header [section]
      const sectionMatch = trimmed.match(/^\[(.+?)\]$/)
      if (sectionMatch) {
        sectionName = sectionMatch[1]
        currentSection = {}
        result[sectionName] = currentSection
        continue
      }

      // Parse key = value
      const kvMatch = trimmed.match(/^([^=]+)=\s*(.+)$/)
      if (kvMatch) {
        const key = kvMatch[1].trim()
        let value = kvMatch[2].trim()

        // Handle arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          const arrayValue = value.slice(1, -1)
            .split(',')
            .map((v: string) => this.parseValue(v.trim()))
          if (currentSection && sectionName) {
            currentSection[key] = arrayValue
          } else {
            result[key] = arrayValue
          }
        } else {
          value = this.parseValue(value)
          if (currentSection && sectionName) {
            currentSection[key] = value
          } else {
            result[key] = value
          }
        }
      }
    }

    return result
  }

  private parseValue(value: string): any {
    // Handle strings
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1)
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1)
    }

    // Handle booleans
    if (value === 'true') return true
    if (value === 'false') return false

    // Handle numbers
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10)
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value)
    }

    return value
  }
}
