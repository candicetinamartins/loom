import { injectable, inject } from 'inversify'

export interface SymbolReference {
  symbolName: string
  symbolType: 'function' | 'class' | 'variable' | 'interface' | 'type'
  filePath: string
  line: number
  column: number
  isDefinition: boolean
}

export interface CrossReference {
  source: SymbolReference
  target: SymbolReference
  referenceType: 'call' | 'import' | 'inherit' | 'implement' | 'type'
}

/**
 * LspCrossReferenceIndexer - Integrates with Theia LanguageClient for symbol references
 * 
 * Features:
 * - Extract symbol definitions from LSP
 * - Find references to symbols across codebase
 * - Build cross-reference graph for navigation
 */
@injectable()
export class LspCrossReferenceIndexer {
  constructor(
    @inject('LanguageClientContribution') private languageClient: any
  ) {}

  async getSymbolDefinitions(filePath: string): Promise<SymbolReference[]> {
    if (!this.languageClient) return []

    // LSP textDocument/documentSymbol request
    const uri = this.pathToUri(filePath)
    const response = await this.languageClient.sendRequest(
      'textDocument/documentSymbol',
      { textDocument: { uri } }
    )

    if (!Array.isArray(response)) return []

    return response.flatMap((sym: any) => this.flattenSymbol(sym, filePath))
  }

  async findReferences(symbol: SymbolReference): Promise<SymbolReference[]> {
    if (!this.languageClient) return []

    // LSP textDocument/references request
    const uri = this.pathToUri(symbol.filePath)
    const response = await this.languageClient.sendRequest(
      'textDocument/references',
      {
        textDocument: { uri },
        position: { line: symbol.line, character: symbol.column },
        context: { includeDeclaration: false },
      }
    )

    if (!Array.isArray(response)) return []

    return response.map((loc: any) => ({
      symbolName: symbol.symbolName,
      symbolType: symbol.symbolType,
      filePath: this.uriToPath(loc.uri),
      line: loc.range.start.line,
      column: loc.range.start.character,
      isDefinition: false,
    }))
  }

  async buildCrossReferenceGraph(): Promise<CrossReference[]> {
    if (!this.languageClient) return []

    // Use workspace/symbol to enumerate all definitions
    const wsSymbols = await this.languageClient.sendRequest(
      'workspace/symbol',
      { query: '' }
    )

    if (!Array.isArray(wsSymbols)) return []

    const xrefs: CrossReference[] = []

    for (const sym of wsSymbols) {
      const source: SymbolReference = {
        symbolName: sym.name,
        symbolType: this.lspKindToType(sym.kind),
        filePath: this.uriToPath(sym.location?.uri ?? ''),
        line: sym.location?.range?.start?.line ?? 0,
        column: sym.location?.range?.start?.character ?? 0,
        isDefinition: true,
      }

      const refs = await this.findReferences(source)
      for (const ref of refs) {
        xrefs.push({ source, target: ref, referenceType: 'call' })
      }
    }

    return xrefs
  }

  async indexWorkspace(): Promise<void> {
    console.log('[LspCrossReferenceIndexer] Workspace indexing started')
    await this.buildCrossReferenceGraph()
    console.log('[LspCrossReferenceIndexer] Workspace indexing complete')
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private pathToUri(filePath: string): string {
    return filePath.startsWith('file://') ? filePath : `file://${filePath.replace(/\\/g, '/')}`
  }

  private uriToPath(uri: string): string {
    return uri.replace(/^file:\/\//, '').replace(/\//g, require('path').sep)
  }

  private flattenSymbol(sym: any, filePath: string): SymbolReference[] {
    const self: SymbolReference = {
      symbolName: sym.name,
      symbolType: this.lspKindToType(sym.kind),
      filePath,
      line: sym.range?.start?.line ?? sym.location?.range?.start?.line ?? 0,
      column: sym.range?.start?.character ?? sym.location?.range?.start?.character ?? 0,
      isDefinition: true,
    }
    const children: SymbolReference[] = (sym.children ?? []).flatMap((c: any) => this.flattenSymbol(c, filePath))
    return [self, ...children]
  }

  /** Map LSP SymbolKind number to our union type */
  private lspKindToType(kind: number): SymbolReference['symbolType'] {
    // LSP SymbolKind: 5=Class, 6=Method, 12=Function, 13=Variable, 11=Interface, 9=Constructor
    switch (kind) {
      case 5: case 11: return 'class'
      case 6: case 9: case 12: return 'function'
      case 13: case 14: return 'variable'
      case 11: return 'interface'
      default: return 'type'
    }
  }
}
