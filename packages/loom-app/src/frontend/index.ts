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
import { LoomKeybindingContribution } from './loom-keybindings'

// Runtime-only: get the actual Theia DI symbols from their definitive file paths.
// These are unique symbols (not Symbol.for) so they must be obtained via require().
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
const { FrontendApplicationContribution } = require('@theia/core/lib/browser/frontend-application-contribution') as { FrontendApplicationContribution: symbol }
const { KeybindingContribution } = require('@theia/core/lib/browser/keybinding') as { KeybindingContribution: symbol }
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
  // These two have onStart() that is structurally compatible with the interface:
  bindTo(FrontendApplicationContribution, LoomStatusBarContribution)
  bindTo(FrontendApplicationContribution, LoomThemeContribution)

  // ── KeybindingContribution ────────────────────────────────────────────────
  // Theia's KeybindingRegistry calls registerKeybindings() on every bound instance.
  bindTo(KeybindingContribution, LoomKeybindingContribution)

  // ── Services ──────────────────────────────────────────────────────────────
  bind(LoomStatusBarService).toSelf().inSingletonScope()
  bind(LOOM_STATUSBAR_SYMBOL).toService(LoomStatusBarService)
})
