import { injectable, inject, optional } from 'inversify'

export interface LspDiagnosticsInput {
  filePath?: string
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  line: number
  column: number
  source: string
  code?: string
}

export interface LspDiagnosticsOutput {
  filePath: string
  diagnostics: Diagnostic[]
  errorCount: number
  warningCount: number
}

// Service interface for Theia integration
export interface IProblemManager {
  getMarkers(uri: string): Promise<MarkerData[]>
}

export interface MarkerData {
  severity: number
  message: string
  data?: { range?: { start: { line: number; character: number } } }
  owner: string
}

export const TOOL_TYPES = {
  ProblemManager: Symbol.for('ProblemManager'),
}

@injectable()
export class LspDiagnosticsTool {
  readonly name = 'lsp_diagnostics'
  readonly description = 'Get LSP diagnostics for a file'

  constructor(
    @inject(TOOL_TYPES.ProblemManager) @optional() private problemManager?: IProblemManager
  ) {}

  async execute(input: LspDiagnosticsInput): Promise<LspDiagnosticsOutput> {
    const filePath = input.filePath ?? ''

    if (!this.problemManager) {
      return {
        filePath,
        diagnostics: [],
        errorCount: 0,
        warningCount: 0,
      }
    }

    try {
      const uri = this.toUri(filePath)
      const markers = await this.problemManager.getMarkers(uri)
      const diagnostics = markers.map(m => this.toDiagnostic(m))

      const errorCount = diagnostics.filter(d => d.severity === 'error').length
      const warningCount = diagnostics.filter(d => d.severity === 'warning').length

      return {
        filePath,
        diagnostics,
        errorCount,
        warningCount,
      }
    } catch {
      return {
        filePath,
        diagnostics: [],
        errorCount: 0,
        warningCount: 0,
      }
    }
  }

  private toUri(filePath: string): string {
    if (filePath.startsWith('file://')) return filePath
    if (filePath.startsWith('/')) return `file://${filePath}`
    return `file:///${filePath.replace(/\\/g, '/')}`
  }

  private toDiagnostic(marker: MarkerData): Diagnostic {
    const severityMap: Record<number, Diagnostic['severity']> = {
      1: 'error',
      2: 'warning',
      3: 'info',
      4: 'hint',
    }

    return {
      severity: severityMap[marker.severity] ?? 'info',
      message: marker.message,
      line: marker.data?.range?.start?.line ?? 0,
      column: marker.data?.range?.start?.character ?? 0,
      source: marker.owner,
    }
  }
}
