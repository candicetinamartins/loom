// Loom Frontend Entry Point — loaded by Theia's DI container
// This is the single ContainerModule declared in loom-app's "theia.frontend.module".
// It registers ALL Loom frontend contributions using Theia's actual runtime symbols.
//
// NOTE: loom-app/src/typings/theia.d.ts stubs the @theia/core barrel exports as
// plain interfaces, hiding the const Symbol values from TypeScript. We therefore
// obtain the DI symbols via require() from specific sub-module paths where
// @theia/core exports them as unique symbols. Using 'as any' for bind() calls is
// intentional to avoid the resulting type mismatch.
import { ContainerModule } from 'inversify'
import { LoomFrontendContribution } from './loom-frontend-contribution'
import { LoomFlowContribution } from './loom-flow-contribution'
import { LoomFlowTimelineContribution } from './loom-flow-timeline'
import { LoomFlowContextContributor } from './loom-flow-context'
import { LoomStatusBarContribution } from './loom-status-bar'
import { LoomStatusBarService, LOOM_STATUSBAR_SYMBOL } from './loom-status-bar-service'
import { LoomThemeContribution } from './loom-theme-contribution'
import { LoomKeybindingContribution, LoomCommandContribution, LoomMenuContribution } from './loom-keybindings'
import { LoomAgentPanelContribution } from './loom-agent-panel-contribution'
import { LoomOpenHandler } from './loom-open-handler'
import { LoomOnboardingWizard } from './loom-onboarding'
import { LoomCodemapContribution } from './loom-codemap-contribution'
import { LoomVerifierStatusContribution } from './loom-verifier-status-contribution'
import { LoomGraphStatsContribution } from './loom-graph-stats-contribution'
import { LoomGhostTextContribution } from './loom-ghost-text-contribution'
import { LoomComponentBrowserContribution } from './loom-component-browser-contribution'
import { CheckpointContribution } from './checkpoint-contribution'
import { SessionEndContribution } from './session-end-contribution'
import { SaiaContribution } from './saia-contribution'
import { LoomChatContribution, CHAT_WIDGET_ID } from './loom-chat-contribution'
import { LoomChatWidget } from './loom-chat-widget'

// Import widget IDs from contributions
import { AGENT_PANEL_WIDGET_ID } from './loom-agent-panel-contribution'
import { AgentPanelWidget } from '@loom/ui'
import { CODEMAP_WIDGET_ID } from './loom-codemap-contribution'
import { CodemapWidget } from '@loom/ui'
import { COMPONENT_BROWSER_WIDGET_ID } from './loom-component-browser-contribution'
import { ComponentBrowserWidget } from '@loom/ui'
import { GHOST_TEXT_WIDGET_ID } from './loom-ghost-text-contribution'
import { GhostTextWidget } from '@loom/ui'
import { GRAPH_STATS_WIDGET_ID } from './loom-graph-stats-contribution'
import { GraphStatsBarWidget } from '@loom/ui'
import { VERIFIER_STATUS_WIDGET_ID } from './loom-verifier-status-contribution'
import { VerifierStatusBarWidget } from '@loom/ui'

// Runtime-only: get the actual Theia DI symbols from their definitive file paths.
// These are unique symbols (not Symbol.for) so they must be obtained via require().
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
const { FrontendApplicationContribution } = require('@theia/core/lib/browser/frontend-application-contribution') as { FrontendApplicationContribution: symbol }
const { KeybindingContribution } = require('@theia/core/lib/browser/keybinding') as { KeybindingContribution: symbol }
const { CommandContribution } = require('@theia/core/lib/common/command') as { CommandContribution: symbol }
const { MenuContribution } = require('@theia/core/lib/common/menu/menu-model-registry') as { MenuContribution: symbol }
const { OpenHandler } = require('@theia/core/lib/browser/opener-service') as { OpenHandler: symbol }
const { WidgetFactory } = require('@theia/core/lib/browser/widget-manager') as { WidgetFactory: symbol }
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

export default new ContainerModule((bind) => {
  // TypeScript type helpers are bypassed here because the type stubs in
  // theia.d.ts hide the ServiceIdentifier aspect of these symbols.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bindTo = (id: symbol, cls: new (...args: any[]) => any): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(bind as any)(id).to(cls).inSingletonScope()
  }

  // ── FrontendApplicationContribution ───────────────────────────────────────
  // Theia's FrontendApplication.start() calls onStart() on every bound instance.
  bindTo(FrontendApplicationContribution, LoomFrontendContribution)
  bindTo(FrontendApplicationContribution, LoomFlowContribution)
  bindTo(FrontendApplicationContribution, LoomFlowTimelineContribution)
  bindTo(FrontendApplicationContribution, LoomFlowContextContributor)
  bindTo(FrontendApplicationContribution, LoomStatusBarContribution)
  bindTo(FrontendApplicationContribution, LoomThemeContribution)
  bindTo(FrontendApplicationContribution, LoomAgentPanelContribution)
  bindTo(FrontendApplicationContribution, LoomCodemapContribution)
  bindTo(FrontendApplicationContribution, LoomVerifierStatusContribution)
  bindTo(FrontendApplicationContribution, LoomGraphStatsContribution)
  bindTo(FrontendApplicationContribution, LoomGhostTextContribution)
  bindTo(FrontendApplicationContribution, LoomComponentBrowserContribution)

  // ── SAIA (Academic Cloud LLM) — dual-bound (FrontendApp + Command) ────────
  bind(SaiaContribution).toSelf().inSingletonScope()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(FrontendApplicationContribution).toService(SaiaContribution)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(CommandContribution).toService(SaiaContribution)

  // ── Session-end approval prompt ───────────────────────────────────────────
  // Polls /loom/session/pending-approval and shows an Approve/Discard dialog
  // when Haiku-extracted memories are waiting for user promotion to Tier 3.
  bindTo(FrontendApplicationContribution, SessionEndContribution)

  // ── CheckpointContribution — dual-bound (FrontendApp + Command) ───────────
  // Must use toSelf().inSingletonScope() first, then toService() for secondary
  // bindings, so Theia creates exactly one instance.
  bind(CheckpointContribution).toSelf().inSingletonScope()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(FrontendApplicationContribution).toService(CheckpointContribution)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(CommandContribution).toService(CheckpointContribution)

  // ── CommandContribution ──────────────────────────────────────────────────
  // Registers all Loom commands in Theia's command palette and menu system.
  bindTo(CommandContribution, LoomCommandContribution)

  // ── MenuContribution ───────────────────────────────────────────────────────
  // Registers Loom menu structure in Theia's menu bar.
  bindTo(MenuContribution, LoomMenuContribution)

  // ── KeybindingContribution ────────────────────────────────────────────────
  // Theia's KeybindingRegistry calls registerKeybindings() on every bound instance.
  bindTo(KeybindingContribution, LoomKeybindingContribution)

  // ── OpenHandler ───────────────────────────────────────────────────────────
  // Handles opening loom:// URIs and .loom files.
  bindTo(OpenHandler, LoomOpenHandler)

  // ── LoomChat ──────────────────────────────────────────────────────────────
  // Custom chat panel replacing Theia's built-in AI chat
  // Per Theia docs: bind widget to self, then register WidgetFactory
  bind(LoomChatWidget).toSelf().inSingletonScope()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(WidgetFactory).toDynamicValue((ctx: { container: { get: <T>(s: unknown) => T } }) => ({
    id: CHAT_WIDGET_ID,
    createWidget: () => ctx.container.get(LoomChatWidget),
  })).inSingletonScope()
  bind(LoomChatContribution).toSelf().inSingletonScope()
  ;(bind as any)(FrontendApplicationContribution).toService(LoomChatContribution)

  // ── View Widget Factories ───────────────────────────────────────────────────
  // Required for AbstractViewContribution to work - each view needs a factory

  // Agent Panel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(WidgetFactory).toDynamicValue(() => ({
    id: AGENT_PANEL_WIDGET_ID,
    createWidget: () => new AgentPanelWidget({ agents: [] }),
  })).inSingletonScope()

  // Codemap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(WidgetFactory).toDynamicValue(() => ({
    id: CODEMAP_WIDGET_ID,
    createWidget: () => new CodemapWidget({ query: async () => [] }),
  })).inSingletonScope()

  // Component Browser
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(WidgetFactory).toDynamicValue(() => ({
    id: COMPONENT_BROWSER_WIDGET_ID,
    createWidget: () => new ComponentBrowserWidget(),
  })).inSingletonScope()

  // Ghost Text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(WidgetFactory).toDynamicValue(() => ({
    id: GHOST_TEXT_WIDGET_ID,
    createWidget: () => new GhostTextWidget({ text: '', visible: false, position: { line: 0, column: 0 } }),
  })).inSingletonScope()

  // Graph Stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(WidgetFactory).toDynamicValue(() => ({
    id: GRAPH_STATS_WIDGET_ID,
    createWidget: () => new GraphStatsBarWidget({
      functionCount: 0, docCoverage: 0, churnPath: '', memoryCount: 0, docsIndexed: false
    }),
  })).inSingletonScope()

  // Verifier Status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bind as any)(WidgetFactory).toDynamicValue(() => ({
    id: VERIFIER_STATUS_WIDGET_ID,
    createWidget: () => new VerifierStatusBarWidget({
      passed: 0, quarantined: 0, retried: 0
    }),
  })).inSingletonScope()

  // ── Services ──────────────────────────────────────────────────────────────
  bind(LoomStatusBarService).toSelf().inSingletonScope()
  bind(LOOM_STATUSBAR_SYMBOL).toService(LoomStatusBarService)
  bind(LoomOnboardingWizard).toSelf().inSingletonScope()
})
