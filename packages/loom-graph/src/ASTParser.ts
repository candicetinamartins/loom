import { injectable } from 'inversify'
import Parser from 'web-tree-sitter'

export interface ParsedFunction {
  id: string
  name: string
  signature: string
  startLine: number
  endLine: number
  doc?: string
  complexity: number
}

export interface ParsedClass {
  id: string
  name: string
  startLine: number
  endLine: number
  doc?: string
  methods: ParsedFunction[]
}

export interface ParsedModule {
  id: string
  path: string
  language: string
  functions: ParsedFunction[]
  classes: ParsedClass[]
  imports: string[]
}

/**
 * ASTParser - Tree-sitter based code analysis for 13 languages
 * 
 * Languages supported:
 * - TypeScript/JavaScript
 * - Python
 * - Rust
 * - Go
 * - Java
 * - C/C++
 * - C#
 * - Ruby
 * - PHP
 * - Swift
 * - Kotlin
 * - Scala
 * - Bash/Shell
 */
@injectable()
export class ASTParser {
  private parsers: Map<string, Parser> = new Map()
  private initialized = false

  // Language to grammar mapping
  private languageGrammars: Record<string, string> = {
    typescript: 'tree-sitter-typescript',
    javascript: 'tree-sitter-javascript',
    python: 'tree-sitter-python',
    rust: 'tree-sitter-rust',
    go: 'tree-sitter-go',
    java: 'tree-sitter-java',
    c: 'tree-sitter-c',
    cpp: 'tree-sitter-cpp',
    csharp: 'tree-sitter-c-sharp',
    ruby: 'tree-sitter-ruby',
    php: 'tree-sitter-php',
    swift: 'tree-sitter-swift',
    kotlin: 'tree-sitter-kotlin',
    scala: 'tree-sitter-scala',
    bash: 'tree-sitter-bash',
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    await Parser.init()
    this.initialized = true
    console.log('[ASTParser] Tree-sitter initialized')
  }

  private async getParser(language: string): Promise<Parser | null> {
    if (!this.initialized) await this.initialize()

    if (this.parsers.has(language)) {
      return this.parsers.get(language)!
    }

    const grammarName = this.languageGrammars[language]
    if (!grammarName) {
      console.warn(`[ASTParser] No grammar for language: ${language}`)
      return null
    }

    try {
      // Load WASM grammar
      const lang = await Parser.Language.load(
        `node_modules/${grammarName}/tree-sitter.wasm`
      )
      
      const parser = new Parser()
      parser.setLanguage(lang)
      this.parsers.set(language, parser)
      
      return parser
    } catch (error) {
      console.warn(`[ASTParser] Failed to load grammar ${grammarName}:`, error)
      return null
    }
  }

  async parseModule(filePath: string, content: string, language: string): Promise<ParsedModule | null> {
    const parser = await this.getParser(language)
    if (!parser) return null

    const tree = parser.parse(content)
    const rootNode = tree.rootNode

    const id = `module-${filePath}`
    const functions: ParsedFunction[] = []
    const classes: ParsedClass[] = []
    const imports: string[] = []

    // Extract based on language
    switch (language) {
      case 'typescript':
      case 'javascript':
        this.extractTypeScript(rootNode, content, functions, classes, imports)
        break
      case 'python':
        this.extractPython(rootNode, content, functions, classes, imports)
        break
      case 'rust':
        this.extractRust(rootNode, content, functions, classes, imports)
        break
      case 'go':
        this.extractGo(rootNode, content, functions, classes, imports)
        break
      case 'java':
        this.extractJava(rootNode, content, functions, classes, imports)
        break
      default:
        // Generic extraction for other languages
        this.extractGeneric(rootNode, content, functions, classes, imports)
    }

    return {
      id,
      path: filePath,
      language,
      functions,
      classes,
      imports,
    }
  }

  private extractTypeScript(
    node: Parser.SyntaxNode,
    content: string,
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: string[]
  ): void {
    const cursor = node.walk()
    
    do {
      const n = cursor.currentNode
      
      // Function declarations
      if (n.type === 'function_declaration' || 
          n.type === 'method_definition' ||
          n.type === 'arrow_function' ||
          n.type === 'function_expression') {
        const func = this.parseTypeScriptFunction(n, content)
        if (func) functions.push(func)
      }
      
      // Class declarations
      if (n.type === 'class_declaration' || n.type === 'class_expression') {
        const cls = this.parseTypeScriptClass(n, content)
        if (cls) classes.push(cls)
      }
      
      // Import statements
      if (n.type === 'import_statement' || n.type === 'import_declaration') {
        const importText = content.slice(n.startIndex, n.endIndex)
        imports.push(importText)
      }
    } while (cursor.gotoNextSibling())
  }

  private parseTypeScriptFunction(node: Parser.SyntaxNode, content: string): ParsedFunction | null {
    const nameNode = node.childForFieldName('name')
    const paramsNode = node.childForFieldName('parameters')
    const bodyNode = node.childForFieldName('body')
    
    if (!nameNode) return null

    const name = content.slice(nameNode.startIndex, nameNode.endIndex)
    const params = paramsNode 
      ? content.slice(paramsNode.startIndex, paramsNode.endIndex)
      : '()'
    
    // Calculate complexity (simple version - count branches)
    let complexity = 1
    if (bodyNode) {
      const bodyText = content.slice(bodyNode.startIndex, bodyNode.endIndex)
      complexity += (bodyText.match(/if|while|for|switch|catch|\?/g) || []).length
    }

    // Extract doc comment
    const doc = this.extractDocComment(node, content)

    return {
      id: `func-${name}-${node.startPosition.row}`,
      name,
      signature: `${name}${params}`,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc,
      complexity,
    }
  }

  private parseTypeScriptClass(node: Parser.SyntaxNode, content: string): ParsedClass | null {
    const nameNode = node.childForFieldName('name')
    if (!nameNode) return null

    const name = content.slice(nameNode.startIndex, nameNode.endIndex)
    const bodyNode = node.childForFieldName('body')
    
    const methods: ParsedFunction[] = []
    
    if (bodyNode) {
      const cursor = bodyNode.walk()
      do {
        const n = cursor.currentNode
        if (n.type === 'method_definition') {
          const method = this.parseTypeScriptFunction(n, content)
          if (method) methods.push(method)
        }
      } while (cursor.gotoNextSibling())
    }

    const doc = this.extractDocComment(node, content)

    return {
      id: `class-${name}-${node.startPosition.row}`,
      name,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc,
      methods,
    }
  }

  private extractPython(
    node: Parser.SyntaxNode,
    content: string,
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: string[]
  ): void {
    const cursor = node.walk()
    
    do {
      const n = cursor.currentNode
      
      if (n.type === 'function_definition') {
        const func = this.parsePythonFunction(n, content)
        if (func) functions.push(func)
      }
      
      if (n.type === 'class_definition') {
        const cls = this.parsePythonClass(n, content)
        if (cls) classes.push(cls)
      }
      
      if (n.type === 'import_statement' || n.type === 'import_from_statement') {
        const importText = content.slice(n.startIndex, n.endIndex)
        imports.push(importText)
      }
    } while (cursor.gotoNextSibling())
  }

  private parsePythonFunction(node: Parser.SyntaxNode, content: string): ParsedFunction | null {
    const nameNode = node.childForFieldName('name')
    const paramsNode = node.childForFieldName('parameters')
    const bodyNode = node.childForFieldName('body')
    
    if (!nameNode) return null

    const name = content.slice(nameNode.startIndex, nameNode.endIndex)
    const params = paramsNode
      ? content.slice(paramsNode.startIndex, paramsNode.endIndex)
      : '()'

    let complexity = 1
    if (bodyNode) {
      const bodyText = content.slice(bodyNode.startIndex, bodyNode.endIndex)
      complexity += (bodyText.match(/if|while|for|try|with|and|or/g) || []).length
    }

    const doc = this.extractPythonDocString(node, content)

    return {
      id: `func-${name}-${node.startPosition.row}`,
      name,
      signature: `def ${name}${params}`,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc,
      complexity,
    }
  }

  private parsePythonClass(node: Parser.SyntaxNode, content: string): ParsedClass | null {
    const nameNode = node.childForFieldName('name')
    if (!nameNode) return null

    const name = content.slice(nameNode.startIndex, nameNode.endIndex)
    const bodyNode = node.childForFieldName('body')
    
    const methods: ParsedFunction[] = []
    
    if (bodyNode) {
      const cursor = bodyNode.walk()
      do {
        const n = cursor.currentNode
        if (n.type === 'function_definition') {
          const method = this.parsePythonFunction(n, content)
          if (method) methods.push(method)
        }
      } while (cursor.gotoNextSibling())
    }

    const doc = this.extractPythonDocString(node, content)

    return {
      id: `class-${name}-${node.startPosition.row}`,
      name,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc,
      methods,
    }
  }

  private extractRust(
    node: Parser.SyntaxNode,
    content: string,
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: string[]
  ): void {
    const cursor = node.walk()
    
    do {
      const n = cursor.currentNode
      
      if (n.type === 'function_item') {
        const func = this.parseRustFunction(n, content)
        if (func) functions.push(func)
      }
      
      if (n.type === 'impl_item' || n.type === 'struct_item') {
        // Rust doesn't have classes, but has impl blocks
        const cls = this.parseRustImpl(n, content)
        if (cls) classes.push(cls)
      }
      
      if (n.type === 'use_declaration') {
        const importText = content.slice(n.startIndex, n.endIndex)
        imports.push(importText)
      }
    } while (cursor.gotoNextSibling())
  }

  private parseRustFunction(node: Parser.SyntaxNode, content: string): ParsedFunction | null {
    const nameNode = node.childForFieldName('name')
    const paramsNode = node.childForFieldName('parameters')
    
    if (!nameNode) return null

    const name = content.slice(nameNode.startIndex, nameNode.endIndex)
    const params = paramsNode
      ? content.slice(paramsNode.startIndex, paramsNode.endIndex)
      : '()'

    const doc = this.extractRustDocComment(node, content)

    return {
      id: `func-${name}-${node.startPosition.row}`,
      name,
      signature: `fn ${name}${params}`,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc,
      complexity: 1, // Simplified
    }
  }

  private parseRustImpl(node: Parser.SyntaxNode, content: string): ParsedClass | null {
    const typeNode = node.childForFieldName('type')
    if (!typeNode) return null

    const name = content.slice(typeNode.startIndex, typeNode.endIndex)
    const bodyNode = node.childForFieldName('body')
    
    const methods: ParsedFunction[] = []
    
    if (bodyNode) {
      const cursor = bodyNode.walk()
      do {
        const n = cursor.currentNode
        if (n.type === 'function_item') {
          const method = this.parseRustFunction(n, content)
          if (method) methods.push(method)
        }
      } while (cursor.gotoNextSibling())
    }

    const doc = this.extractRustDocComment(node, content)

    return {
      id: `impl-${name}-${node.startPosition.row}`,
      name,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc,
      methods,
    }
  }

  private extractGo(
    node: Parser.SyntaxNode,
    content: string,
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: string[]
  ): void {
    // Go doesn't have classes, but we extract functions and imports
    const cursor = node.walk()
    
    do {
      const n = cursor.currentNode
      
      if (n.type === 'function_declaration') {
        const func = this.parseGoFunction(n, content)
        if (func) functions.push(func)
      }
      
      if (n.type === 'import_declaration') {
        const importText = content.slice(n.startIndex, n.endIndex)
        imports.push(importText)
      }
    } while (cursor.gotoNextSibling())
  }

  private parseGoFunction(node: Parser.SyntaxNode, content: string): ParsedFunction | null {
    const nameNode = node.childForFieldName('name')
    const paramsNode = node.childForFieldName('parameters')
    
    if (!nameNode) return null

    const name = content.slice(nameNode.startIndex, nameNode.endIndex)
    const params = paramsNode
      ? content.slice(paramsNode.startIndex, paramsNode.endIndex)
      : '()'

    const doc = this.extractGoDocComment(node, content)

    return {
      id: `func-${name}-${node.startPosition.row}`,
      name,
      signature: `func ${name}${params}`,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc,
      complexity: 1,
    }
  }

  private extractJava(
    node: Parser.SyntaxNode,
    content: string,
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: string[]
  ): void {
    const cursor = node.walk()
    
    do {
      const n = cursor.currentNode
      
      if (n.type === 'method_declaration') {
        const func = this.parseJavaMethod(n, content)
        if (func) functions.push(func)
      }
      
      if (n.type === 'class_declaration') {
        const cls = this.parseJavaClass(n, content)
        if (cls) classes.push(cls)
      }
      
      if (n.type === 'import_declaration') {
        const importText = content.slice(n.startIndex, n.endIndex)
        imports.push(importText)
      }
    } while (cursor.gotoNextSibling())
  }

  private parseJavaMethod(node: Parser.SyntaxNode, content: string): ParsedFunction | null {
    const nameNode = node.childForFieldName('name')
    const paramsNode = node.childForFieldName('parameters')
    
    if (!nameNode) return null

    const name = content.slice(nameNode.startIndex, nameNode.endIndex)
    const params = paramsNode
      ? content.slice(paramsNode.startIndex, paramsNode.endIndex)
      : '()'

    return {
      id: `method-${name}-${node.startPosition.row}`,
      name,
      signature: `${name}${params}`,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc: this.extractJavaDocComment(node, content),
      complexity: 1,
    }
  }

  private parseJavaClass(node: Parser.SyntaxNode, content: string): ParsedClass | null {
    const nameNode = node.childForFieldName('name')
    if (!nameNode) return null

    const name = content.slice(nameNode.startIndex, nameNode.endIndex)
    const bodyNode = node.childForFieldName('body')
    
    const methods: ParsedFunction[] = []
    
    if (bodyNode) {
      const cursor = bodyNode.walk()
      do {
        const n = cursor.currentNode
        if (n.type === 'method_declaration') {
          const method = this.parseJavaMethod(n, content)
          if (method) methods.push(method)
        }
      } while (cursor.gotoNextSibling())
    }

    return {
      id: `class-${name}-${node.startPosition.row}`,
      name,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      doc: this.extractJavaDocComment(node, content),
      methods,
    }
  }

  private extractGeneric(
    node: Parser.SyntaxNode,
    content: string,
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: string[]
  ): void {
    // Generic extraction - look for common patterns
    const cursor = node.walk()
    
    do {
      const n = cursor.currentNode
      const type = n.type.toLowerCase()
      
      // Look for function-like patterns
      if (type.includes('function') || type.includes('method') || type.includes('def')) {
        const name = this.extractNodeText(n, content, 'name')
        if (name) {
          functions.push({
            id: `func-${name}-${n.startPosition.row}`,
            name,
            signature: name,
            startLine: n.startPosition.row,
            endLine: n.endPosition.row,
            complexity: 1,
          })
        }
      }
    } while (cursor.gotoNextSibling())
  }

  // Doc comment extractors
  private extractDocComment(node: Parser.SyntaxNode, content: string): string | undefined {
    // Look for JSDoc comment before node
    const prevSibling = node.previousSibling
    if (prevSibling && prevSibling.type === 'comment') {
      const comment = content.slice(prevSibling.startIndex, prevSibling.endIndex)
      if (comment.includes('/**') || comment.includes('/*')) {
        return comment.replace(/\/\*\*?\s*|\s*\*\/|\s*\*\s?/g, ' ').trim()
      }
    }
    return undefined
  }

  private extractPythonDocString(node: Parser.SyntaxNode, content: string): string | undefined {
    const bodyNode = node.childForFieldName('body')
    if (!bodyNode) return undefined
    
    const firstChild = bodyNode.firstChild
    if (firstChild && firstChild.type === 'expression_statement') {
      const stringNode = firstChild.firstChild
      if (stringNode && (stringNode.type === 'string' || stringNode.type === 'string_content')) {
        return content.slice(stringNode.startIndex, stringNode.endIndex).trim()
      }
    }
    return undefined
  }

  private extractRustDocComment(node: Parser.SyntaxNode, content: string): string | undefined {
    // Rust uses /// for doc comments
    let prev = node.previousSibling
    const docs: string[] = []
    
    while (prev && prev.type === 'line_comment') {
      const comment = content.slice(prev.startIndex, prev.endIndex)
      if (comment.startsWith('///')) {
        docs.unshift(comment.replace(/^\/\/\/\s?/, ''))
        prev = prev.previousSibling
      } else {
        break
      }
    }
    
    return docs.length > 0 ? docs.join(' ').trim() : undefined
  }

  private extractGoDocComment(node: Parser.SyntaxNode, content: string): string | undefined {
    // Go uses // for comments, usually no special doc format
    return undefined
  }

  private extractJavaDocComment(node: Parser.SyntaxNode, content: string): string | undefined {
    return this.extractDocComment(node, content)
  }

  private extractNodeText(node: Parser.SyntaxNode, content: string, fieldName: string): string | null {
    const child = node.childForFieldName(fieldName)
    if (!child) return null
    return content.slice(child.startIndex, child.endIndex)
  }

  detectLanguage(filePath: string): string | null {
    const ext = filePath.split('.').pop()?.toLowerCase()
    
    const extMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      sh: 'bash',
      bash: 'bash',
    }
    
    return extMap[ext || ''] || null
  }
}
