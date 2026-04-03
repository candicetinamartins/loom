import { BaseWidget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export interface GraphStatsData {
  functionCount: number
  docCoverage: number
  churnPath: string
  memoryCount: number
  docsIndexed: boolean
  protocolCompliance?: number // Phase 2C: Token protocol compliance %
}

export class GraphStatsBarWidget extends BaseWidget {
  private _data: GraphStatsData

  constructor(data: GraphStatsData) {
    super()
    this._data = data
    this.addClass('loom-graph-stats-bar')
    this.update()
  }

  get data(): GraphStatsData {
    return this._data
  }

  set data(data: GraphStatsData) {
    this._data = data
    this.update()
  }

  protected update(): void {
    const { functionCount, docCoverage, churnPath, memoryCount, docsIndexed, protocolCompliance } = this._data

    // Format protocol compliance with color indicator
    let complianceHtml = ''
    if (protocolCompliance !== undefined) {
      const percentage = Math.round(protocolCompliance * 100)
      const complianceClass = percentage >= 95 ? 'good' : percentage >= 80 ? 'warning' : 'bad'
      complianceHtml = `<span class="stat-item protocol ${complianceClass}">protocol ${percentage}%</span>`
    }

    this.node.innerHTML = `
      <div class="graph-stats-content">
        <span class="stat-item">funcs ${functionCount.toLocaleString()}</span>
        <span class="stat-item doc-coverage">doc% ${docCoverage}%</span>
        ${complianceHtml}
        <span class="stat-item churn">churn↑ ${churnPath}</span>
        <span class="stat-item memory">mem ${memoryCount}</span>
        <span class="stat-item docs ${docsIndexed ? 'indexed' : ''}">docs ${docsIndexed ? '✓' : '⋯'}</span>
      </div>
    `
  }

  protected onResize(msg: Message): void {
    this.update()
  }
}
