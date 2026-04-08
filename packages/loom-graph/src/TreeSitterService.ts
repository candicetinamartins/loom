import { injectable, inject } from 'inversify'
import { ASTParser, ParsedModule, ParsedFunction, ParsedClass } from './ASTParser'

/**
 * TreeSitterService — High-level wrapper around ASTParser
 * 
 * Provides:
 * - Language detection
 * - Batch parsing
 * - Cached parsing results
 * - Symbol extraction for indexing
 */
@injectable()
export class TreeSitterService {
  private astParser: ASTParser
  private parseCache: Map<string, { content: string; result: ParsedModule; timestamp: number }> = new Map()
  private cacheTTL = 5 * 60 * 1000 // 5 minutes

  constructor(@inject(ASTParser) astParser: ASTParser) {
    this.astParser = astParser
  }

  async initialize(): Promise<void> {
    await this.astParser.initialize()
  }

  /**
   * Parse a single file
   */
  async parseFile(filePath: string, content: string): Promise<ParsedModule | null> {
    // Check cache
    const cached = this.parseCache.get(filePath)
    if (cached && cached.content === content && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result
    }

    const language = this.astParser.detectLanguage(filePath)
    if (!language) {
      return null
    }

    const result = await this.astParser.parseModule(filePath, content, language)
    
    if (result) {
      this.parseCache.set(filePath, { content, result, timestamp: Date.now() })
    }

    return result
  }

  /**
   * Parse multiple files in batch
   */
  async parseFiles(files: Array<{ path: string; content: string }>): Promise<Map<string, ParsedModule>> {
    const results = new Map<string, ParsedModule>()
    
    await Promise.all(
      files.map(async ({ path, content }) => {
        const parsed = await this.parseFile(path, content)
        if (parsed) {
          results.set(path, parsed)
        }
      })
    )
    
    return results
  }

  /**
   * Extract all functions from a parsed module
   */
  extractFunctions(module: ParsedModule): ParsedFunction[] {
    const functions = [...module.functions]
    
    // Also extract methods from classes
    for (const cls of module.classes) {
      functions.push(...cls.methods)
    }
    
    return functions
  }

  /**
   * Extract all classes from a parsed module
   */
  extractClasses(module: ParsedModule): ParsedClass[] {
    return module.classes
  }

  /**
   * Get imports from a module
   */
  getImports(module: ParsedModule): string[] {
    return module.imports
  }

  /**
   * Calculate complexity metrics for a module
   */
  calculateMetrics(module: ParsedModule): {
    totalFunctions: number
    totalClasses: number
    averageComplexity: number
    maxComplexity: number
    undocumentedFunctions: number
    totalLines: number
  } {
    const allFunctions = this.extractFunctions(module)
    
    const complexities = allFunctions.map(f => f.complexity)
    const averageComplexity = complexities.length > 0 
      ? complexities.reduce((a, b) => a + b, 0) / complexities.length 
      : 0
    const maxComplexity = complexities.length > 0 ? Math.max(...complexities) : 0
    
    const undocumentedFunctions = allFunctions.filter(f => !f.doc).length
    
    const totalLines = allFunctions.reduce((sum, f) => sum + (f.endLine - f.startLine + 1), 0)
      + module.classes.reduce((sum, c) => sum + (c.endLine - c.startLine + 1), 0)

    return {
      totalFunctions: allFunctions.length,
      totalClasses: module.classes.length,
      averageComplexity: Math.round(averageComplexity * 100) / 100,
      maxComplexity,
      undocumentedFunctions,
      totalLines,
    }
  }

  /**
   * Clear the parse cache
   */
  clearCache(): void {
    this.parseCache.clear()
  }

  /**
   * Check if a file extension is supported
   */
  isSupported(filePath: string): boolean {
    return this.astParser.detectLanguage(filePath) !== null
  }

  /**
   * Get all supported extensions
   */
  getSupportedExtensions(): string[] {
    return [
      '.ts', '.tsx', '.js', '.jsx',
      '.py',
      '.rs',
      '.go',
      '.java',
      '.c', '.cpp', '.h', '.hpp',
      '.cs',
      '.rb',
      '.php',
      '.swift',
      '.kt',
      '.scala',
      '.sh', '.bash',
    ]
  }
}
