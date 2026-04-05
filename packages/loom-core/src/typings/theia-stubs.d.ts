// ============================================================================
// Consolidated Theia Type Stubs
// ============================================================================
// This file contains all Theia framework type stubs used for CI builds.
// This is the single source of truth for Theia types across the monorepo.
// ============================================================================

// ----------------------------------------------------------------------------
// @theia/core - Browser (Frontend)
// ----------------------------------------------------------------------------

declare module '@theia/core/lib/browser' {
  export interface FrontendApplicationContribution {
    onStart?(): void | Promise<void>
    onStop?(): void | Promise<void>
  }
  export const FrontendApplicationContribution: symbol

  export const StatusBarAlignment: {
    LEFT: 0
    RIGHT: 1
  }
}

declare module '@theia/core/lib/browser/status-bar/status-bar' {
  export interface StatusBar {
    setElement(id: string, element: any): void
    removeElement(id: string): void
  }
  export const StatusBar: symbol
}

declare module '@theia/core/lib/browser/keybinding' {
  export interface KeybindingContribution {
    registerKeybindings?(keybindings: KeybindingRegistry): void
  }
  export interface KeybindingRegistry {
    registerKeybinding(keybinding: any): void
  }
  export const KeybindingContribution: symbol
}

declare module '@theia/core/lib/common/command' {
  export interface CommandRegistry {
    registerCommand(command: any, handler: any): void
  }
  export const CommandRegistry: symbol
}

declare module '@theia/core/lib/browser/theming' {
  export interface Theme {
    id: string
    label: string
    type: 'dark' | 'light' | 'hc'
    editorTheme: string
  }
  export interface ThemeService {
    register(theme: Theme): void
    getCurrentTheme(): Theme
  }
  export const ThemeService: symbol
}

declare module '@theia/core/lib/browser/quick-input/quick-input-service' {
  export interface QuickInputService {
    showQuickPick<T>(items: T[], options?: any): Promise<T | undefined>
    showInput(options?: any): Promise<string | undefined>
  }
  export const QuickInputService: symbol
}

// ----------------------------------------------------------------------------
// @theia/core - Node (Backend)
// ----------------------------------------------------------------------------
// @theia/core/lib/node
// ----------------------------------------------------------------------------

declare module '@theia/core/lib/node' {
  export interface BackendApplicationContribution {
    onStart?(container?: any): void | Promise<void>
    onStop?(): void | Promise<void>
  }
  export const BackendApplicationContribution: symbol

  export class BackendApplication {
    constructor(serverModule: unknown, opts?: unknown)
    start(): Promise<void>
  }
}

declare module '@theia/core/lib/node/backend-application-config-provider' {
  export class BackendApplicationConfigProvider {
    static set(config: { singleInstance?: boolean; [key: string]: unknown }): void
    static get(): { singleInstance?: boolean; [key: string]: unknown }
  }
}

declare module '@theia/core/lib/node/messaging/ipc-protocol' {
  const serverModule: unknown
  export = serverModule
}

// ----------------------------------------------------------------------------
// @theia/core - Re-exports
// ----------------------------------------------------------------------------

declare module '@theia/core' {
  export { CommandRegistry } from '@theia/core/lib/common/command'
  export { Theme, ThemeService } from '@theia/core/lib/browser/theming'

  export interface Disposable {
    dispose(): void
  }
}

// ----------------------------------------------------------------------------
// @theia/ai-core
// ----------------------------------------------------------------------------

declare module '@theia/ai-core/lib/common' {
  export interface Agent {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly variables?: any[]
    readonly prompts?: any[]
    readonly languageModelRequirements?: any[]
    readonly agentSpecificVariables?: any[]
    readonly functions?: any[]
  }

  export interface ToolCallResult {
    result?: string
    content?: string | Array<{ type: string; text?: string }>
    isError?: boolean
  }

  export interface ToolInvocationContext {
    sessionId?: string
    agentId?: string
    [key: string]: unknown
  }

  export interface ToolRequest {
    id: string
    name: string
    description: string
    parameters?: {
      type: string
      properties?: Record<string, { type: string; description?: string; enum?: string[] }>
      required?: string[]
    }
    handler(arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult>
  }

  export interface ToolProvider {
    getTool(): ToolRequest
  }
}

declare module '@theia/ai-core/lib/browser/agent-service' {
  export interface Agent {
    id: string
    name: string
    description?: string
  }

  export class AgentService {
    getAgents(): Agent[]
    getAgent(id: string): Agent | undefined
    registerAgent(agent: Agent): void
  }
}

// ----------------------------------------------------------------------------
// @theia/ai-chat
// ----------------------------------------------------------------------------

declare module '@theia/ai-chat/lib/common/chat-model' {
  export interface ChatRequest {
    messages?: Array<{ role?: string; content?: string }>
    metadata?: Record<string, any>
    [key: string]: any
  }

  export interface ParsedChatRequest extends ChatRequest {
    text: string
  }
}

declare module '@theia/ai-chat/lib/browser/chat-agent-service' {
  export class ChatAgentService {
    sendMessage(agentId: string, message: string): Promise<string>
    resolveAgent(...args: any[]): Promise<unknown>
  }
}

declare module '@theia/ai-chat/lib/common/chat-agent-service' {
  export class ChatAgentService {
    sendMessage(agentId: string, message: string): Promise<string>
    resolveAgent(...args: any[]): Promise<unknown>
  }
}

// ----------------------------------------------------------------------------
// @theia/filesystem
// ----------------------------------------------------------------------------

declare module '@theia/filesystem/lib/browser/file-service' {
  export interface FileChange {
    resource: { path: string; fsPath: string; toString(): string }
    type: number
  }

  export interface FileChangesEvent {
    changes: FileChange[]
  }

  export class FileService {
    onDidFilesChange(callback: (event: FileChangesEvent) => void): { dispose(): void }
  }
}

// ----------------------------------------------------------------------------
// @theia/terminal
// ----------------------------------------------------------------------------

declare module '@theia/terminal/lib/browser/base/terminal-service' {
  export interface TerminalService {
    onDidCreateTerminal: any
    createTerminal(options?: any): any
  }
}

declare module '@theia/terminal/lib/browser/terminal-service' {
  export class TerminalService {
    onDidWriteData(callback: (data: string) => void): { dispose(): void }
  }
}

// ----------------------------------------------------------------------------
// @theia/editor
// ----------------------------------------------------------------------------

declare module '@theia/editor/lib/browser/editor-manager' {
  export interface EditorManager {
    onCurrentEditorChanged: any
    onCreated: any
  }
}

// ----------------------------------------------------------------------------
// @theia/monaco
// ----------------------------------------------------------------------------

declare module '@theia/monaco/lib/browser/monaco-editor' {
  export interface MonacoEditor {
    onSelectionChanged: any
    document: any
  }
}

// ----------------------------------------------------------------------------
// @theia/git
// ----------------------------------------------------------------------------

declare module '@theia/git/lib/browser/git-contribution' {
  export interface GitContribution {
    onDidChange: any
  }
}

// ----------------------------------------------------------------------------
// @theia/markers
// ----------------------------------------------------------------------------

declare module '@theia/markers/lib/browser/problem/problem-manager' {
  export interface ProblemManager {
    onDidChangeMarkers: any
    findMarkers(filter: any): any[]
  }
}

// ----------------------------------------------------------------------------
// @theia/test
// ----------------------------------------------------------------------------

declare module '@theia/test/lib/browser/test-service' {
  export interface TestService {
    onDidChangeTestState: any
  }
}

// ----------------------------------------------------------------------------
// @lumino/widgets
// ----------------------------------------------------------------------------

declare module '@lumino/messaging' {
  export class Message {
    readonly type: string
    constructor(type: string)
  }

  export class ResizeMessage extends Message {
    readonly width: number
    readonly height: number
    constructor(width: number, height: number)
  }
}

declare module '@lumino/widgets' {
  import { Message } from '@lumino/messaging'

  export class Widget {
    readonly node: HTMLElement
    id: string
    title: Widget.Title
    isAttached: boolean
    isVisible: boolean
    isDisposed: boolean

    constructor(options?: Widget.IOptions)
    addClass(name: string): void
    removeClass(name: string): void
    update(): void
    dispose(): void
    activate(): void

    protected onAfterAttach(msg: Message): void
    protected onBeforeDetach(msg: Message): void
    protected onCloseRequest(msg: Message): void
    protected onResize(msg: Widget.ResizeMessage): void
    protected onUpdateRequest(msg: Message): void
    protected onActivateRequest(msg: Message): void
  }

  export namespace Widget {
    interface IOptions {
      node?: HTMLElement
    }

    class Title {
      label: string
      caption?: string
      iconClass?: string
      closable?: boolean
    }

    class ResizeMessage extends Message {
      readonly width: number
      readonly height: number
      constructor(width: number, height: number)
    }
  }
}
