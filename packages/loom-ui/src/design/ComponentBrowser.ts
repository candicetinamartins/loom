import { BaseWidget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'
import { AgentPanelWidget, AgentPanelData } from './AgentPanel'
import { FlowTimelineWidget, FlowTimelineData } from './FlowTimeline'
import { StatusBarWidget, StatusBarData } from './StatusBar'
import { GraphStatsBarWidget, GraphStatsData } from './GraphStatsBar'
import { VerifierStatusBarWidget, VerifierStatusData } from './VerifierStatusBar'
import { GhostTextWidget, GhostTextData } from './GhostText'
import { AgentCardData } from './AgentCard'

export class ComponentBrowserWidget extends BaseWidget {
  private _activeTab: string = 'agent-card'

  constructor() {
    super()
    this.addClass('loom-component-browser')
    this.title.caption = 'Loom Component Browser'
    this.update()
  }

  get activeTab(): string {
    return this._activeTab
  }

  set activeTab(tab: string) {
    this._activeTab = tab
    this.update()
  }

  protected update(): void {
    this.node.innerHTML = `
      <div class="browser-header">
        <h1>Loom Design System - Component Browser</h1>
        <p>View all Loom UI components in all states</p>
      </div>
      <div class="browser-tabs">
        <button class="tab ${this._activeTab === 'agent-card' ? 'active' : ''}" data-tab="agent-card">Agent Card</button>
        <button class="tab ${this._activeTab === 'agent-panel' ? 'active' : ''}" data-tab="agent-panel">Agent Panel</button>
        <button class="tab ${this._activeTab === 'flow-timeline' ? 'active' : ''}" data-tab="flow-timeline">Flow Timeline</button>
        <button class="tab ${this._activeTab === 'status-bar' ? 'active' : ''}" data-tab="status-bar">Status Bar</button>
        <button class="tab ${this._activeTab === 'graph-stats' ? 'active' : ''}" data-tab="graph-stats">Graph Stats</button>
        <button class="tab ${this._activeTab === 'verifier' ? 'active' : ''}" data-tab="verifier">Verifier</button>
        <button class="tab ${this._activeTab === 'ghost-text' ? 'active' : ''}" data-tab="ghost-text">Ghost Text</button>
      </div>
      <div class="browser-content"></div>
    `

    this.attachTabListeners()
    this.renderActiveTab()
  }

  private attachTabListeners(): void {
    const tabs = this.node.querySelectorAll('.tab')
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement
        this.activeTab = target.dataset.tab || 'agent-card'
      })
    })
  }

  private renderActiveTab(): void {
    const content = this.node.querySelector('.browser-content')
    if (!content) return

    switch (this._activeTab) {
      case 'agent-card':
        this.renderAgentCardStates(content)
        break
      case 'agent-panel':
        this.renderAgentPanel(content)
        break
      case 'flow-timeline':
        this.renderFlowTimeline(content)
        break
      case 'status-bar':
        this.renderStatusBar(content)
        break
      case 'graph-stats':
        this.renderGraphStats(content)
        break
      case 'verifier':
        this.renderVerifier(content)
        break
      case 'ghost-text':
        this.renderGhostText(content)
        break
    }
  }

  private renderAgentCardStates(container: HTMLElement): void {
    const states: AgentState[] = ['running', 'done', 'waiting', 'quarantined']
    
    container.innerHTML = `
      <h2>Agent Card - All States</h2>
      <div class="states-grid"></div>
    `

    const grid = container.querySelector('.states-grid')
    if (!grid) return

    states.forEach(state => {
      const cardData: AgentCardData = {
        agentName: `Agent ${state}`,
        state,
        stepCount: state === 'done' ? 5 : 2,
        maxSteps: 5,
        tokenUsage: { input: 1000, output: 500, total: 1500 },
        cost: 0.005,
        filesModified: ['src/file.ts', 'src/other.ts'],
      }

      const card = new AgentCardWidget(cardData)
      grid.appendChild(card.node)
    })
  }

  private renderAgentPanel(container: HTMLElement): void {
    const panelData: AgentPanelData = {
      agents: [
        {
          agentName: 'orchestrator',
          state: 'running',
          stepCount: 2,
          maxSteps: 5,
          tokenUsage: { input: 2000, output: 1000, total: 3000 },
          cost: 0.01,
          filesModified: [],
        },
        {
          agentName: 'engineer',
          state: 'done',
          stepCount: 5,
          maxSteps: 5,
          tokenUsage: { input: 5000, output: 3000, total: 8000 },
          cost: 0.025,
          filesModified: ['src/auth.ts', 'src/auth.test.ts'],
        },
        {
          agentName: 'security',
          state: 'waiting',
          stepCount: 0,
          maxSteps: 3,
          tokenUsage: { input: 0, output: 0, total: 0 },
          cost: 0,
          filesModified: [],
        },
        {
          agentName: 'qa',
          state: 'quarantined',
          stepCount: 2,
          maxSteps: 4,
          tokenUsage: { input: 1000, output: 500, total: 1500 },
          cost: 0.005,
          filesModified: ['src/auth.test.ts'],
        },
      ],
    }

    const panel = new AgentPanelWidget(panelData)
    container.innerHTML = '<h2>Agent Panel - Multiple Agents</h2>'
    container.appendChild(panel.node)
  }

  private renderFlowTimeline(container: HTMLElement): void {
    const timelineData: FlowTimelineData = {
      events: [
        { id: '1', type: 'edit', description: 'edited auth.ts', timestamp: Date.now() - 60000 },
        { id: '2', type: 'test-fail', description: 'test failed', timestamp: Date.now() - 30000 },
        { id: '3', type: 'terminal', description: 'ran tests', timestamp: Date.now() - 20000 },
        { id: '4', type: 'saved', description: 'saved auth.ts', timestamp: Date.now() - 10000 },
      ],
      intent: 'implementing JWT auth',
    }

    const timeline = new FlowTimelineWidget(timelineData)
    container.innerHTML = '<h2>Flow Timeline</h2>'
    container.appendChild(timeline.node)
  }

  private renderStatusBar(container: HTMLElement): void {
    const statusBarData: StatusBarData = {
      agentCount: 4,
      graphNodes: 12345,
      cost: 0.04,
      model: 'claude-sonnet-4-5',
      hunks: 3,
      mode: 'CODE',
      branch: 'feature/auth',
    }

    const statusBar = new StatusBarWidget(statusBarData)
    container.innerHTML = '<h2>Status Bar</h2>'
    container.appendChild(statusBar.node)
  }

  private renderGraphStats(container: HTMLElement): void {
    const graphStatsData: GraphStatsData = {
      functionCount: 234,
      docCoverage: 87,
      churnPath: 'src/auth.ts',
      memoryCount: 12,
      docsIndexed: true,
    }

    const graphStats = new GraphStatsBarWidget(graphStatsData)
    container.innerHTML = '<h2>Graph Stats Bar</h2>'
    container.appendChild(graphStats.node)
  }

  private renderVerifier(container: HTMLElement): void {
    const verifierData: VerifierStatusData = {
      passed: 8,
      quarantined: 1,
      retried: 2,
    }

    const verifier = new VerifierStatusBarWidget(verifierData)
    container.innerHTML = '<h2>Verifier Status Bar</h2>'
    container.appendChild(verifier.node)
  }

  private renderGhostText(container: HTMLElement): void {
    const ghostTextData: GhostTextData = {
      text: 'function authenticateUser(token: string) {',
      visible: true,
      position: { line: 10, column: 0 },
    }

    const ghostText = new GhostTextWidget(ghostTextData)
    container.innerHTML = '<h2>Ghost Text</h2>'
    container.appendChild(ghostText.node)
  }

  protected onResize(msg: Message): void {
    this.update()
  }
}
