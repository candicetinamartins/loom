import { GraphNode } from '../GraphService'

/**
 * GraphContextFormatter - Compact notation for graph context injection
 * 
 * Formats graph nodes and edges in notation LLMs understand from training data:
 * - fn:functionName (path:line) cmplx:N doc_coverage:N%
 * - cls:ClassName (path) methods:N
 * - pkg:package@version local_docs:✓
 * - →[REL] target
 * - ←[REL] source
 * 
 * Saves ~70% tokens vs prose descriptions.
 */

export interface FunctionNode extends GraphNode {
  type: 'Function'
  name: string
  path: string
  start_line: number
  complexity: number
  doc_coverage: number
  exported: boolean
}

export interface ClassNode extends GraphNode {
  type: 'Class'
  name: string
  path: string
  method_count?: number
}

export interface PackageNode extends GraphNode {
  type: 'Package'
  name: string
  version: string
  local_docs: boolean
}

export interface ModuleNode extends GraphNode {
  type: 'Module'
  path: string
  doc_coverage: number
  function_count: number
}

export interface MemoryNode extends GraphNode {
  type: 'Memory'
  content: string
  timestamp: number
}

export class GraphContextFormatter {
  /**
   * Format a function node in compact notation
   */
  formatFunction(f: FunctionNode): string {
    const coverage = f.doc_coverage === 0
      ? '⚠no-docs'
      : `docs:${Math.round(f.doc_coverage * 100)}%`
    
    const exported = f.exported ? 'exported ' : ''
    
    return `fn:${f.name} (${f.path}:${f.start_line}) ${exported}cmplx:${f.complexity} ${coverage}`
  }

  /**
   * Format a class node
   */
  formatClass(c: ClassNode): string {
    const methods = c.method_count ? ` methods:${c.method_count}` : ''
    return `cls:${c.name} (${c.path})${methods}`
  }

  /**
   * Format a package node
   */
  formatPackage(p: PackageNode): string {
    const docs = p.local_docs ? '✓' : '✗'
    return `pkg:${p.name}@${p.version} local_docs:${docs}`
  }

  /**
   * Format a module node
   */
  formatModule(m: ModuleNode): string {
    return `mod:${m.path} funcs:${m.function_count} doc%:${Math.round(m.doc_coverage * 100)}%`
  }

  /**
   * Format an edge
   */
  formatEdge(from: string, rel: string, to: string, direction: 'out' | 'in' = 'out'): string {
    const arrow = direction === 'out' ? '→' : '←'
    return `  ${arrow}[${rel}] ${to}`
  }

  /**
   * Format a memory node
   */
  formatMemory(m: MemoryNode): string {
    return `[mem:${this.relativeTime(m.timestamp)}] ${m.content.slice(0, 120)}`
  }

  /**
   * Format a full neighbourhood (nodes + edges)
   */
  formatNeighbourhood(
    nodes: GraphNode[],
    edges: Array<{ from: string; to: string; type: string; direction: 'out' | 'in' }>,
  ): string {
    const nodeLines = nodes.map(n => {
      if (n.type === 'Function') return this.formatFunction(n as FunctionNode)
      if (n.type === 'Class') return this.formatClass(n as ClassNode)
      if (n.type === 'Package') return this.formatPackage(n as PackageNode)
      if (n.type === 'Module') return this.formatModule(n as ModuleNode)
      if (n.type === 'Memory') return this.formatMemory(n as MemoryNode)
      return `${n.type.toLowerCase()}:${n.name || n.id}`
    })

    const edgeLines = edges.map(e =>
      this.formatEdge(e.from, e.type, e.to, e.direction)
    )

    return [...nodeLines, ...edgeLines].join('\n')
  }

  /**
   * Format context for agent injection (full section)
   */
  formatContextSection(
    functions: FunctionNode[],
    classes: ClassNode[],
    packages: PackageNode[],
    memories: MemoryNode[],
    edges: Array<{ from: string; to: string; type: string; direction: 'out' | 'in' }>,
  ): string {
    const lines: string[] = ['[KNOWLEDGE GRAPH]', '']

    if (functions.length > 0) {
      lines.push('Functions:')
      functions.forEach(f => lines.push(this.formatFunction(f)))
      lines.push('')
    }

    if (classes.length > 0) {
      lines.push('Classes:')
      classes.forEach(c => lines.push(this.formatClass(c)))
      lines.push('')
    }

    if (packages.length > 0) {
      lines.push('Packages:')
      packages.forEach(p => lines.push(this.formatPackage(p)))
      lines.push('')
    }

    if (edges.length > 0) {
      lines.push('Relationships:')
      edges.forEach(e => lines.push(this.formatEdge(e.from, e.type, e.to, e.direction)))
      lines.push('')
    }

    if (memories.length > 0) {
      lines.push('Project memories:')
      memories.forEach(m => lines.push(this.formatMemory(m)))
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Format a simplified call graph
   */
  formatCallGraph(caller: FunctionNode, callees: FunctionNode[]): string {
    const lines = [this.formatFunction(caller), '  calls:']
    callees.forEach(c => lines.push(`    · ${c.name}`))
    return lines.join('\n')
  }

  /**
   * Format documentation coverage summary
   */
  formatDocCoverage(modules: ModuleNode[]): string {
    const totalFuncs = modules.reduce((s, m) => s + m.function_count, 0)
    const avgCoverage = modules.reduce((s, m) => s + m.doc_coverage, 0) / modules.length

    return `Documentation: ${Math.round(avgCoverage * 100)}% overall · ${totalFuncs} functions across ${modules.length} modules`
  }

  /**
   * Format complexity hotspots
   */
  formatComplexityHotspots(functions: FunctionNode[], threshold = 10): string {
    const hotspots = functions.filter(f => f.complexity > threshold)
    
    if (hotspots.length === 0) {
      return 'Complexity: No hotspots above threshold'
    }

    const lines = ['Complexity hotspots:']
    hotspots
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 5)
      .forEach(f => {
        lines.push(`  · ${f.name} (cmplx:${f.complexity}) — ${f.path}:${f.start_line}`)
      })
    
    return lines.join('\n')
  }

  /**
   * Convert timestamp to relative time string
   */
  private relativeTime(ts: number): string {
    const days = Math.round((Date.now() - ts) / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return '1d'
    if (days < 7) return `${days}d`
    if (days < 30) return `${Math.round(days / 7)}w`
    return `${Math.round(days / 30)}mo`
  }
}
