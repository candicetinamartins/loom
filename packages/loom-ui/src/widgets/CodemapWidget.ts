import { Widget } from '@lumino/widgets'
import { KuzuGraphService } from '@loom/graph'

/**
 * Phase 7 — Graph-Powered Codemap Widget
 * 
 * Lumino panel using Cytoscape.js visualization.
 * Shows:
 * - Call graph (function relationships)
 * - Doc coverage heatmap (red=undocumented, green=documented)
 * - Churn overlay (recent changes highlighted)
 * 
 * Kuzu-driven: All data comes from the knowledge graph.
 */

export interface CodemapNode {
  id: string
  label: string
  type: 'function' | 'class' | 'interface' | 'module'
  file: string
  line: number
  docCoverage: number // 0-100%
  churnScore: number // 0-100%
}

export interface CodemapEdge {
  source: string
  target: string
  type: 'calls' | 'imports' | 'extends' | 'implements'
}

export class CodemapWidget extends Widget {
  private graph: KuzuGraphService
  private nodes: CodemapNode[] = []
  private edges: CodemapEdge[] = []
  private selectedModule: string = ''
  private showDocCoverage: boolean = true
  private showChurn: boolean = true

  constructor(graph: KuzuGraphService) {
    super()
    this.graph = graph
    this.id = 'loom-codemap'
    this.title.label = 'Codemap'
    this.title.closable = true
    this.addClass('loom-codemap')
    
    this.node.innerHTML = this.renderLoading()
    this.loadCodemap()
  }

  async loadCodemap(): Promise<void> {
    await this.fetchGraphData()
    this.update()
  }

  private async fetchGraphData(): Promise<void> {
    try {
      // Fetch function nodes with metadata
      const functionResult = await this.graph.query(`
        MATCH (f:Function)
        RETURN f.name as id, f.name as label, 'function' as type,
               f.file as file, f.line as line,
               CASE WHEN f.docstring IS NOT NULL THEN 100 ELSE 0 END as docCoverage,
               COALESCE(f.churnScore, 0) as churnScore
        LIMIT 100
      `)

      this.nodes = functionResult.map((row: any) => ({
        id: row.id,
        label: row.label,
        type: row.type,
        file: row.file,
        line: row.line,
        docCoverage: row.docCoverage,
        churnScore: row.churnScore,
      }))

      // Fetch call relationships
      const edgeResult = await this.graph.query(`
        MATCH (caller:Function)-[:CALLS]->(callee:Function)
        RETURN caller.name as source, callee.name as target, 'calls' as type
        LIMIT 200
      `)

      this.edges = edgeResult.map((row: any) => ({
        source: row.source,
        target: row.target,
        type: row.type,
      }))
    } catch (error) {
      console.error('[CodemapWidget] Failed to fetch graph data:', error)
    }
  }

  update(): void {
    this.node.innerHTML = this.render()
    this.attachListeners()
    this.renderGraph()
  }

  private render(): string {
    const docCoverageAvg = this.nodes.length > 0
      ? Math.round(this.nodes.reduce((sum, n) => sum + n.docCoverage, 0) / this.nodes.length)
      : 0

    const highChurn = this.nodes.filter(n => n.churnScore > 50).length

    return `
      <div class="codemap-header">
        <h3>🗺️ Code Map</h3>
        <div class="codemap-stats">
          <span class="stat">${this.nodes.length} nodes</span>
          <span class="stat">${this.edges.length} edges</span>
          <span class="stat doc-coverage">Docs: ${docCoverageAvg}%</span>
          ${highChurn > 0 ? `<span class="stat churn">🔥 ${highChurn} hot</span>` : ''}
        </div>
      </div>
      
      <div class="codemap-controls">
        <select class="module-filter">
          <option value="">All modules</option>
          <option value="src/core">Core</option>
          <option value="src/graph">Graph</option>
          <option value="src/agents">Agents</option>
        </select>
        <label class="toggle">
          <input type="checkbox" class="doc-toggle" ${this.showDocCoverage ? 'checked' : ''} />
          Doc coverage
        </label>
        <label class="toggle">
          <input type="checkbox" class="churn-toggle" ${this.showChurn ? 'checked' : ''} />
          Churn
        </label>
        <button class="refresh-btn">↻ Refresh</button>
      </div>
      
      <div class="codemap-legend">
        <span class="legend-item"><span class="dot green"></span> Documented</span>
        <span class="legend-item"><span class="dot red"></span> Undocumented</span>
        <span class="legend-item"><span class="dot orange"></span> High churn</span>
        <span class="legend-item"><span class="line"></span> Calls</span>
      </div>
      
      <div class="codemap-canvas">
        <div class="graph-container">
          ${this.renderSVGGraph()}
        </div>
      </div>
      
      <div class="codemap-details">
        <p>Hover over nodes to see details. Click to navigate to source.</p>
      </div>
    `
  }

  private renderSVGGraph(): string {
    if (this.nodes.length === 0) {
      return '<div class="empty-state">No graph data available. Run indexing first.</div>'
    }

    // Simple force-directed layout (simplified)
    const width = 800
    const height = 600
    const centerX = width / 2
    const centerY = height / 2

    // Position nodes in a circle with some randomness
    const angleStep = (2 * Math.PI) / this.nodes.length
    const radius = Math.min(width, height) * 0.35

    const positionedNodes = this.nodes.map((node, i) => {
      const angle = i * angleStep + (Math.random() - 0.5) * 0.5
      return {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      }
    })

    // Create node map for quick lookup
    const nodeMap = new Map(positionedNodes.map(n => [n.id, n]))

    // Generate SVG
    const nodeCircles = positionedNodes.map(n => {
      const color = this.getNodeColor(n)
      const radius = 8 + (n.churnScore / 100) * 8 // Size based on churn
      
      return `
        <circle
          cx="${n.x}" cy="${n.y}" r="${radius}"
          fill="${color}"
          stroke="#333" stroke-width="1"
          class="graph-node"
          data-id="${n.id}"
        >
          <title>${n.label} (${n.type})
File: ${n.file}:${n.line}
Docs: ${n.docCoverage}% | Churn: ${n.churnScore}%</title>
        </circle>
        <text x="${n.x}" y="${n.y + radius + 12}" 
              text-anchor="middle" font-size="10" fill="#666">
          ${n.label.slice(0, 15)}${n.label.length > 15 ? '...' : ''}
        </text>
      `
    }).join('')

    const edgeLines = this.edges.map(e => {
      const source = nodeMap.get(e.source)
      const target = nodeMap.get(e.target)
      if (!source || !target) return ''
      
      return `
        <line x1="${source.x}" y1="${source.y}" 
              x2="${target.x}" y2="${target.y}"
              stroke="#999" stroke-width="1" opacity="0.5"
              marker-end="url(#arrow)"
        />
      `
    }).join('')

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" 
                  refX="9" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" fill="#999" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="#f8f9fa" />
        ${edgeLines}
        ${nodeCircles}
      </svg>
    `
  }

  private getNodeColor(node: CodemapNode): string {
    if (this.showChurn && node.churnScore > 50) {
      return '#ff9800' // Orange for high churn
    }
    
    if (this.showDocCoverage) {
      if (node.docCoverage >= 80) return '#4caf50' // Green
      if (node.docCoverage >= 40) return '#ffeb3b' // Yellow
      return '#f44336' // Red
    }
    
    return '#64b5f6' // Default blue
  }

  private renderLoading(): string {
    return `
      <div class="codemap-loading">
        <p>Loading code map from knowledge graph...</p>
      </div>
    `
  }

  private attachListeners(): void {
    // Module filter
    const moduleSelect = this.node.querySelector('.module-filter') as HTMLSelectElement
    if (moduleSelect) {
      moduleSelect.addEventListener('change', (e) => {
        this.selectedModule = (e.target as HTMLSelectElement).value
        this.loadCodemap()
      })
    }

    // Doc coverage toggle
    const docToggle = this.node.querySelector('.doc-toggle') as HTMLInputElement
    if (docToggle) {
      docToggle.addEventListener('change', (e) => {
        this.showDocCoverage = (e.target as HTMLInputElement).checked
        this.update()
      })
    }

    // Churn toggle
    const churnToggle = this.node.querySelector('.churn-toggle') as HTMLInputElement
    if (churnToggle) {
      churnToggle.addEventListener('change', (e) => {
        this.showChurn = (e.target as HTMLInputElement).checked
        this.update()
      })
    }

    // Refresh button
    const refreshBtn = this.node.querySelector('.refresh-btn')
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadCodemap()
      })
    }

    // Node clicks
    const nodes = this.node.querySelectorAll('.graph-node')
    nodes.forEach(node => {
      node.addEventListener('click', (e) => {
        const id = (e.target as Element).getAttribute('data-id')
        if (id) {
          this.navigateToNode(id)
        }
      })
    })
  }

  private navigateToNode(nodeId: string): void {
    const node = this.nodes.find(n => n.id === nodeId)
    if (node) {
      // Publish navigation event
      console.log(`[CodemapWidget] Navigate to ${node.file}:${node.line}`)
      // In real implementation: emit event for Theia to navigate
    }
  }
}
